"""
AI-агент автоматической разноски + журнал хозяйственных операций КР (МСФО).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_
from database import get_db
from models import Document, JournalEntry, ChartOfAccount, PostingRule, Company
from routers.auth import get_current_user
from models import User
import anthropic, json, os
from datetime import date, datetime
from typing import Optional

router = APIRouter()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def get_chart_summary(db: Session) -> str:
    accounts = db.query(ChartOfAccount).filter(
        ChartOfAccount.level == 3, ChartOfAccount.is_active == True
    ).order_by(ChartOfAccount.code).all()
    if not accounts:
        return "План счетов не загружен."
    return "\n".join(f"{a.code} | {a.name} | {a.account_type}" for a in accounts)


def get_posting_rules_summary(db: Session) -> str:
    rules = db.query(PostingRule).filter(
        PostingRule.is_active == True
    ).order_by(PostingRule.priority.desc()).all()
    if not rules:
        return "Правила не загружены."
    lines = []
    for r in rules:
        kw = ", ".join(r.operation_keywords or [])
        lines.append(f"- {r.rule_name}: Дт {r.debit_account} / Кт {r.credit_account} | КС: {kw}")
    return "\n".join(lines)


class DuplicatePostingError(Exception):
    def __init__(self, entry: 'JournalEntry'):
        self.entry = entry

def post_document_with_ai(doc: Document, db: Session) -> JournalEntry:
    # ── ЗАЩИТА ОТ ПОВТОРНОЙ РАЗНОСКИ ──────────────────────────
    # Проверка 1: уже есть проводка для этого document_id
    existing_by_doc = db.query(JournalEntry).filter(
        JournalEntry.document_id == doc.id,
        JournalEntry.status.in_(["posted", "needs_review"])
    ).first()
    if existing_by_doc:
        raise DuplicatePostingError(existing_by_doc)

    # Проверка 2: аналогичный документ уже разнесён
    # (одинаковые: компания + сумма + валюта + дата + контрагент + тип)
    if doc.amount and doc.doc_date and doc.counterparty:
        existing_by_attrs = db.query(JournalEntry).join(
            Document, JournalEntry.document_id == Document.id
        ).filter(
            JournalEntry.company_id == doc.company_id,
            JournalEntry.status.in_(["posted", "needs_review"]),
            Document.amount == doc.amount,
            Document.currency == doc.currency,
            Document.counterparty == doc.counterparty,
            Document.doc_type == doc.doc_type,
            Document.id != doc.id
        ).first()
        if existing_by_attrs:
            raise DuplicatePostingError(existing_by_attrs)
    # ── КОНЕЦ ЗАЩИТЫ ──────────────────────────────────────────

    chart_summary = get_chart_summary(db)
    rules_summary = get_posting_rules_summary(db)

    prompt = f"""Ты — профессиональный бухгалтер КР, специалист МСФО.
Определи бухгалтерскую проводку для документа по плану счетов КР.

## ДОКУМЕНТ
Тип: {doc.doc_type}
Номер: {doc.doc_number or '—'}
Дата: {doc.doc_date or '—'}
Контрагент: {doc.counterparty or '—'}
ИНН контрагента: {doc.counterparty_inn or '—'}
Сумма: {doc.amount or 0} {doc.currency or 'KGS'}
НДС: {doc.vat_amount or 0}
Тип операции: {doc.operation_type or '—'}
Описание: {doc.ai_summary or doc.ai_raw_text or '—'}

## ПЛАН СЧЕТОВ КР (МСФО)
{chart_summary}

## ПРАВИЛА РАЗНОСКИ
{rules_summary}

