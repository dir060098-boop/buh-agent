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
    balance = compute_balance(acc.opening_balance or 0, txs)
    return {
        "id": acc.id,
        "bank_name": acc.bank_name,
        "account_number": acc.account_number,
        "currency": acc.currency or "KGS",
        "opening_balance": acc.opening_balance or 0,
        "is_cash": acc.is_cash or False,
        "balance": round(balance, 2),
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
        "status": tx.status,
        "linked_document_id": tx.linked_document_id,
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


@router.patch("/transactions/{tx_id}/match")
def match_transaction(tx_id: int, doc_id: int,
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Привязать транзакцию к документу."""
    tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Операция не найдена")
    tx.linked_document_id = doc_id
    tx.status = "matched"
    db.commit()
    return tx_to_dict(tx)


# ── Импорт выписки ─────────────────────────────────────────────────────────

def _parse_optima_xlsx(data: bytes) -> list[dict]:
    """Парсит выписку Оптима Банк (XLSX)."""
    import pandas as pd
    df = pd.read_excel(io.BytesIO(data), header=None)

    # Ищем строку заголовков колонок (содержит 'Дебет')
    header_row = None
    for i in range(min(20, len(df))):
        row_vals = [str(v) for v in df.iloc[i].tolist()]
        if any('дебет' in v.lower() for v in row_vals):
            header_row = i
            break
    if header_row is None:
        raise ValueError("Не найдена строка заголовков (Дебет/Кредит)")

    # Определяем индексы нужных колонок
    headers = [str(v).lower().strip() for v in df.iloc[header_row].tolist()]
    def col(keyword):
        for j, h in enumerate(headers):
            if keyword in h:
                return j
        return None

    col_date   = col('дата') or 0
    col_debit  = col('дебет')
    col_credit = col('кредит')
    col_cp     = col('отправитель')  # Отправитель / Получатель
    col_inn    = col('инн')
    col_basis  = col('основание')
    col_docnum = col('номер')

    if col_debit is None or col_credit is None:
        raise ValueError("Не найдены колонки Дебет/Кредит")

    rows = []
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        date_val = row.iloc[col_date]
        if pd.isna(date_val) or not date_val:
            continue

        # Парсим дату
        try:
            if isinstance(date_val, str):
                d = datetime.strptime(date_val.strip(), "%d.%m.%Y")
            else:
                d = pd.Timestamp(date_val).to_pydatetime()
        except Exception:
            continue

        debit  = row.iloc[col_debit]  if col_debit  is not None else None
        credit = row.iloc[col_credit] if col_credit is not None else None

        debit  = float(debit)  if debit  is not None and not pd.isna(debit)  else 0.0
        credit = float(credit) if credit is not None and not pd.isna(credit) else 0.0

        if debit == 0 and credit == 0:
            continue

        counterparty = str(row.iloc[col_cp]).strip()    if col_cp    is not None and not pd.isna(row.iloc[col_cp])    else ""
        inn          = str(row.iloc[col_inn]).strip()   if col_inn   is not None and not pd.isna(row.iloc[col_inn])   else ""
        purpose      = str(row.iloc[col_basis]).strip() if col_basis is not None and not pd.isna(row.iloc[col_basis]) else ""
        doc_num      = str(row.iloc[col_docnum]).strip() if col_docnum is not None and not pd.isna(row.iloc[col_docnum]) else ""

        # Убираем 'nan'
        if counterparty.lower() == 'nan': counterparty = ""
        if inn.lower()          == 'nan': inn = ""
        if purpose.lower()      == 'nan': purpose = ""
        if doc_num.lower()      == 'nan': doc_num = ""

        if debit > 0:
            rows.append({"date": d, "amount": debit,  "direction": "out",
                         "counterparty": counterparty, "purpose": purpose,
                         "counterparty_inn": inn, "doc_number": doc_num, "currency": "KGS"})
        if credit > 0:
            rows.append({"date": d, "amount": credit, "direction": "in",
                         "counterparty": counterparty, "purpose": purpose,
                         "counterparty_inn": inn, "doc_number": doc_num, "currency": "KGS"})
    return rows


def _parse_demir_pdf(data: bytes) -> list[dict]:
    """Парсит выписку Демир Банк (PDF). Один столбец суммы — положительная=приход, отрицательная=расход."""
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("pdfplumber не установлен: pip install pdfplumber")

    rows = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row:
                        continue
                    # Ищем строки с датой в формате DD.MM.YYYY
                    date_val = None
                    amount_val = None
                    counterparty = ""
                    purpose = ""

                    for cell in row:
                        if not cell:
                            continue
                        cell_s = str(cell).strip()
                        # Дата
                        m = re.match(r'(\d{2}\.\d{2}\.\d{4})', cell_s)
                        if m and date_val is None:
                            try:
                                date_val = datetime.strptime(m.group(1), "%d.%m.%Y")
                            except Exception:
                                pass
                        # Сумма (число с пробелами/запятой/точкой, может быть отрицательным)
                        amount_m = re.match(r'^(-?[\d\s]+[,.]?\d*)$', cell_s.replace(' ', '').replace('\xa0', ''))
                        if amount_m and amount_val is None and date_val is not None:
                            try:
                                clean = cell_s.replace(' ', '').replace('\xa0', '').replace(',', '.')
                                amount_val = float(clean)
                            except Exception:
                                pass

                    if date_val is None or amount_val is None or amount_val == 0:
                        continue

                    direction = "in" if amount_val > 0 else "out"
                    rows.append({
                        "date": date_val,
                        "amount": abs(amount_val),
                        "direction": direction,
                        "counterparty": counterparty,
                        "purpose": purpose,
                        "counterparty_inn": "",
                        "doc_number": "",
                        "currency": "KGS",
                    })
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

        tx = models.BankTransaction(
            account_id  = account_id,
            date        = row["date"],
            amount      = row["amount"],
            currency    = acc.currency or row.get("currency", "KGS"),
            direction   = row["direction"],
            counterparty= row.get("counterparty", ""),
            purpose     = row.get("purpose", ""),
            status      = "unmatched",
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
