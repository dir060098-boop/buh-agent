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


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Сводка для интеллектуального дашборда:
    - По каждой компании: счётчики, статусы, ближайшие дедлайны
    - Лента событий: расхождения, ожидающие документы, дедлайны
    """
    from datetime import date, timedelta

    companies = db.query(models.Company).filter(
        models.Company.owner_id == user.id
    ).all()

    feed = []       # лента событий
    companies_out = []

    today = date.today()
    soon = today + timedelta(days=7)

    for c in companies:
        # Счётчики документов
        doc_count = db.query(models.Document).filter(
            models.Document.company_id == c.id
        ).count()
        pending_docs = db.query(models.Document).filter(
            models.Document.company_id == c.id,
            models.Document.posting_status == "pending",
            models.Document.amount != None
        ).count()
        needs_review = db.query(models.JournalEntry).filter(
            models.JournalEntry.company_id == c.id,
            models.JournalEntry.status == "needs_review"
        ).count()
        journal_count = db.query(models.JournalEntry).filter(
            models.JournalEntry.company_id == c.id
        ).count()

        # Дедлайны
        overdue = db.query(models.Deadline).filter(
            models.Deadline.company_id == c.id,
            models.Deadline.is_done == False,
            models.Deadline.due_date < today
        ).all() if hasattr(models, 'Deadline') else []

        upcoming = db.query(models.Deadline).filter(
            models.Deadline.company_id == c.id,
            models.Deadline.is_done == False,
            models.Deadline.due_date >= today,
            models.Deadline.due_date <= soon
        ).all() if hasattr(models, 'Deadline') else []

        # Формируем события для ленты
        if pending_docs > 0:
            feed.append({
                "type": "pending_docs",
                "priority": "warn",
                "company_id": c.id,
                "company_name": c.name,
                "message": f"{pending_docs} {'документ ожидает' if pending_docs == 1 else 'документов ожидают'} разноски",
                "action": "post_all",
                "action_label": "Разнести →"
            })

        if needs_review > 0:
            feed.append({
                "type": "needs_review",
                "priority": "warn",
                "company_id": c.id,
                "company_name": c.name,
                "message": f"{needs_review} {'проводка требует' if needs_review == 1 else 'проводок требуют'} проверки",
                "action": "journal",
                "action_label": "Проверить →"
            })

        for dl in overdue:
            feed.append({
                "type": "overdue_deadline",
                "priority": "error",
                "company_id": c.id,
                "company_name": c.name,
                "message": f"Просрочен: {dl.title}",
                "action": "deadlines",
                "action_label": "Перейти →"
            })

        for dl in upcoming:
            days_left = (dl.due_date - today).days
            feed.append({
                "type": "upcoming_deadline",
                "priority": "info",
                "company_id": c.id,
                "company_name": c.name,
                "message": f"{dl.title} — через {days_left} {'день' if days_left == 1 else 'дней'}",
                "action": "deadlines",
                "action_label": "Перейти →"
            })

        # Статус компании
        if len(overdue) > 0:
            status = "error"
            status_text = "Просроченные дедлайны"
        elif pending_docs > 0 or needs_review > 0:
            status = "warn"
            status_text = "Требует внимания"
        else:
            status = "ok"
            status_text = "Всё в порядке"

        companies_out.append({
            "id": c.id,
            "name": c.name,
            "inn": c.inn,
            "tax_regime": c.tax_regime,
            "doc_count": doc_count,
            "pending_docs": pending_docs,
            "needs_review": needs_review,
            "journal_count": journal_count,
            "overdue_deadlines": len(overdue),
            "upcoming_deadlines": len(upcoming),
            "status": status,
            "status_text": status_text,
            "can_delete": doc_count == 0 and journal_count == 0,
        })

    # Сортируем ленту: сначала error, потом warn, потом info
    priority_order = {"error": 0, "warn": 1, "info": 2}
    feed.sort(key=lambda x: priority_order.get(x["priority"], 3))

    return {
        "companies": companies_out,
        "feed": feed,
        "total_pending": sum(c["pending_docs"] for c in companies_out),
        "total_review": sum(c["needs_review"] for c in companies_out),
        "total_overdue": sum(c["overdue_deadlines"] for c in companies_out),
    }
