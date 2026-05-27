from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db, settings
from routers.auth import get_current_user
import models
import io
import re

router = APIRouter()


# ── Схемы ──────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    bank_name: str
    account_number: str = ""
    currency: str = "KGS"
    opening_balance: float = 0.0
    is_cash: bool = False

class TransactionCreate(BaseModel):
    account_id: int
    date: str                   # YYYY-MM-DD
    amount: float
    direction: str              # in / out
    counterparty: str = ""
    purpose: str = ""
    auto_post: bool = True      # создать проводку в журнале

class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    direction: Optional[str] = None
    counterparty: Optional[str] = None
    purpose: Optional[str] = None


# ── Хелперы ────────────────────────────────────────────────────────────────

def compute_balance(opening: float, transactions: list) -> float:
    bal = opening
    for tx in transactions:
        if tx.direction == "in":
            bal += tx.amount
        else:
            bal -= tx.amount
    return bal


def account_to_dict(acc, db: Session) -> dict:
    txs = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id == acc.id
    ).all()

    main_cur = acc.currency or "KGS"

    # Считаем остаток по каждой валюте отдельно
    by_cur: dict = {}
    for t in txs:
        cur = t.currency or "KGS"
        delta = t.amount if t.direction == "in" else -t.amount
        by_cur[cur] = by_cur.get(cur, 0.0) + delta

    # Основная валюта счёта включает начальный остаток
    main_bal = (acc.opening_balance or 0.0) + by_cur.get(main_cur, 0.0)
    by_cur[main_cur] = main_bal

    return {
        "id": acc.id,
        "bank_name": acc.bank_name,
        "account_number": acc.account_number,
        "currency": main_cur,
        "opening_balance": acc.opening_balance or 0,
        "is_cash": acc.is_cash or False,
        "balance": round(main_bal, 2),
        "balances_by_currency": {k: round(v, 2) for k, v in by_cur.items()},
        "tx_count": len(txs),
    }


def tx_to_dict(tx) -> dict:
    return {
        "id": tx.id,
        "account_id": tx.account_id,
        "date": tx.date.strftime("%Y-%m-%d") if tx.date else None,
        "amount": tx.amount,
        "currency": tx.currency or "KGS",
        "direction": tx.direction,
        "counterparty": tx.counterparty,
        "purpose": tx.purpose,
        "counterparty_inn": tx.counterparty_inn,
        "doc_number": tx.doc_number,
        "status": tx.status,
        "linked_document_id": tx.linked_document_id,
        "linked_esf_id": getattr(tx, "linked_esf_id", None),
        "journal_entry_id": tx.journal_entry_id,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
    }


def _auto_post(tx: models.BankTransaction, acc: models.BankAccount,
               company_id: int, db: Session) -> Optional[int]:
    """Создаёт проводку в журнале при добавлении транзакции."""
    # Определяем счета
    if acc.is_cash:
        cash_acc = "1110"   # касса нац. валюта
        if tx.direction == "in":
            debit, credit = cash_acc, "1410"  # получили наличные от покупателя
        else:
            debit, credit = "3110", cash_acc  # выдали наличные поставщику
    else:
        bank_acc = "1210"   # расчётный счёт
        if tx.direction == "in":
            debit, credit = bank_acc, "1410"  # поступление на счёт
        else:
            debit, credit = "3110", bank_acc  # оплата со счёта

    # Уточнение по назначению платежа
    purpose_lower = (tx.purpose or "").lower()
    counterparty_lower = (tx.counterparty or "").lower()
    if tx.direction == "out":
        if any(w in purpose_lower for w in ["налог", "ндс", "нпд", "налоговая", "угнс"]):
            debit = "3410"
        elif any(w in purpose_lower for w in ["соцфонд", "пенсион", "фомс", "страхов"]):
            debit = "3530"
        elif any(w in purpose_lower for w in ["зарплат", "аванс сотруд", "выплата сотруд"]):
            debit = "3520"
        elif any(w in purpose_lower for w in ["аренд"]):
            debit = "8030"

    purpose_text = tx.purpose or f"{'Поступление' if tx.direction=='in' else 'Оплата'} {tx.counterparty or ''}"

    try:
        entry = models.JournalEntry(
            company_id=company_id,
            document_id=None,
            debit_account=debit,
            credit_account=credit,
            amount=tx.amount,
            currency=tx.currency or "KGS",
            description=purpose_text[:255],
            status="posted",
            ai_confidence=70,
        )
        db.add(entry)
        db.flush()
        return entry.id
    except Exception as e:
        print(f"[BANK] auto_post error: {e}")
        return None


