"""
Модуль «Коммуникации» — AI-консультант и письма клиентам.

A) AI-чат: бухгалтер задаёт вопросы, AI отвечает с реальными данными компании
B) Клиенту: AI генерирует готовое письмо (статус, запрос документов, дедлайны)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic

router = APIRouter()


# ── Pydantic схемы ─────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str

class ClientMsgRequest(BaseModel):
    message_type: str = "status"   # status | documents | deadline | payment


# ── Контекст компании для AI ──────────────────────────────────────────────
def get_company_context(company_id: int, db: Session) -> str:
    """Собирает актуальный контекст данных компании для передачи AI."""
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        return ""

    now = datetime.utcnow()
    quarter = (now.month - 1) // 3 + 1
    q_start = datetime(now.year, (quarter - 1) * 3 + 1, 1)

    lines = [
        f"=== ДАННЫЕ КОМПАНИИ «{company.name}» ===",
        f"Дата: {now.strftime('%d.%m.%Y')}, Квартал: Q{quarter} {now.year}",
        "",
    ]

    # ── ЭСФ текущего квартала ──────────────────────────────────────────────
    esf_in = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.direction  == "incoming",
        models.ESF.esf_date   >= q_start,
    ).all()
    esf_out = db.query(models.ESF).filter(
        models.ESF.company_id == company_id,
        models.ESF.direction  == "outgoing",
        models.ESF.esf_date   >= q_start,
    ).all()

    in_total   = sum(e.amount     or 0 for e in esf_in)
    in_vat     = sum(e.vat_amount or 0 for e in esf_in)
    in_pending = sum(1 for e in esf_in  if e.status == "pending")
    out_total  = sum(e.amount     or 0 for e in esf_out)
    out_vat    = sum(e.vat_amount or 0 for e in esf_out)
    nds_pay    = round(in_vat - out_vat, 2)

    lines += [
        f"[ЭСФ — Q{quarter} {now.year}]",
        f"  Входящие : {len(esf_in)} шт., сумма {in_total:,.2f} KGS, НДС {in_vat:,.2f} KGS, не принято: {in_pending}",
        f"  Исходящие: {len(esf_out)} шт., сумма {out_total:,.2f} KGS, НДС {out_vat:,.2f} KGS",
        f"  НДС к уплате (вх.-исх.): {nds_pay:,.2f} KGS",
        "",
    ]

    # ── Документы ─────────────────────────────────────────────────────────
    total_docs   = db.query(models.Document).filter(models.Document.company_id == company_id).count()
    pending_docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.status     == "pending",
    ).count()
    lines += [
        f"[Документы]",
        f"  Всего: {total_docs}, ожидают обработки: {pending_docs}",
        "",
    ]

    # ── Банк (остаток и обороты текущего месяца) ──────────────────────────
    accounts = db.query(models.BankAccount).filter(models.BankAccount.company_id == company_id).all()
    if accounts:
        month_start = datetime(now.year, now.month, 1)
        lines.append("[Банк]")
        for acc in accounts:
            all_txs = db.query(models.BankTransaction).filter(
                models.BankTransaction.account_id == acc.id
            ).all()
            balance = (acc.opening_balance or 0) + sum(
                t.amount if t.direction == "in" else -t.amount for t in all_txs
            )
            month_txs = [t for t in all_txs if t.date and t.date >= month_start]
            in_sum  = sum(t.amount for t in month_txs if t.direction == "in")
            out_sum = sum(t.amount for t in month_txs if t.direction == "out")
            name = acc.bank_name or "Банк"
            lines.append(f"  {name} ({acc.account_number or '—'}): остаток ≈{balance:,.2f} KGS")
            lines.append(f"    Текущий месяц: приход {in_sum:,.2f} KGS, расход {out_sum:,.2f} KGS")
        lines.append("")

    # ── Дедлайны (ближайшие 30 дней) ─────────────────────────────────────
    soon = now + timedelta(days=30)
    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id    == company_id,
        models.Deadline.deadline_date <= soon,
        models.Deadline.is_done       == False,
    ).order_by(models.Deadline.deadline_date).all()
    if deadlines:
        lines.append("[Дедлайны — ближайшие 30 дней]")
        for d in deadlines:
            days_left = max(0, (d.deadline_date - now).days)
            lines.append(f"  ⏰ {d.title}: {d.deadline_date.strftime('%d.%m.%Y')} (через {days_left} дн.)")
        lines.append("")

    # ── Зарплата (последний расчёт) ───────────────────────────────────────
    last_run = db.query(models.PayrollRun).filter(
        models.PayrollRun.company_id == company_id
    ).order_by(models.PayrollRun.year.desc(), models.PayrollRun.month.desc()).first()
    if last_run:
        MONTHS = ["","Январь","Февраль","Март","Апрель","Май","Июнь",
                  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
        lines += [
            f"[Зарплата]",
            f"  Последний расчёт: {MONTHS[last_run.month]} {last_run.year}",
            f"  Начислено: {last_run.gross_total:,.2f} KGS, к выдаче: {last_run.net_total:,.2f} KGS",
            f"  Выплата: {'✓ Выплачено' if last_run.is_paid else '✗ Не выплачено'}, "
            f"Налоги: {'✓ Оплачены' if last_run.is_tax_paid else '✗ Не оплачены'}",
            "",
        ]

    # ── Журнал (последние 10 проводок) ────────────────────────────────────
    entries = db.query(models.JournalEntry).filter(
        models.JournalEntry.company_id == company_id
    ).order_by(models.JournalEntry.entry_date.desc()).limit(10).all()
    if entries:
        lines.append("[Журнал — последние 10 проводок]")
        for e in entries:
            dt = e.entry_date.strftime("%d.%m") if e.entry_date else "—"
            lines.append(f"  {dt}  Дт{e.debit_account}/Кт{e.credit_account}  {float(e.amount):,.0f} KGS  — {e.description or ''}")
        lines.append("")

    return "\n".join(lines)


# ── Системный промпт AI-консультанта ──────────────────────────────────────
CHAT_SYSTEM = """\
Ты — AI-бухгалтер системы БухАгент (Кыргызстан).
Помогаешь бухгалтеру анализировать данные компании и отвечаешь на вопросы.

