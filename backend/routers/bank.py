from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db, settings
from routers.auth import get_current_user
import models

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
