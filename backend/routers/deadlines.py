from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

class DeadlineCreate(BaseModel):
    title: str
    deadline_date: datetime
    tax_type: str

@router.get("/{company_id}")
def list_deadlines(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Deadline).filter(
        models.Deadline.company_id == company_id,
        models.Deadline.is_done == False
    ).order_by(models.Deadline.deadline_date).all()

@router.post("/{company_id}")
def create_deadline(company_id: int, data: DeadlineCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = models.Deadline(**data.dict(), company_id=company_id)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d

@router.patch("/{deadline_id}/done")
def mark_done(deadline_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(models.Deadline).filter(models.Deadline.id == deadline_id).first()
    if d:
        d.is_done = True
        db.commit()
    return {"ok": True}
