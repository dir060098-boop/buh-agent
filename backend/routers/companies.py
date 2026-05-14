from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

class CompanyCreate(BaseModel):
    name: str
    inn: Optional[str] = None
    tax_regime: Optional[str] = None  # ОРН, упрощёнка, патент

@router.get("/")
def list_companies(db: Session = Depends(get_db), user=Depends(get_current_user)):
    companies = db.query(models.Company).filter(models.Company.owner_id == user.id).all()
    result = []
    for c in companies:
        # Считаем сводку по каждой компании
        pending_docs = db.query(models.Document).filter(
            models.Document.company_id == c.id,
            models.Document.status == "pending"
        ).count()
        unlinked_esf = db.query(models.ESF).filter(
            models.ESF.company_id == c.id,
            models.ESF.linked_payment == False
        ).count()
        overdue_deadlines = db.query(models.Deadline).filter(
            models.Deadline.company_id == c.id,
            models.Deadline.is_done == False
        ).count()
        result.append({
            "id": c.id,
            "name": c.name,
            "inn": c.inn,
            "tax_regime": c.tax_regime,
            "pending_docs": pending_docs,
            "unlinked_esf": unlinked_esf,
            "overdue_deadlines": overdue_deadlines,
        })
    return result

@router.post("/")
def create_company(data: CompanyCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    company = models.Company(**data.dict(), owner_id=user.id)
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

@router.get("/{company_id}")
def get_company(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    return c

@router.delete("/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(c)
    db.commit()
    return {"ok": True}
