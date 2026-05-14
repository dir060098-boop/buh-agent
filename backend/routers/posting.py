"""
AI-агент автоматической разноски документов по счетам КР (МСФО).
POST /api/posting/auto/{document_id}  — разнести один документ
POST /api/posting/auto-all            — разнести все pending документы компании
GET  /api/posting/journal             — журнал проводок
GET  /api/posting/daily-report        — ежедневный отчёт
GET  /api/posting/chart-of-accounts   — план счетов
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from database import get_db
from models import Document, JournalEntry, ChartOfAccount, PostingRule, Company
from routers.auth import get_current_user
from models import User
import anthropic
import json
import os
from datetime import date, datetime
from typing import Optional

router = APIRouter()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def get_chart_summary(db: Session) -> str:
    """Возвращает краткий план счетов для промпта (только уровень 3)."""
    accounts = db.query(ChartOfAccount).filter(
        ChartOfAccount.level == 3,
        ChartOfAccount.is_active == True
    ).order_by(ChartOfAccount.code).all()

    if not accounts:
        return "План счетов не загружен в БД."

    lines = []
    for acc in accounts:
        lines.append(f"{acc.code} | {acc.name} | {acc.account_type}")
    return "\n".join(lines)


def get_posting_rules_summary(db: Session) -> str:
    """Возвращает правила разноски для промпта."""
    rules = db.query(PostingRule).filter(
        PostingRule.is_active == True
    ).order_by(PostingRule.priority.desc()).all()

    if not rules:
        return "Правила разноски не загружены."

    lines = []
    for r in rules:
        kw = ", ".join(r.operation_keywords or [])
        lines.append(f"- {r.rule_name}: Дт {r.debit_account} / Кт {r.credit_account} | Ключевые слова: {kw}")
    return "\n".join(lines)


def post_document_with_ai(doc: Document, db: Session) -> JournalEntry:
    """Основная функция — AI разносит один документ."""

    chart_summary = get_chart_summary(db)
    rules_summary = get_posting_rules_summary(db)

    prompt = f"""Ты — профессиональный бухгалтер в Кыргызстане (Бишкек). 
Твоя задача — определить бухгалтерскую проводку (дебет/кредит) для документа по плану счетов КР (МСФО).

## ДОКУМЕНТ
Тип: {doc.doc_type}
Номер: {doc.doc_number or 'не указан'}
Дата: {doc.doc_date or 'не указана'}
Контрагент: {doc.counterparty or 'не указан'}
ИНН контрагента: {doc.counterparty_inn or 'не указан'}
Сумма: {doc.amount or 0} {doc.currency or 'KGS'}
НДС: {doc.vat_amount or 0}
Описание/назначение: {doc.ai_summary or doc.ai_raw_text or 'нет описания'}

## ПЛАН СЧЕТОВ КР (МСФО) — рабочие счета
КОД | НАЗВАНИЕ | ТИП (active=актив, passive=пассив)
{chart_summary}

## ТИПОВЫЕ ПРАВИЛА РАЗНОСКИ
{rules_summary}

## ЗАДАЧА
Определи ОДНУ главную проводку (дебет и кредит) для этого документа.
Для торгово-импортной компании ОсОО АРТЕ (импорт одежды из КР в Россию).

Верни ТОЛЬКО JSON без markdown, без пояснений вне JSON:
{{
  "debit_account": "XXXX",
  "credit_account": "XXXX", 
  "debit_account_name": "название счёта дебета",
  "credit_account_name": "название счёта кредита",
  "amount": число,
  "currency": "KGS/RUB/USD",
  "description": "краткое описание проводки на русском",
  "confidence": число от 0 до 100,
  "reasoning": "краткое объяснение почему эти счета (1-2 предложения)",
  "needs_review": true/false
}}

