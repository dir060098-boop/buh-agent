from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic

router = APIRouter()

class MessageRequest(BaseModel):
    company_id: int
    context: str   # что нужно напомнить

COMM_PROMPT = """Ты помощник бухгалтера. Напиши вежливое, короткое сообщение клиенту (владельцу бизнеса) на русском языке.
Контекст: {context}
Компания: {company}
Требования: деловой тон, конкретно и по делу, не более 3-4 предложений, без лишних слов."""

@router.post("/generate")
def generate_message(data: MessageRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    company = db.query(models.Company).filter(models.Company.id == data.company_id).first()
    company_name = company.name if company else "компания"

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    prompt = COMM_PROMPT.format(context=data.context, company=company_name)

    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    return {"message": resp.content[0].text}

@router.get("/{company_id}/reminders")
def get_reminders(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Автоматические напоминания на основе статуса компании"""
    reminders = []

    pending_docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.status == "pending"
    ).count()
    if pending_docs > 0:
        reminders.append({"type": "documents", "message": f"Ожидают обработки {pending_docs} документов", "priority": "medium"})

    unlinked = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.linked_payment == False
    ).count()
    if unlinked > 0:
        reminders.append({"type": "esf", "message": f"{unlinked} ЭСФ без привязки к оплате", "priority": "high"})

    from datetime import datetime, timedelta
    soon = datetime.utcnow() + timedelta(days=3)
    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id == company_id,
        models.Deadline.is_done == False,
        models.Deadline.deadline_date <= soon
    ).all()
    for d in deadlines:
        reminders.append({"type": "deadline", "message": f"Дедлайн: {d.title} — {d.deadline_date.strftime('%d.%m.%Y')}", "priority": "high"})

    return reminders
