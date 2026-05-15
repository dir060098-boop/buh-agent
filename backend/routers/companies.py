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
    tax_regime: Optional[str] = "ОРН"

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    inn: Optional[str] = None
    tax_regime: Optional[str] = None
    inn_confirmed: Optional[bool] = False  # подтверждение смены ИНН

@router.get("/")
def list_companies(db: Session = Depends(get_db), user=Depends(get_current_user)):
    companies = db.query(models.Company).filter(models.Company.owner_id == user.id).all()
    result = []
    for c in companies:
        doc_count = db.query(models.Document).filter(models.Document.company_id == c.id).count()
        pending_docs = db.query(models.Document).filter(
            models.Document.company_id == c.id,
            models.Document.status == "pending"
        ).count()
        journal_count = db.query(models.JournalEntry).filter(models.JournalEntry.company_id == c.id).count()
        overdue_deadlines = db.query(models.Deadline).filter(
            models.Deadline.company_id == c.id,
            models.Deadline.is_done == False
        ).count()
        result.append({
            "id": c.id,
            "name": c.name,
            "inn": c.inn,
            "tax_regime": c.tax_regime,
            "doc_count": doc_count,
            "pending_docs": pending_docs,
            "journal_count": journal_count,
            "overdue_deadlines": overdue_deadlines,
            "can_delete": doc_count == 0 and journal_count == 0,
        })
    return result

@router.post("/")
def create_company(data: CompanyCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    name = data.name.strip()
    inn = data.inn.strip() if data.inn else None

    if not name:
        raise HTTPException(status_code=400, detail="Название компании обязательно")

    # Проверка уникальности по ИНН (если введён)
    if inn:
        exists = db.query(models.Company).filter(
            models.Company.owner_id == user.id,
            models.Company.inn == inn
        ).first()
        if exists:
            raise HTTPException(
                status_code=400,
                detail=f"Компания с ИНН {inn} уже существует: «{exists.name}»"
            )
    else:
        # Нет ИНН — проверяем по названию
        exists = db.query(models.Company).filter(
            models.Company.owner_id == user.id,
            models.Company.name == name
        ).first()
        if exists:
            raise HTTPException(
                status_code=400,
                detail=f"Компания с названием «{name}» уже существует"
            )

    company = models.Company(name=name, inn=inn, tax_regime=data.tax_regime, owner_id=user.id)
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
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return c

@router.patch("/{company_id}")
def update_company(
    company_id: int,
    data: CompanyUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    c = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    # Обновляем название
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        # Проверяем уникальность нового названия
        exists = db.query(models.Company).filter(
            models.Company.owner_id == user.id,
            models.Company.name == name,
            models.Company.id != company_id
        ).first()
        if exists:
            raise HTTPException(status_code=400, detail=f"Компания с названием «{name}» уже существует")
        c.name = name

    # Обновляем ИНН — только с подтверждением
    if data.inn is not None:
        inn = data.inn.strip()
        if inn != (c.inn or ""):
            if not data.inn_confirmed:
                raise HTTPException(
                    status_code=400,
                    detail="INN_CONFIRM_REQUIRED"  # фронтенд поймает и покажет диалог
                )
            # Проверяем уникальность нового ИНН
            if inn:
                exists = db.query(models.Company).filter(
                    models.Company.owner_id == user.id,
                    models.Company.inn == inn,
                    models.Company.id != company_id
                ).first()
                if exists:
                    raise HTTPException(status_code=400, detail=f"Компания с ИНН {inn} уже существует: «{exists.name}»")
            c.inn = inn

    # Обновляем налоговый режим
    if data.tax_regime is not None:
        c.tax_regime = data.tax_regime

    db.commit()
    db.refresh(c)
    return c

@router.delete("/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    # Проверяем есть ли данные
    doc_count = db.query(models.Document).filter(models.Document.company_id == company_id).count()
    journal_count = db.query(models.JournalEntry).filter(models.JournalEntry.company_id == company_id).count()

    if doc_count > 0 or journal_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя удалить компанию: есть {doc_count} документов и {journal_count} проводок. Сначала удалите данные."
        )

    db.delete(c)
    db.commit()
    return {"ok": True}
