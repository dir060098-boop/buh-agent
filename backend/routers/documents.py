from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from routers.auth import get_current_user
from typing import Optional
import models

router = APIRouter()

DOC_TYPE_LABELS = {
    "invoice": "Счёт на оплату",
    "act": "Акт",
    "esf": "ЭСФ",
    "ttn": "Накладная (ТТН)",
    "contract": "Договор",
    "receipt": "Квитанция",
    "payment_order": "Платёжное поручение",
    "bank_statement": "Выписка банка",
    "payroll": "Зарплатная ведомость",
    "other": "Прочее",
}

def doc_to_dict(doc):
    return {
        "id": doc.id,
        "doc_type": doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type),
        "doc_type_label": DOC_TYPE_LABELS.get(
            doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type), "Прочее"
        ),
        "doc_number": doc.doc_number,
        "doc_date": str(doc.doc_date)[:10] if doc.doc_date else None,
        "counterparty": doc.counterparty,
        "counterparty_inn": doc.counterparty_inn,
        "amount": doc.amount,
        "currency": doc.currency or "KGS",
        "vat_amount": doc.vat_amount or 0,
        "posting_status": doc.posting_status or "pending",
        "operation_type": doc.operation_type,
        "ai_confidence": doc.ai_confidence,
        "ai_summary": doc.ai_summary,
        "file_path": doc.file_path,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/{company_id}")
def list_documents(
    company_id: int,
    search: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    posting_status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(models.Document).filter(models.Document.company_id == company_id)

    if search:
        q = q.filter(
            or_(
                models.Document.counterparty.ilike(f"%{search}%"),
                models.Document.doc_number.ilike(f"%{search}%"),
                models.Document.operation_type.ilike(f"%{search}%"),
            )
        )
    if doc_type:
        q = q.filter(models.Document.doc_type == doc_type)
    if posting_status:
        q = q.filter(models.Document.posting_status == posting_status)
    if date_from:
        q = q.filter(models.Document.doc_date >= date_from)
    if date_to:
        q = q.filter(models.Document.doc_date <= date_to)

    total = q.count()
    docs  = q.order_by(models.Document.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [doc_to_dict(d) for d in docs], "total": total, "has_more": offset + limit < total}


@router.get("/doc/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    company = db.query(models.Company).filter(
        models.Company.id == doc.company_id,
        models.Company.owner_id == user.id,
    ).first()
    if not company:
        raise HTTPException(status_code=403, detail="Нет доступа")
    return doc_to_dict(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}