# ── Счета ──────────────────────────────────────────────────────────────────

@router.get("/{company_id}/accounts")
def list_accounts(company_id: int, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    accs = db.query(models.BankAccount).filter(
        models.BankAccount.company_id == company_id
    ).all()
    return [account_to_dict(a, db) for a in accs]


@router.post("/{company_id}/accounts")
def create_account(company_id: int, data: AccountCreate,
                   db: Session = Depends(get_db), user=Depends(get_current_user)):
    acc = models.BankAccount(
        company_id=company_id,
        bank_name=data.bank_name,
        account_number=data.account_number,
        currency=data.currency,
        opening_balance=data.opening_balance,
        is_cash=data.is_cash,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return account_to_dict(acc, db)


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    acc = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Счёт не найден")
    db.delete(acc)
    db.commit()
    return {"ok": True}


# ── Транзакции ─────────────────────────────────────────────────────────────

@router.get("/{company_id}/transactions")
def list_transactions(
    company_id: int,
    account_id: Optional[int] = Query(None),
    direction: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    accs = db.query(models.BankAccount).filter(
        models.BankAccount.company_id == company_id
    ).all()
    acc_ids = [a.id for a in accs]
    if not acc_ids:
        return {"accounts": [], "transactions": [], "summary": {}}

    acc_map = {a.id: a for a in accs}

    q = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id.in_(acc_ids)
    )
    if account_id:
        q = q.filter(models.BankTransaction.account_id == account_id)
    if direction:
        q = q.filter(models.BankTransaction.direction == direction)
    if status:
        q = q.filter(models.BankTransaction.status == status)
    if currency:
        q = q.filter(models.BankTransaction.currency == currency)
    if date_from:
        q = q.filter(models.BankTransaction.date >= date_from)
    if date_to:
        q = q.filter(models.BankTransaction.date <= date_to)
    if search:
        from sqlalchemy import or_
        q = q.filter(or_(
            models.BankTransaction.counterparty.ilike(f"%{search}%"),
            models.BankTransaction.purpose.ilike(f"%{search}%"),
        ))

    txs = q.order_by(models.BankTransaction.date.desc(),
                     models.BankTransaction.id.desc()).all()

    # Бегущий остаток (по счёту, от старых к новым)
    # Для каждого счёта считаем накопленный остаток
    balances_by_acc = {a.id: account_to_dict(a, db)["balance"] for a in accs}

    # Итоги
    total_in  = sum(t.amount for t in txs if t.direction == "in")
    total_out = sum(t.amount for t in txs if t.direction == "out")
    unmatched = sum(1 for t in txs if t.status == "unmatched")

    return {
        "accounts": [account_to_dict(a, db) for a in accs],
        "transactions": [tx_to_dict(t) for t in txs],
        "summary": {
            "total_in": round(total_in, 2),
            "total_out": round(total_out, 2),
            "unmatched": unmatched,
            "balances": balances_by_acc,
        }
    }


@router.post("/{company_id}/transactions")
def add_transaction(
    company_id: int,
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    acc = db.query(models.BankAccount).filter(
        models.BankAccount.id == data.account_id,
        models.BankAccount.company_id == company_id,
    ).first()
    if not acc:
        raise HTTPException(404, "Счёт не найден")

    tx_date = datetime.strptime(data.date, "%Y-%m-%d") if data.date else datetime.utcnow()

    tx = models.BankTransaction(
        account_id=data.account_id,
        date=tx_date,
        amount=data.amount,
        currency=acc.currency or "KGS",
        direction=data.direction,
        counterparty=data.counterparty,
        purpose=data.purpose,
        status="unmatched",
    )
    db.add(tx)
    db.flush()

    if data.auto_post:
        entry_id = _auto_post(tx, acc, company_id, db)
        if entry_id:
            tx.journal_entry_id = entry_id
            tx.status = "matched"   # bug fix: auto_post создал проводку → сверено

    db.commit()
    db.refresh(tx)
    return tx_to_dict(tx)


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db),
                       user=Depends(get_current_user)):
    tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Операция не найдена")
    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.patch("/transactions/{tx_id}")
def update_transaction(
    tx_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Редактировать поля транзакции."""
    tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Операция не найдена")
    if data.date is not None:
        tx.date = datetime.strptime(data.date, "%Y-%m-%d")
    if data.amount is not None:
        tx.amount = data.amount
    if data.direction is not None:
        tx.direction = data.direction
    if data.counterparty is not None:
        tx.counterparty = data.counterparty
    if data.purpose is not None:
        tx.purpose = data.purpose
    db.commit()
    db.refresh(tx)
    return tx_to_dict(tx)


@router.post("/{company_id}/auto-post-all")
def auto_post_all(
    company_id: int,
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Авторазноска всех unmatched транзакций без проводки."""
    accs = db.query(models.BankAccount).filter(
        models.BankAccount.company_id == company_id
    ).all()
    acc_ids = [a.id for a in accs]
    if not acc_ids:
        return {"ok": True, "posted": 0, "skipped": 0, "total": 0}
    acc_map = {a.id: a for a in accs}

    q = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id.in_(acc_ids),
        models.BankTransaction.status == "unmatched",
        models.BankTransaction.journal_entry_id == None,  # noqa: E711
    )
    if account_id:
        q = q.filter(models.BankTransaction.account_id == account_id)

    txs = q.order_by(models.BankTransaction.date.asc()).all()
    posted = skipped = 0
    for tx in txs:
        acc = acc_map.get(tx.account_id)
        if not acc:
            skipped += 1
            continue
        entry_id = _auto_post(tx, acc, company_id, db)
        if entry_id:
            tx.journal_entry_id = entry_id
            tx.status = "matched"
            posted += 1
        else:
            skipped += 1

    db.commit()
    return {"ok": True, "posted": posted, "skipped": skipped, "total": len(txs)}


@router.patch("/transactions/{tx_id}/match")
def match_transaction(tx_id: int, doc_id: Optional[int] = None,
                      esf_id: Optional[int] = None,
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Привязать транзакцию к документу или ЭСФ."""
    tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Операция не найдена")
    if doc_id:
        tx.linked_document_id = doc_id
    if esf_id:
        tx.linked_esf_id = esf_id
        # Обратная ссылка в ЭСФ
        esf = db.query(models.ESF).filter(models.ESF.id == esf_id).first()
        if esf:
            esf.bank_transaction_id = tx_id
            esf.linked_payment = True
    tx.status = "matched"
    db.commit()
    return tx_to_dict(tx)


# ── Сверка: кандидаты для привязки ─────────────────────────────────────────

def _normalize_name(s: str) -> str:
    """Убирает юридические формы и нормализует для сравнения."""
    if not s:
        return ""
    prefixes = ["общество с ограниченной ответственностью", "открытое акционерное общество",
                "закрытое акционерное общество", "акционерное общество",
                "осоо", "ооо", "оао", "зао", "ао", "нко", "ип ", "чп ", "пао ", "пк "]
    s = s.lower().strip()
    for p in prefixes:
        s = s.replace(p, "").strip()
    # убираем кавычки
    s = s.replace('"', '').replace("'", '').replace("«", '').replace("»", '').strip()
    return s


def _score_candidate(tx: models.BankTransaction, amount: float, currency: str,
                     cp_name: str, cp_inn: str, ref_number: str,
                     ref_date, already_linked: bool) -> int:
    """Скоринг одного кандидата. Возвращает 0–100."""
    if already_linked:
        return 0  # уже привязан к другой транзакции

    score = 0

    # 1. Сумма (40 баллов)
    if tx.amount and amount:
        if abs(tx.amount - amount) < 0.02:
            score += 40
        elif abs(tx.amount - amount) / max(tx.amount, amount) < 0.001:
            score += 30

    # 2. ИНН (35 баллов) — самый надёжный сигнал
    tx_inn = (tx.counterparty_inn or "").strip()
    if tx_inn and cp_inn and tx_inn == cp_inn.strip():
        score += 35

    # 3. Номер документа в назначении (30 баллов)
    tx_purpose = (tx.purpose or "").lower()
    if ref_number:
        ref_clean = ref_number.strip().lstrip("0")
        if ref_clean and (ref_clean in tx_purpose or
                          ref_clean in (tx.doc_number or "").lower()):
            score += 30

    # 4. Имя контрагента (20 баллов)
    tx_cp = _normalize_name(tx.counterparty or "")
    doc_cp = _normalize_name(cp_name or "")
    if tx_cp and doc_cp:
        if tx_cp == doc_cp:
            score += 20
        elif tx_cp in doc_cp or doc_cp in tx_cp:
            score += 12

    # 5. Дата (10 / 5 / 0 баллов)
    if ref_date and tx.date:
        try:
            ref_dt = ref_date if hasattr(ref_date, "date") else ref_date
            tx_dt = tx.date
            days = abs((tx_dt - ref_dt).days) if hasattr(ref_dt, "days") else 999
        except Exception:
            days = 999
        if days <= 7:
            score += 10
        elif days <= 30:
            score += 5

    # 6. Совпадение валюты (+5 штраф за несовпадение)
    tx_cur = tx.currency or "KGS"
    if currency and tx_cur != currency:
        score -= 5

    return max(0, score)


@router.get("/transactions/{tx_id}/match-candidates")
def get_match_candidates(
    tx_id: int,
    company_id: int = Query(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Топ-5 кандидатов для привязки транзакции (документы + ЭСФ)."""
    tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Операция не найдена")

    candidates = []

    # ── Документы ─────────────────────────────────────────────────
    docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.amount.isnot(None),
    ).all()

    # ИД уже привязанных к другим транзакциям
    linked_doc_ids = {
        r[0] for r in db.query(models.BankTransaction.linked_document_id)
        .filter(models.BankTransaction.linked_document_id.isnot(None),
                models.BankTransaction.id != tx_id).all()
    }

    for doc in docs:
        # Направление: расход → расходный документ, приход → приходный
        if tx.direction == "out" and doc.doc_type and doc.doc_type.value in ("invoice", "esf", "contract"):
            pass  # совместимо
        elif tx.direction == "in" and doc.doc_type and doc.doc_type.value in ("act", "upd", "receipt"):
            pass
        # Не фильтруем жёстко по направлению — оставляем на усмотрение скоринга

        score = _score_candidate(
            tx=tx,
            amount=doc.amount or 0,
            currency=doc.currency or "KGS",
            cp_name=doc.counterparty or "",
            cp_inn=doc.counterparty_inn or "",
            ref_number=doc.doc_number or "",
            ref_date=doc.doc_date,
            already_linked=doc.id in linked_doc_ids,
        )
        if score >= 40:
            candidates.append({
                "type": "document",
                "id": doc.id,
                "score": score,
                "confidence": "high" if score >= 80 else "medium",
                "label": f"{doc.doc_type.value if doc.doc_type else 'Документ'} №{doc.doc_number or '—'} от {doc.doc_date.strftime('%d.%m.%Y') if doc.doc_date else '—'}",
                "counterparty": doc.counterparty or "—",
                "amount": doc.amount,
                "currency": doc.currency or "KGS",
                "date": doc.doc_date.strftime("%Y-%m-%d") if doc.doc_date else None,
            })

    # ── ЭСФ ───────────────────────────────────────────────────────
    esf_list = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.amount.isnot(None),
    ).all()

    linked_esf_ids = {
        r[0] for r in db.query(models.BankTransaction.linked_esf_id)
        .filter(models.BankTransaction.linked_esf_id.isnot(None),
                models.BankTransaction.id != tx_id).all()
    }

    for esf in esf_list:
        # Направление: расход → входящий ЭСФ (мы платим поставщику)
        #              приход  → исходящий ЭСФ (покупатель платит нам)
        if tx.direction == "out":
            cp_name = esf.supplier_name or ""
            cp_inn  = esf.supplier_inn  or ""
        else:
            cp_name = esf.buyer_name or ""
            cp_inn  = esf.buyer_inn  or ""

        score = _score_candidate(
            tx=tx,
            amount=esf.amount or 0,
            currency="KGS",
            cp_name=cp_name,
            cp_inn=cp_inn,
            ref_number=esf.esf_number or "",
            ref_date=esf.esf_date,
            already_linked=esf.id in linked_esf_ids,
        )
        if score >= 40:
            candidates.append({
                "type": "esf",
                "id": esf.id,
                "score": score,
                "confidence": "high" if score >= 80 else "medium",
                "label": f"ЭСФ №{esf.esf_number or '—'} от {esf.esf_date.strftime('%d.%m.%Y') if esf.esf_date else '—'}",
                "counterparty": cp_name or "—",
                "amount": esf.amount,
                "currency": "KGS",
                "date": esf.esf_date.strftime("%Y-%m-%d") if esf.esf_date else None,
            })

    # Сортируем по score, топ-5
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:5]


