from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

class ESFCreate(BaseModel):
    esf_number: str
    esf_date: datetime
    supplier_inn: str
    supplier_name: str
    amount: float
    vat_amount: float = 0
    status: str = "принят"

@router.get("/{company_id}")
def list_esf(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    records = db.query(models.ESF).filter(models.ESF.company_id == company_id).all()
    return records

@router.get("/{company_id}/unlinked")
def unlinked_esf(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """ЭСФ без привязки к оплате — главный риск-индикатор"""
    records = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.linked_payment == False
    ).all()
    return {"count": len(records), "items": records}

@router.post("/{company_id}")
def create_esf(company_id: int, data: ESFCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    esf = models.ESF(**data.dict(), company_id=company_id)
    db.add(esf)
    db.commit()
    db.refresh(esf)
    return esf

@router.patch("/{esf_id}/link/{doc_id}")
def link_esf_to_payment(esf_id: int, doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    esf = db.query(models.ESF).filter(models.ESF.id == esf_id).first()
    if not esf:
        raise HTTPException(status_code=404, detail="ESF not found")
    esf.linked_payment = True
    esf.linked_document_id = doc_id
    db.commit()
    return {"ok": True}