Компания: торгово-импортная деятельность (КР).
Верни ТОЛЬКО JSON:
{{
  "debit_account": "XXXX",
  "credit_account": "XXXX",
  "debit_account_name": "название",
  "credit_account_name": "название",
  "amount": число,
  "currency": "KGS/RUB/USD/EUR/TRY",
  "description": "краткое содержание операции для журнала",
  "confidence": 0-100,
  "reasoning": "обоснование (1-2 предложения)",
  "needs_review": true/false
}}"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = response.content[0].text.strip()

    try:
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
    except Exception:
        result = {
            "debit_account": "7590", "credit_account": "3210",
            "debit_account_name": "Прочие операционные расходы",
            "credit_account_name": "Счета к оплате поставщикам",
            "amount": doc.amount or 0, "currency": doc.currency or "KGS",
            "description": "Не удалось разобрать ответ AI",
            "confidence": 0, "reasoning": "Ошибка парсинга", "needs_review": True
        }

    doc.debit_account = result.get("debit_account")
    doc.credit_account = result.get("credit_account")
    doc.ai_confidence = result.get("confidence", 0)
    doc.posting_status = "needs_review" if result.get("needs_review") else "posted"
    db.add(doc)

    # Конвертация в KGS только если валюта не KGS
    amount = result.get("amount", doc.amount or 0)
    currency = result.get("currency", doc.currency or "KGS")
    amount_kgs = float(amount) if currency == "KGS" else None  # TODO: курс НБКР

    entry = JournalEntry(
        company_id=doc.company_id,
        document_id=doc.id,
        entry_date=doc.doc_date.date() if doc.doc_date else date.today(),
        debit_account=result.get("debit_account"),
        credit_account=result.get("credit_account"),
        debit_account_name=result.get("debit_account_name"),
        credit_account_name=result.get("credit_account_name"),
        amount=amount,
        currency=currency,
        amount_kgs=amount_kgs,
        description=result.get("description"),
        ai_confidence=result.get("confidence", 0),
        ai_reasoning=result.get("reasoning"),
        status="needs_review" if result.get("needs_review") else "posted"
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ── ENDPOINTS ────────────────────────────────────────────

@router.post("/auto/{document_id}")
def auto_post_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    company = db.query(Company).filter(Company.id == doc.company_id, Company.owner_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")
    try:
        entry = post_document_with_ai(doc, db)
    except DuplicatePostingError as e:
        raise HTTPException(status_code=409, detail={
            "error": "duplicate",
            "message": f"Документ уже разнесён (проводка #{e.entry.id})",
            "existing_entry_id": e.entry.id,
            "existing_status": e.entry.status,
            "debit": e.entry.debit_account,
            "credit": e.entry.credit_account,
            "amount": float(e.entry.amount),
            "currency": e.entry.currency
        })
    return {
        "success": True, "document_id": document_id, "entry_id": entry.id,
        "debit": f"{entry.debit_account} {entry.debit_account_name}",
        "credit": f"{entry.credit_account} {entry.credit_account_name}",
        "amount": float(entry.amount), "currency": entry.currency,
        "confidence": entry.ai_confidence, "status": entry.status,
        "description": entry.description, "reasoning": entry.ai_reasoning
    }


@router.post("/auto-all")
def auto_post_all(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    company = db.query(Company).filter(Company.id == company_id, Company.owner_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")
    docs = db.query(Document).filter(
        Document.company_id == company_id,
        Document.posting_status == "pending",
        Document.amount != None
    ).all()
    results, errors, skipped = [], [], []
    for doc in docs:
        try:
            entry = post_document_with_ai(doc, db)
            results.append({
                "document_id": doc.id, "doc_number": doc.doc_number,
                "debit": entry.debit_account, "credit": entry.credit_account,
                "amount": float(entry.amount), "currency": entry.currency,
                "confidence": entry.ai_confidence, "status": entry.status
            })
        except DuplicatePostingError as e:
            skipped.append({
                "document_id": doc.id,
                "doc_number": doc.doc_number,
                "reason": f"Уже разнесён (проводка #{e.entry.id}, статус: {e.entry.status})"
            })
        except Exception as e:
            errors.append({"document_id": doc.id, "error": str(e)})
    return {
        "processed": len(results),
        "skipped_duplicates": len(skipped),
        "errors": len(errors),
        "results": results,
        "skipped": skipped,
        "error_details": errors
    }


@router.get("/journal")
def get_journal(
    company_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    counterparty: Optional[str] = None,
    debit_account: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Журнал хозяйственных операций с полными реквизитами."""
    company = db.query(Company).filter(Company.id == company_id, Company.owner_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    q = db.query(JournalEntry, Document).outerjoin(
        Document, JournalEntry.document_id == Document.id
    ).filter(JournalEntry.company_id == company_id)

    if date_from:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(JournalEntry.entry_date <= date_to)
    if status:
        q = q.filter(JournalEntry.status == status)
    if debit_account:
        q = q.filter(JournalEntry.debit_account == debit_account)

    rows = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).all()

    result = []
    for i, (e, doc) in enumerate(rows):
        # Фильтр по контрагенту через документ
        if counterparty and doc and counterparty.lower() not in (doc.counterparty or "").lower():
            continue
        result.append({
            "row_num": len(rows) - i,          # № п/п (обратный порядок)
            "id": e.id,
            "entry_date": str(e.entry_date),
            # Реквизиты документа-основания
            "doc_number": doc.doc_number if doc else None,
            "doc_type": doc.doc_type if doc else None,
            "doc_date": str(doc.doc_date)[:10] if doc and doc.doc_date else None,
            "counterparty": doc.counterparty if doc else None,
            "counterparty_inn": doc.counterparty_inn if doc else None,
            # Бухгалтерские данные
            "description": e.description,
            "debit_account": e.debit_account,
            "debit_account_name": e.debit_account_name,
            "credit_account": e.credit_account,
            "credit_account_name": e.credit_account_name,
            "amount": float(e.amount),
            "currency": e.currency,
            "amount_kgs": float(e.amount_kgs) if e.amount_kgs else (float(e.amount) if e.currency == "KGS" else None),
            "exchange_rate": float(e.exchange_rate) if e.exchange_rate else None,
            # AI данные
            "ai_confidence": e.ai_confidence,
            "ai_reasoning": e.ai_reasoning,
            "status": e.status,
            "document_id": e.document_id,
            "reviewed_by": e.reviewed_by,
            "reviewed_at": str(e.reviewed_at) if e.reviewed_at else None,
            "created_at": str(e.created_at)
        })
    return result


@router.get("/daily-report")
def get_daily_report(
    company_id: int,
    report_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    company = db.query(Company).filter(Company.id == company_id, Company.owner_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    target_date = date.fromisoformat(report_date) if report_date else date.today()

    rows = db.query(JournalEntry, Document).outerjoin(
        Document, JournalEntry.document_id == Document.id
    ).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.entry_date == target_date
    ).all()

    posted = [(e, d) for e, d in rows if e.status == "posted"]
    needs_review = [(e, d) for e, d in rows if e.status == "needs_review"]

    totals_by_account = {}
    for e, d in posted:
        key = f"{e.debit_account} {e.debit_account_name}"
        amt = float(e.amount_kgs) if e.amount_kgs else float(e.amount)
        totals_by_account[key] = totals_by_account.get(key, 0) + amt

    def entry_dict(e, d):
        return {
            "id": e.id,
            "doc_number": d.doc_number if d else None,
            "doc_date": str(d.doc_date)[:10] if d and d.doc_date else None,
            "counterparty": d.counterparty if d else None,
            "description": e.description,
            "debit": f"{e.debit_account} {e.debit_account_name}",
            "credit": f"{e.credit_account} {e.credit_account_name}",
            "amount": float(e.amount),
            "currency": e.currency,
            "amount_kgs": float(e.amount_kgs) if e.amount_kgs else (float(e.amount) if e.currency == "KGS" else None),
            "confidence": e.ai_confidence,
            "reasoning": e.ai_reasoning
        }

    return {
        "report_date": str(target_date),
        "company": company.name,
        "summary": {
            "total_entries": len(rows),
            "posted": len(posted),
            "needs_review": len(needs_review),
            "total_amount_kgs": sum(
                float(e.amount_kgs) if e.amount_kgs else float(e.amount)
                for e, d in posted if e.currency == "KGS" or e.amount_kgs
            ),
        },
        "posted_entries": [entry_dict(e, d) for e, d in posted],
        "needs_review": [entry_dict(e, d) for e, d in needs_review],
        "totals_by_debit_account": totals_by_account
    }


@router.get("/chart-of-accounts")
def get_chart_of_accounts(level: Optional[int] = None, section: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ChartOfAccount).filter(ChartOfAccount.is_active == True)
    if level:
        q = q.filter(ChartOfAccount.level == level)
    if section:
        q = q.filter(ChartOfAccount.section == section)
    accounts = q.order_by(ChartOfAccount.code).all()
    return [{"code": a.code, "name": a.name, "section": a.section, "account_type": a.account_type, "level": a.level, "parent_code": a.parent_code} for a in accounts]


@router.post("/seed-chart")
def seed_chart_of_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from seed_chart import CHART_OF_ACCOUNTS, POSTING_RULES
    loaded_accounts = 0
    for item in CHART_OF_ACCOUNTS:
        if not db.query(ChartOfAccount).filter(ChartOfAccount.code == item["code"]).first():
            db.add(ChartOfAccount(**item))
            loaded_accounts += 1
    loaded_rules = 0
    for item in POSTING_RULES:
        if not db.query(PostingRule).filter(PostingRule.rule_name == item["rule_name"]).first():
            db.add(PostingRule(**item))
            loaded_rules += 1
    db.commit()
    return {"success": True, "accounts_loaded": loaded_accounts, "rules_loaded": loaded_rules}


# ── ФЛОУ "НА ПРОВЕРКЕ" ──────────────────────────────────

class ReviewAction(BaseModel):
    action: str  # confirm | reject | correct
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    description: Optional[str] = None
    comment: Optional[str] = None  # причина отклонения

@router.patch("/journal/{entry_id}/review")
def review_entry(
    entry_id: int,
    data: ReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Флоу проверки проводки бухгалтером:
    - confirm  → статус posted, фиксируем кто подтвердил
    - reject   → статус rejected, фиксируем причину
    - correct  → меняем Дт/Кт, статус posted
    """
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Проводка не найдена")

    # Проверяем доступ через компанию
    company = db.query(Company).filter(
        Company.id == entry.company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    now = datetime.utcnow()
    reviewer = current_user.email

    if data.action == "confirm":
        entry.status = "posted"
        entry.reviewed_by = reviewer
        entry.reviewed_at = now

    elif data.action == "reject":
        entry.status = "rejected"
        entry.reviewed_by = reviewer
        entry.reviewed_at = now
        if data.comment:
            entry.ai_reasoning = f"[Отклонено: {data.comment}] " + (entry.ai_reasoning or "")
        # Обновляем статус документа
        if entry.document_id:
            doc = db.query(Document).filter(Document.id == entry.document_id).first()
            if doc:
                doc.posting_status = "rejected"
                db.add(doc)

    elif data.action == "correct":
        # Проверяем что счета существуют
        if data.debit_account:
            acc = db.query(ChartOfAccount).filter(ChartOfAccount.code == data.debit_account).first()
            if not acc:
                raise HTTPException(status_code=400, detail=f"Счёт {data.debit_account} не найден в плане счетов КР")
            entry.debit_account = data.debit_account
            entry.debit_account_name = acc.name
        if data.credit_account:
            acc = db.query(ChartOfAccount).filter(ChartOfAccount.code == data.credit_account).first()
            if not acc:
                raise HTTPException(status_code=400, detail=f"Счёт {data.credit_account} не найден в плане счетов КР")
            entry.credit_account = data.credit_account
            entry.credit_account_name = acc.name
        if data.description:
            entry.description = data.description
        entry.status = "posted"
        entry.reviewed_by = reviewer
        entry.reviewed_at = now
        # Обновляем документ
        if entry.document_id:
            doc = db.query(Document).filter(Document.id == entry.document_id).first()
            if doc:
                doc.debit_account = entry.debit_account
                doc.credit_account = entry.credit_account
                doc.posting_status = "posted"
                db.add(doc)
    else:
        raise HTTPException(status_code=400, detail="action должен быть: confirm | reject | correct")

    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "status": entry.status,
        "debit_account": entry.debit_account,
        "debit_account_name": entry.debit_account_name,
        "credit_account": entry.credit_account,
        "credit_account_name": entry.credit_account_name,
        "reviewed_by": entry.reviewed_by,
        "reviewed_at": str(entry.reviewed_at)
    }


@router.delete("/journal/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить проводку из журнала (для исправления дублей)."""
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Проводка не найдена")

    company = db.query(Company).filter(
        Company.id == entry.company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    # Сбрасываем статус документа обратно в pending
    if entry.document_id:
        doc = db.query(Document).filter(Document.id == entry.document_id).first()
        if doc:
            # Проверяем не осталось ли других проводок для этого документа
            other_entries = db.query(JournalEntry).filter(
                JournalEntry.document_id == doc.id,
                JournalEntry.id != entry_id
            ).count()
            if other_entries == 0:
                doc.posting_status = "pending"
                doc.debit_account = None
                doc.credit_account = None
                db.add(doc)

    db.delete(entry)
    db.commit()
    return {"ok": True, "deleted_entry_id": entry_id}


@router.post("/journal/bulk-delete")
def bulk_delete_entries(
    entry_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить несколько проводок сразу (для очистки дублей)."""
    deleted = []
    errors = []

    for entry_id in entry_ids:
        entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
        if not entry:
            errors.append({"id": entry_id, "error": "не найдена"})
            continue

        company = db.query(Company).filter(
            Company.id == entry.company_id,
            Company.owner_id == current_user.id
        ).first()
        if not company:
            errors.append({"id": entry_id, "error": "нет доступа"})
            continue

        if entry.document_id:
            doc = db.query(Document).filter(Document.id == entry.document_id).first()
            if doc:
                other = db.query(JournalEntry).filter(
                    JournalEntry.document_id == doc.id,
                    JournalEntry.id != entry_id
                ).count()
                if other == 0:
                    doc.posting_status = "pending"
                    doc.debit_account = None
                    doc.credit_account = None
                    db.add(doc)

        db.delete(entry)
        deleted.append(entry_id)

    db.commit()
    return {"deleted": len(deleted), "errors": len(errors), "deleted_ids": deleted, "error_details": errors}