# ── Импорт выписки ─────────────────────────────────────────────────────────

def _parse_optima_xlsx(data: bytes) -> list[dict]:
    """Парсит выписку Оптима Банк (XLSX).
    Поддерживает мультивалютные выписки: один лист может содержать
    несколько секций — каждая начинается со строки 'Код валюты: NNN Название'.
    """
    import pandas as pd

    # Коды валют ISO 4217 → код валюты
    CURRENCY_CODES = {
        "417": "KGS", "840": "USD", "978": "EUR",
        "643": "RUB", "826": "GBP", "156": "CNY", "398": "KZT",
    }

    def _detect_currency(row_vals: list) -> Optional[str]:
        """Если строка содержит 'Код валюты:' — возвращает валюту."""
        joined = " ".join(str(v) for v in row_vals if str(v) != "nan").lower()
        if "код валюты" not in joined:
            return None
        for code, cur in CURRENCY_CODES.items():
            if code in joined:
                return cur
        # Фоллбэк по названию
        if "сом" in joined or "kgs" in joined:       return "KGS"
        if "доллар" in joined or "usd" in joined:    return "USD"
        if "евро" in joined or "eur" in joined:      return "EUR"
        if "рубл" in joined or "rub" in joined:      return "RUB"
        if "фунт" in joined or "gbp" in joined:      return "GBP"
        if "юань" in joined or "cny" in joined:      return "CNY"
        if "тенге" in joined or "kzt" in joined:     return "KZT"
        return "KGS"

    df = pd.read_excel(io.BytesIO(data), header=None)

    def _parse_date(val) -> Optional[datetime]:
        try:
            if pd.isna(val):
                return None
        except Exception:
            pass
        if isinstance(val, str):
            date_part = val.strip().split('\n')[0].split(' ')[0]
            try:
                return datetime.strptime(date_part, "%d.%m.%Y")
            except Exception:
                return None
        try:
            return pd.Timestamp(val).to_pydatetime().replace(tzinfo=None)
        except Exception:
            return None

    def _clean(val) -> str:
        if val is None:
            return ""
        s = str(val).strip()
        return "" if s.lower() in ("nan", "none", "") else s

    def _col_idx(headers: list, exact: list = (), contains: list = (), default=None):
        """Возвращает индекс колонки. default используется вместо None — безопасно при индексе 0."""
        for kw in exact:
            for j, h in enumerate(headers):
                if h == kw:
                    return j
        for kw in contains:
            for j, h in enumerate(headers):
                if kw in h:
                    return j
        return default

    rows: list[dict] = []

    # ── Находим все секции валют ──────────────────────────────────────────────
    # Секция = строка "Код валюты: ..." + следующая за ней строка заголовков (Дебет)
    # Данные секции идут до следующей секции или конца файла.

    # Собираем индексы строк-маркеров и строк-заголовков
    section_starts: list[tuple[int, str]] = []  # (header_row_index, currency)
    pending_currency: Optional[str] = None

    for i in range(len(df)):
        row_vals = df.iloc[i].tolist()
        cur = _detect_currency(row_vals)
        if cur is not None:
            pending_currency = cur
            continue
        # Строка заголовков: содержит 'дебет'
        low = [str(v).lower() for v in row_vals]
        if any('дебет' in v for v in low):
            currency = pending_currency or "KGS"
            section_starts.append((i, currency))
            pending_currency = None

    if not section_starts:
        raise ValueError("Не найдена строка заголовков (Дебет/Кредит)")

    # ── Парсим каждую секцию ──────────────────────────────────────────────────
    section_starts.append((len(df), ""))  # sentinel

    for sec_idx, (header_row, currency) in enumerate(section_starts[:-1]):
        next_header = section_starts[sec_idx + 1][0]

        headers = [str(v).lower().strip() for v in df.iloc[header_row].tolist()]

        col_date   = _col_idx(headers, exact=['дата исполнения'], contains=['дата'], default=0)
        col_debit  = _col_idx(headers, contains=['дебет'])
        col_credit = _col_idx(headers, contains=['кредит'])
        col_cp     = _col_idx(headers, exact=['отправитель / получатель'], contains=['получатель'])
        col_inn    = _col_idx(headers, contains=['инн'])
        col_basis  = _col_idx(headers, contains=['основание'])
        col_docnum = _col_idx(headers, exact=['номер документа'], contains=['номер'])

        if col_debit is None or col_credit is None:
            continue  # пропускаем секцию без дебет/кредит

        for i in range(header_row + 1, next_header):
            row = df.iloc[i]
            row_vals = row.tolist()

            # Пропускаем строки-маркеры следующей секции
            if _detect_currency(row_vals) is not None:
                break

            d = _parse_date(row.iloc[col_date])
            if d is None:
                continue

            v_debit  = row.iloc[col_debit]
            v_credit = row.iloc[col_credit]
            try:
                debit  = float(v_debit)  if not pd.isna(v_debit)  else 0.0
            except Exception:
                debit = 0.0
            try:
                credit = float(v_credit) if not pd.isna(v_credit) else 0.0
            except Exception:
                credit = 0.0

            if debit == 0 and credit == 0:
                continue

            counterparty = _clean(row.iloc[col_cp])     if col_cp     is not None else ""
            inn          = _clean(row.iloc[col_inn])    if col_inn     is not None else ""
            purpose      = _clean(row.iloc[col_basis])  if col_basis   is not None else ""
            doc_num      = _clean(row.iloc[col_docnum]) if col_docnum  is not None else ""

            if debit > 0:
                rows.append({"date": d, "amount": debit, "direction": "out",
                             "counterparty": counterparty, "purpose": purpose,
                             "counterparty_inn": inn, "doc_number": doc_num,
                             "currency": currency})
            if credit > 0:
                rows.append({"date": d, "amount": credit, "direction": "in",
                             "counterparty": counterparty, "purpose": purpose,
                             "counterparty_inn": inn, "doc_number": doc_num,
                             "currency": currency})

    return rows