needs_review = true если confidence < 75 или ситуация нестандартная."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()

    # Парсим JSON
    try:
        # Убираем возможные markdown-блоки
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
    except Exception:
        # Если AI вернул что-то нечитаемое — отмечаем на проверку
        result = {
            "debit_account": "7590",
            "credit_account": "3210",
            "debit_account_name": "Прочие операционные расходы",
            "credit_account_name": "Счета к оплате поставщикам",
            "amount": doc.amount or 0,
            "currency": doc.currency or "KGS",
            "description": f"Не удалось разобрать ответ AI: {raw[:100]}",
            "confidence": 0,
            "reasoning": "Ошибка парсинга ответа AI",
            "needs_review": True
        }

    # Обновляем документ
    doc.debit_account = result.get("debit_account")
    doc.credit_account = result.get("credit_account")
    doc.ai_confidence = result.get("confidence", 0)
    doc.posting_status = "needs_review" if result.get("needs_review") else "posted"
    db.add(doc)

    # Создаём запись в журнале
    entry = JournalEntry(
        company_id=doc.company_id,
        document_id=doc.id,
        entry_date=doc.doc_date.date() if doc.doc_date else date.today(),
        debit_account=result.get("debit_account"),
        credit_account=result.get("credit_account"),
        debit_account_name=result.get("debit_account_name"),
        credit_account_name=result.get("credit_account_name"),
        amount=result.get("amount", doc.amount or 0),
        currency=result.get("currency", doc.currency or "KGS"),
        description=result.get("description"),
        ai_confidence=result.get("confidence", 0),
        ai_reasoning=result.get("reasoning"),
        status="needs_review" if result.get("needs_review") else "posted"
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/auto/{document_id}")
def auto_post_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Разнести один документ через AI."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")

    # Проверяем доступ
    company = db.query(Company).filter(
        Company.id == doc.company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    entry = post_document_with_ai(doc, db)
    return {
        "success": True,
        "document_id": document_id,
        "entry_id": entry.id,
        "debit": f"{entry.debit_account} {entry.debit_account_name}",
        "credit": f"{entry.credit_account} {entry.credit_account_name}",
        "amount": float(entry.amount),
        "currency": entry.currency,
        "confidence": entry.ai_confidence,
        "status": entry.status,
        "description": entry.description,
        "reasoning": entry.ai_reasoning
    }


@router.post("/auto-all")
def auto_post_all(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Разнести все pending документы компании."""
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    docs = db.query(Document).filter(
        Document.company_id == company_id,
        Document.posting_status == "pending",
        Document.amount != None
    ).all()

    results = []
    errors = []
    for doc in docs:
        try:
            entry = post_document_with_ai(doc, db)
            results.append({
                "document_id": doc.id,
                "doc_number": doc.doc_number,
                "debit": entry.debit_account,
                "credit": entry.credit_account,
                "amount": float(entry.amount),
                "currency": entry.currency,
                "confidence": entry.ai_confidence,
                "status": entry.status
            })
        except Exception as e:
            errors.append({"document_id": doc.id, "error": str(e)})

    return {
        "processed": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors
    }


@router.get("/journal")
def get_journal(
    company_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Журнал проводок компании."""
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    q = db.query(JournalEntry).filter(JournalEntry.company_id == company_id)

    if date_from:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(JournalEntry.entry_date <= date_to)
    if status:
        q = q.filter(JournalEntry.status == status)

    entries = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).all()

    return [
        {
            "id": e.id,
            "entry_date": str(e.entry_date),
            "debit_account": e.debit_account,
            "debit_account_name": e.debit_account_name,
            "credit_account": e.credit_account,
            "credit_account_name": e.credit_account_name,
            "amount": float(e.amount),
            "currency": e.currency,
            "description": e.description,
            "ai_confidence": e.ai_confidence,
            "ai_reasoning": e.ai_reasoning,
            "status": e.status,
            "document_id": e.document_id,
            "created_at": str(e.created_at)
        }
        for e in entries
    ]


@router.get("/daily-report")
def get_daily_report(
    company_id: int,
    report_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Ежедневный отчёт по проводкам."""
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.owner_id == current_user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")

    target_date = date.fromisoformat(report_date) if report_date else date.today()

    entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.entry_date == target_date
    ).all()

    # Группируем по статусу
    posted = [e for e in entries if e.status == "posted"]
    needs_review = [e for e in entries if e.status == "needs_review"]

    # Итого по дебетовым счетам
    totals_by_account = {}
    for e in posted:
        key = f"{e.debit_account} {e.debit_account_name}"
        totals_by_account[key] = totals_by_account.get(key, 0) + float(e.amount)

    return {
        "report_date": str(target_date),
        "company": company.name,
        "summary": {
            "total_entries": len(entries),
            "posted": len(posted),
            "needs_review": len(needs_review),
            "total_amount_kgs": sum(float(e.amount) for e in posted if e.currency == "KGS"),
        },
        "posted_entries": [
            {
                "id": e.id,
                "debit": f"{e.debit_account} {e.debit_account_name}",
                "credit": f"{e.credit_account} {e.credit_account_name}",
                "amount": float(e.amount),
                "currency": e.currency,
                "description": e.description,
                "confidence": e.ai_confidence
            }
            for e in posted
        ],
        "needs_review": [
            {
                "id": e.id,
                "debit": f"{e.debit_account} {e.debit_account_name}",
                "credit": f"{e.credit_account} {e.credit_account_name}",
                "amount": float(e.amount),
                "currency": e.currency,
                "description": e.description,
                "confidence": e.ai_confidence,
                "reasoning": e.ai_reasoning
            }
            for e in needs_review
        ],
        "totals_by_debit_account": totals_by_account
    }


@router.get("/chart-of-accounts")
def get_chart_of_accounts(
    level: Optional[int] = None,
    section: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получить план счетов КР."""
    q = db.query(ChartOfAccount).filter(ChartOfAccount.is_active == True)
    if level:
        q = q.filter(ChartOfAccount.level == level)
    if section:
        q = q.filter(ChartOfAccount.section == section)
    accounts = q.order_by(ChartOfAccount.code).all()
    return [
        {
            "code": a.code,
            "name": a.name,
            "section": a.section,
            "account_type": a.account_type,
            "level": a.level,
            "parent_code": a.parent_code
        }
        for a in accounts
    ]


@router.post("/seed-chart")
def seed_chart_of_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Загрузить план счетов КР в БД (запустить один раз)."""
    from seed_chart import CHART_OF_ACCOUNTS, POSTING_RULES

    # Загружаем план счетов
    loaded_accounts = 0
    for item in CHART_OF_ACCOUNTS:
        exists = db.query(ChartOfAccount).filter(ChartOfAccount.code == item["code"]).first()
        if not exists:
            db.add(ChartOfAccount(**item))
            loaded_accounts += 1

    # Загружаем правила разноски
    loaded_rules = 0
    for item in POSTING_RULES:
        exists = db.query(PostingRule).filter(PostingRule.rule_name == item["rule_name"]).first()
        if not exists:
            db.add(PostingRule(**item))
            loaded_rules += 1

    db.commit()
    return {
        "success": True,
        "accounts_loaded": loaded_accounts,
        "rules_loaded": loaded_rules
    }
