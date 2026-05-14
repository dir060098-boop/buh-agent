from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic

router = APIRouter()

class TransactionCreate(BaseModel):
    account_id: int
    date: datetime
    amount: float
    direction: str   # in / out
    counterparty: str
    purpose: str

@router.get("/{company_id}/accounts")
def list_accounts(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.BankAccount).filter(models.BankAccount.company_id == company_id).all()

@router.get("/{company_id}/transactions")
def list_transactions(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    accounts = db.query(models.BankAccount).filter(models.BankAccount.company_id == company_id).all()
    account_ids = [a.id for a in accounts]
    txs = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id.in_(account_ids)
    ).order_by(models.BankTransaction.date.desc()).all()
    return txs

@router.get("/{company_id}/unmatched")
def unmatched_transactions(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Платежи без привязки к документу — для сверки"""
    accounts = db.query(models.BankAccount).filter(models.BankAccount.company_id == company_id).all()
    account_ids = [a.id for a in accounts]
    txs = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id.in_(account_ids),
        models.BankTransaction.status == "unmatched"
    ).all()
    return {"count": len(txs), "items": txs}

@router.post("/{company_id}/transactions")
def add_transaction(company_id: int, data: TransactionCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    tx = models.BankTransaction(**data.dict())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx

@router.post("/{company_id}/ai-match")
def ai_match(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """AI автоматически сопоставляет платежи с документами"""
    accounts = db.query(models.BankAccount).filter(models.BankAccount.company_id == company_id).all()
    account_ids = [a.id for a in accounts]
    unmatched = db.query(models.BankTransaction).filter(
        models.BankTransaction.account_id.in_(account_ids),
        models.BankTransaction.status == "unmatched"
    ).all()
    docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.status == "pending"
    ).all()

    if not unmatched or not docs:
        return {"matched": 0, "message": "Нет данных для сверки"}

    # Формируем данные для AI
    tx_list = [{"id": t.id, "amount": t.amount, "counterparty": t.counterparty, "purpose": t.purpose} for t in unmatched]
    doc_list = [{"id": d.id, "amount": d.amount, "counterparty": d.counterparty, "doc_number": d.doc_number} for d in docs]

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    prompt = f"""Сопоставь платежи с документами по сумме и контрагенту. 
Верни JSON: [{{"tx_id": 1, "doc_id": 2}}, ...] — только уверенные совпадения.
Платежи: {tx_list}
Документы: {doc_list}"""

    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        import json
        matches = json.loads(resp.content[0].text)
        count = 0
        for m in matches:
            tx = db.query(models.BankTransaction).filter(models.BankTransaction.id == m["tx_id"]).first()
            if tx:
                tx.linked_document_id = m["doc_id"]
                tx.status = "matched"
                count += 1
        db.commit()
        return {"matched": count}
    except Exception as e:
        return {"matched": 0, "error": str(e)}