def _detect_pdf_currency(text: str) -> str:
    """Извлекает валюту из заголовка выписки Оптима Банк."""
    m = re.search(r'Код валюты:\s*\d+\s+(.+)', text)
    if m:
        cur_text = m.group(1).strip().upper()
        if 'ДОЛЛАР' in cur_text:  return "USD"
        if 'ЕВРО'   in cur_text:  return "EUR"
        if 'РУБЛ'   in cur_text:  return "RUB"
        if 'СОМ'    in cur_text:  return "KGS"
    return "KGS"


def _parse_optima_pdf(data: bytes) -> list[dict]:
    """Парсит выписку Оптима Банк (PDF).
    Та же структура что XLSX: заголовок в первой таблице, затем данные по страницам.
    Суммы в формате '2 982,86' (европейский: пробел — тысячи, запятая — дробная).
    """
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("pdfplumber не установлен: pip install pdfplumber")

    currency = "KGS"
    col_date = col_debit = col_credit = col_cp = col_basis = None
    header_found = False

    def parse_amount(s: str) -> float:
        s = s.replace('\xa0', '').replace(' ', '').replace(',', '.')
        try:
            return float(s) if s else 0.0
        except ValueError:
            return 0.0

    rows = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        # Валюта из текста первой страницы
        currency = _detect_pdf_currency(pdf.pages[0].extract_text() or "")

        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    if not row:
                        continue
                    # Нормализуем ячейки: убираем переносы строк
                    cells = [str(c or '').replace('\n', ' ').strip() for c in row]

                    # ── Строка заголовков ──────────────────────────────────
                    if not header_found:
                        h = [c.lower() for c in cells]
                        if any('дебет' in x for x in h):
                            col_date   = next((j for j, x in enumerate(h) if 'дата' in x), 0)
                            col_debit  = next((j for j, x in enumerate(h) if 'дебет' in x), None)
                            col_credit = next((j for j, x in enumerate(h) if 'кредит' in x), None)
                            # Контрагент — точно 'отправитель / получатель', не 'банк отправителя'
                            col_cp = next(
                                (j for j, x in enumerate(h) if x == 'отправитель / получатель'), None
                            )
                            if col_cp is None:
                                col_cp = next(
                                    (j for j, x in enumerate(h) if 'получатель' in x and j > 3), None
                                )
                            col_basis = next((j for j, x in enumerate(h) if 'основание' in x), None)
                            header_found = True
                            continue

                    if not header_found or col_debit is None:
                        continue

                    # ── Итоговые строки — пропускаем ──────────────────────
                    first = cells[0].lower() if cells else ''
                    if any(kw in first for kw in ('фактический', 'планируемый', 'итого')):
                        continue

                    # ── Парсим дату ───────────────────────────────────────
                    date_str = cells[col_date] if col_date < len(cells) else ''
                    date_str = date_str.split(' ')[0]  # убираем время вида '15.12.2025 11:07:51'
                    try:
                        d = datetime.strptime(date_str, "%d.%m.%Y")
                    except Exception:
                        continue

                    debit  = parse_amount(cells[col_debit])  if col_debit  < len(cells) else 0.0
                    credit = parse_amount(cells[col_credit]) if col_credit < len(cells) else 0.0

                    if debit == 0 and credit == 0:
                        continue

                    cp      = cells[col_cp]    if col_cp    is not None and col_cp    < len(cells) else ""
                    purpose = cells[col_basis] if col_basis is not None and col_basis < len(cells) else ""

                    if debit > 0:
                        rows.append({"date": d, "amount": debit, "direction": "out",
                                     "counterparty": cp, "purpose": purpose,
                                     "counterparty_inn": "", "doc_number": "", "currency": currency})
                    if credit > 0:
                        rows.append({"date": d, "amount": credit, "direction": "in",
                                     "counterparty": cp, "purpose": purpose,
                                     "counterparty_inn": "", "doc_number": "", "currency": currency})
    return rows