Правила:
- Отвечай на русском языке, кратко и по делу
- Используй конкретные числа из контекста ниже
- Если данных нет — честно скажи "В базе нет данных за этот период"
- Для расчётов НДС: ставка 12%, формула вычленения = сумма × 12 ÷ 112
- Налоги КР: ПН 10%, ПФР 8% (сч.3531), ГНПФР 2% (сч.3534), СФ работодателя 17.5% (сч.3530)
- Таблицы — только если явно нужны; иначе — текст с цифрами
- Не повторяй весь контекст в ответе — только нужное

{context}"""

# ── Промпты для писем клиенту ─────────────────────────────────────────────
CLIENT_PROMPTS = {
    "status": (
        "Напиши клиенту (директору бизнеса) краткий отчёт о текущем состоянии дел компании. "
        "Включи: статус документов, незакрытые ЭСФ, ближайшие дедлайны, статус зарплаты. "
        "Тон: деловой, понятный для не-бухгалтера. Не более 200 слов. "
        "Начни с приветствия, подпиши как «Ваш бухгалтер»."
    ),
    "documents": (
        "Напиши клиенту (директору) запрос на предоставление первичных документов. "
        "Укажи сколько документов ожидает обработки. Объясни что нужно предоставить и для чего. "
        "Тон: вежливый, но настойчивый. Не более 150 слов."
    ),
    "deadline": (
        "Напиши клиенту напоминание о ближайших налоговых дедлайнах. "
        "Перечисли конкретные даты и типы отчётности из данных. "
        "Укажи что нужно подготовить со стороны клиента. "
        "Тон: информативный, чёткий. Не более 150 слов."
    ),
    "payment": (
        "Напиши клиенту вежливое напоминание об оплате бухгалтерских услуг. "
        "Кратко упомяни выполненную работу (документы, ЭСФ, зарплата). "
        "Тон: профессиональный, ненавязчивый. Не более 100 слов."
    ),
}


# ── Хелпер ────────────────────────────────────────────────────────────────
def _msg_dict(m) -> dict:
    return {
        "id":         m.id,
        "role":       getattr(m, "role", "assistant"),
        "message_type": getattr(m, "message_type", None),
        "content":    m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════
# A) AI-ЧАТ
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{company_id}/chat")
def get_chat_history(
    company_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    """Последние 60 сообщений чата компании."""
    msgs = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.company_id == company_id)
        .order_by(models.ChatMessage.created_at.asc())
        .limit(60)
        .all()
    )
    return [_msg_dict(m) for m in msgs]


@router.post("/{company_id}/chat")
def send_chat_message(
    company_id: int,
    data: ChatRequest,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    """Отправить сообщение AI-консультанту; возвращает ответ AI."""
    if not data.message.strip():
        raise HTTPException(400, "Пустое сообщение")

    # 1. Сохраняем сообщение пользователя
    user_msg = models.ChatMessage(
        company_id=company_id, role="user", content=data.message.strip()
    )
    db.add(user_msg)
    db.commit()

    # 2. Тянем историю (последние 20 сообщений, включая только что добавленное)
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.company_id == company_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    # Берём последние 20
    history = history[-20:]
    messages_for_ai = [{"role": m.role, "content": m.content} for m in history]

    # 3. Собираем контекст компании
    context = get_company_context(company_id, db)

    # 4. Запрос к Claude Haiku (быстрый и дешёвый для чата)
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=800,
        system=CHAT_SYSTEM.format(context=context),
        messages=messages_for_ai,
    )
    ai_text = resp.content[0].text

    # 5. Сохраняем ответ AI
    ai_msg = models.ChatMessage(
        company_id=company_id, role="assistant", content=ai_text
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return _msg_dict(ai_msg)


@router.delete("/{company_id}/chat")
def clear_chat_history(
    company_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    """Очистить историю чата компании."""
    db.query(models.ChatMessage).filter(
        models.ChatMessage.company_id == company_id
    ).delete()
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# B) ПИСЬМА КЛИЕНТУ
# ══════════════════════════════════════════════════════════════════════════

@router.post("/{company_id}/client-message")
def generate_client_message(
    company_id: int,
    data: ClientMsgRequest,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    """Генерирует готовое письмо клиенту на основе данных компании."""
    msg_type = data.message_type if data.message_type in CLIENT_PROMPTS else "status"
    prompt_suffix = CLIENT_PROMPTS[msg_type]

    context = get_company_context(company_id, db)
    prompt  = f"{context}\n\nЗадача: {prompt_suffix}"

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    content = resp.content[0].text

    # Сохраняем в историю
    record = models.ClientMessage(
        company_id=company_id,
        message_type=msg_type,
        content=content,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return _msg_dict(record)


@router.get("/{company_id}/client-messages")
def get_client_messages(
    company_id: int,
    db:   Session = Depends(get_db),
    user  = Depends(get_current_user),
):
    """История сгенерированных писем клиенту."""
    msgs = (
        db.query(models.ClientMessage)
        .filter(models.ClientMessage.company_id == company_id)
        .order_by(models.ClientMessage.created_at.desc())
        .limit(20)
        .all()
    )
    return [_msg_dict(m) for m in msgs]


# ── Старые эндпоинты (обратная совместимость) ─────────────────────────────
@router.post("/generate")
def generate_message_legacy(data: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {"message": "Используйте новый эндпоинт /api/communications/{company_id}/client-message"}

@router.get("/{company_id}/reminders")
def get_reminders(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Автоматические напоминания на основе статуса компании (legacy)."""
    reminders = []
    pending_docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.status     == "pending",
    ).count()
    if pending_docs:
        reminders.append({"type":"documents","message":f"Ожидают обработки {pending_docs} документов","priority":"medium"})
    unlinked = db.query(models.ESF).filter(
        models.ESF.company_id    == company_id,
        models.ESF.linked_payment == False,
    ).count()
    if unlinked:
        reminders.append({"type":"esf","message":f"{unlinked} ЭСФ без привязки к оплате","priority":"high"})
    soon = datetime.utcnow() + timedelta(days=3)
    for d in db.query(models.Deadline).filter(
        models.Deadline.company_id    == company_id,
        models.Deadline.is_done       == False,
        models.Deadline.deadline_date <= soon,
    ).all():
        reminders.append({"type":"deadline","message":f"Дедлайн: {d.title} — {d.deadline_date.strftime('%d.%m.%Y')}","priority":"high"})
    return reminders
