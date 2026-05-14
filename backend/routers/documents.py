from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

@router.get("/{company_id}")
def list_documents(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    docs = db.query(models.Document).filter(models.Document.company_id == company_id).all()
    return docs

@router.patch("/{doc_id}/approve")
def approve_document(doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.status = "processed"
    db.commit()
    return {"ok": True}

@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}