def _parse_demir_pdf(data: bytes) -> list[dict]:
    """Парсит выписку Демир Банк (PDF). Один столбец суммы — положительная=приход, отрицательная=расход.
    Числа-суммы: не более 10 цифр до разделителя (чтобы не путать с номерами счетов 16 цифр).
    """
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("pdfplumber не установлен: pip install pdfplumber")

    rows = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    if not row:
                        continue
                    date_val = None
                    amount_val = None

                    for cell in row:
                        if not cell:
                            continue
                        cell_s = str(cell).strip()
                        # Дата DD.MM.YYYY
                        m = re.match(r'(\d{2}\.\d{2}\.\d{4})', cell_s)
                        if m and date_val is None:
                            try:
                                date_val = datetime.strptime(m.group(1), "%d.%m.%Y")
                            except Exception:
                                pass
                        # Сумма: не более 10 цифр до разделителя (чтобы не считать номера счетов)
                        if date_val is not None and amount_val is None:
                            clean = cell_s.replace(' ', '').replace('\xa0', '')
                            m2 = re.match(r'^(-?\d{1,10}[,.]?\d{0,2})$', clean)
                            if m2:
                                try:
                                    amount_val = float(clean.replace(',', '.'))
                                except Exception:
                                    pass

                    if date_val is None or amount_val is None or amount_val == 0:
                        continue

                    direction = "in" if amount_val > 0 else "out"
                    rows.append({"date": date_val, "amount": abs(amount_val),
                                 "direction": direction, "counterparty": "",
                                 "purpose": "", "counterparty_inn": "",
                                 "doc_number": "", "currency": "KGS"})
    return rows


