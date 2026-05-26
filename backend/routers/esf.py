"""
Модуль «ЭСФ» для БухАгент КР.

Входящие (incoming): ЭСФ от поставщиков
  Статусы: pending (не принят) → accepted (принят)

Исходящие (outgoing): ЭСФ выставленные покупателям
  Статусы: pending (не выставлен) → issued (выставлен)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()


# ── Pydantic схемы ─────────────────────────────────────────────────────────
class ESFCreate(BaseModel):
    direction:       str   = "incoming"   # incoming | outgoing
    esf_number:      str
    esf_date:        str                  # YYYY-MM-DD
    supplier_name:   Optional[str] = None
    supplier_inn:    Optional[str] = None
    buyer_name:      Optional[str] = None
    buyer_inn:       Optional[str] = None
    contract_number: Optional[str] = None
    amount:          float
    vat_rate:        str   = "12"         # "12" | "0" | "exempt"
    vat_amount:      float = 0


# ── Хелпер: dict ───────────────────────────────────────────────────────────
def _esf_dict(e: models.ESF) -> dict:
    return {
        "id":                  e.id,
        "company_id":          e.company_id,
        "direction":           e.direction or "incoming",
        "esf_number":          e.esf_number,
        "esf_date":            e.esf_date.isoformat()[:10] if e.esf_date else None,
        "supplier_name":       e.supplier_name,
        "supplier_inn":        e.supplier_inn,
        "buyer_name":          e.buyer_name,
        "buyer_inn":           e.buyer_inn,
        "contract_number":     e.contract_number,
        "amount":              e.amount or 0,
        "vat_amount":          e.vat_amount or 0,
        "vat_rate":            e.vat_rate or "12",
        "status":              e.status or "pending",
        "accepted_at":         e.accepted_at.isoformat() if e.accepted_at else None,
        "linked_document_id":  e.linked_document_id,
        "bank_transaction_id": e.bank_transaction_id,
        "created_at":          e.created_at.isoformat() if e.created_at else None,
    }


# ── Список с фильтрами ─────────────────────────────────────────────────────
@router.get("/{company_id}")
def list_esf(
    company_id: int,
    direction:  Optional[str] = None,
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    q = db.query(models.ESF).filter(models.ESF.company_id == company_id)
    if direction:
        q = q.filter(models.ESF.direction == direction)
    if date_from:
        q = q.filter(models.ESF.esf_date >= datetime.strptime(date_from, "%Y-%m-%d"))
    if date_to:
        dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        q = q.filter(models.ESF.esf_date <= dt)
    records = q.order_by(models.ESF.esf_date.desc()).all()
    return [_esf_dict(r) for r in records]


# ── Книга покупок / продаж ─────────────────────────────────────────────────
@router.get("/{company_id}/book")
def get_book(
    company_id: int,
    direction:  str = "incoming",
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    q = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.direction  == direction,
    )
    if date_from:
        q = q.filter(models.ESF.esf_date >= datetime.strptime(date_from, "%Y-%m-%d"))
    if date_to:
        dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        q = q.filter(models.ESF.esf_date <= dt)
    records = q.order_by(models.ESF.esf_date).all()
    items = [_esf_dict(r) for r in records]
    return {
        "direction":       direction,
        "items":           items,
        "total_amount":    round(sum(r.amount     or 0 for r in records), 2),
        "total_vat":       round(sum(r.vat_amount or 0 for r in records), 2),
        "count":           len(records),
        "accepted_count":  sum(1 for r in records if r.status in ("accepted", "issued")),
        "pending_count":   sum(1 for r in records if r.status == "pending"),
    }


# ── Создать ────────────────────────────────────────────────────────────────
@router.post("/{company_id}")
def create_esf(
    company_id: int,
    data: ESFCreate,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf_date = (datetime.strptime(data.esf_date, "%Y-%m-%d")
                if data.esf_date else datetime.utcnow())

    # Авторасчёт НДС если не указан и ставка 12%
    vat_amount = data.vat_amount
    if vat_amount == 0 and data.vat_rate == "12" and data.amount > 0:
        vat_amount = round(data.amount * 12 / 112, 2)

    esf = models.ESF(
        company_id      = company_id,
        direction       = data.direction,
        esf_number      = data.esf_number,
        esf_date        = esf_date,
        supplier_name   = data.supplier_name,
        supplier_inn    = data.supplier_inn,
        buyer_name      = data.buyer_name,
        buyer_inn       = data.buyer_inn,
        contract_number = data.contract_number,
        amount          = data.amount,
        vat_amount      = vat_amount,
        vat_rate        = data.vat_rate,
        status          = "pending",
    )
    db.add(esf)
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Удалить ────────────────────────────────────────────────────────────────
@router.delete("/{company_id}/{esf_id}")
def delete_esf(
    company_id: int,
    esf_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    db.delete(esf)
    db.commit()
    return {"ok": True}


# ── Принять / выставить ────────────────────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/accept")
def accept_esf(
    company_id: int,
    esf_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.status      = "accepted" if esf.direction == "incoming" else "issued"
    esf.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Отменить принятие ──────────────────────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/unaccept")
def unaccept_esf(
    company_id: int,
    esf_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.status      = "pending"
    esf.accepted_at = None
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Привязать к банковской транзакции ─────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/link-tx/{tx_id}")
def link_transaction(
    company_id: int,
    esf_id: int,
    tx_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.bank_transaction_id = tx_id
    esf.linked_payment      = True
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Отвязать от транзакции ────────────────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/unlink-tx")
def unlink_transaction(
    company_id: int,
    esf_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.bank_transaction_id = None
    esf.linked_payment      = False
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Привязать к документу ─────────────────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/link-doc/{doc_id}")
def link_document(
    company_id: int,
    esf_id: int,
    doc_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.linked_document_id = doc_id
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)


# ── Отвязать от документа ─────────────────────────────────────────────────
@router.patch("/{company_id}/{esf_id}/unlink-doc")
def unlink_document(
    company_id: int,
    esf_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    esf = db.query(models.ESF).filter(
        models.ESF.id         == esf_id,
        models.ESF.company_id == company_id,
    ).first()
    if not esf:
        raise HTTPException(404, "ЭСФ не найден")
    esf.linked_document_id = None
    db.commit()
    db.refresh(esf)
    return _esf_dict(esf)
