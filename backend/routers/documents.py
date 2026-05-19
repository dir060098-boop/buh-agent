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


@router.get("/doc/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Получить документ по ID для просмотра оригинала."""
    from models import Document, Company
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    company = db.query(Company).filter(
        Company.id == doc.company_id,
        Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "doc_number": doc.doc_number,
        "doc_date": str(doc.doc_date)[:10] if doc.doc_date else None,
        "counterparty": doc.counterparty,
        "counterparty_inn": doc.counterparty_inn,
        "amount": doc.amount,
        "currency": doc.currency,
        "file_path": doc.file_path,
        "posting_status": doc.posting_status,
        "ai_summary": doc.ai_summary,
    }