def _tx_exists(account_id: int, tx_date: datetime, amount: float,
               direction: str, purpose: str, db: Session) -> bool:
    """Проверяет, не импортирована ли уже эта операция."""
    # Сравниваем: дата + сумма + направление + первые 80 символов назначения
    from sqlalchemy import cast, Date as SADate
    purpose_key = (purpose or "")[:80]
    existing = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id == account_id,
        models.BankTransaction.direction  == direction,
        models.BankTransaction.amount     == amount,
        func.date(models.BankTransaction.date) == tx_date.date(),
    ).all()
    for ex in existing:
        if (ex.purpose or "")[:80] == purpose_key:
            return True
    return False


@router.delete("/{company_id}/accounts/{account_id}/transactions")
def clear_account_transactions(
    company_id: int,
    account_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Удалить все транзакции конкретного банковского счёта."""
    acc = db.query(models.BankAccount).filter(
        models.BankAccount.id == account_id,
        models.BankAccount.company_id == company_id,
    ).first()
    if not acc:
        raise HTTPException(404, "Счёт не найден")
    deleted = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id == account_id
    ).delete()
    db.commit()
    return {"ok": True, "deleted": deleted}


@router.post("/{company_id}/import")
async def import_statement(
    company_id: int,
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Импорт банковской выписки (Оптима XLSX или Демир PDF)."""
    acc = db.query(models.BankAccount).filter(
        models.BankAccount.id == account_id,
        models.BankAccount.company_id == company_id,
    ).first()
    if not acc:
        raise HTTPException(404, "Счёт не найден")

    data = await file.read()
    fname = (file.filename or "").lower()

    try:
        if fname.endswith(".xlsx") or fname.endswith(".xls"):
            tx_rows = _parse_optima_xlsx(data)
        elif fname.endswith(".pdf"):
            # Детектируем формат по содержимому
            import pdfplumber as _plumber
            with _plumber.open(io.BytesIO(data)) as _pdf:
                _first_text = _pdf.pages[0].extract_text() or ""
            if "Справка-выписка" in _first_text:
                tx_rows = _parse_optima_pdf(data)
            else:
                tx_rows = _parse_demir_pdf(data)
        else:
            raise HTTPException(400, "Поддерживаются файлы XLSX и PDF")
    except ValueError as e:
        raise HTTPException(422, str(e))

    imported = 0
    skipped  = 0

    for row in tx_rows:
        if _tx_exists(account_id, row["date"], row["amount"],
                      row["direction"], row["purpose"], db):
            skipped += 1
            continue

        # Валюта: из файла (если указана явно), иначе из настроек счёта
        tx_currency = row.get("currency") or acc.currency or "KGS"
        tx = models.BankTransaction(
            account_id      = account_id,
            date            = row["date"],
            amount          = row["amount"],
            currency        = tx_currency,
            direction       = row["direction"],
            counterparty    = row.get("counterparty", ""),
            purpose         = row.get("purpose", ""),
            counterparty_inn= row.get("counterparty_inn", "") or None,
            doc_number      = row.get("doc_number", "") or None,
            status          = "unmatched",
        )
        db.add(tx)
        imported += 1

    db.commit()
    return {
        "ok": True,
        "imported": imported,
        "skipped": skipped,
        "total": len(tx_rows),
    }
