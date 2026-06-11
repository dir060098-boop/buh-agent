"""
Модуль «Коммуникации» — AI-бухгалтер с инструментами + письма клиентам.

Архитектура чата: agentic tool use.
Claude Sonnet 4.5 сам решает какие данные запросить из БД через инструменты.
Это исключает галлюцинации — AI отвечает только на основе реальных данных.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import get_db, settings
from routers.auth import get_current_user, require_company
import models, anthropic, json

router = APIRouter()


# ── Pydantic схемы ─────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str

class ClientMsgRequest(BaseModel):
    message_type: str = "status"


# ══════════════════════════════════════════════════════════════════════════
# ИНСТРУМЕНТЫ (Tools) — AI сам решает когда и что запрашивать
# ══════════════════════════════════════════════════════════════════════════

TOOLS = [
    {
        "name": "query_journal",
        "description": (
            "Запрашивает проводки из журнала хозяйственных операций. "
            "Используй для: вопросов о конкретных операциях, оборотах по счетам, "
            "суммах за период, проводках по контрагенту. "
            "Без ограничений по дате — запрашивай любой период."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from":    {"type": "string", "description": "Начало периода YYYY-MM-DD"},
                "date_to":      {"type": "string", "description": "Конец периода YYYY-MM-DD"},
                "counterparty": {"type": "string", "description": "Часть имени контрагента"},
                "debit":        {"type": "string", "description": "Код дебет-счёта или его начало"},
                "credit":       {"type": "string", "description": "Код кредит-счёта или его начало"},
                "search":       {"type": "string", "description": "Текстовый поиск в описании"},
                "limit":        {"type": "integer", "description": "Макс. строк, по умолч. 100"},
            },
        },
    },
    {
        "name": "query_esf",
        "description": (
            "Запрашивает ЭСФ (электронные счёт-фактуры). "
            "Используй для: НДС к уплате, входящих/исходящих ЭСФ, "
            "поиска по поставщику/покупателю, проверки конкретной ЭСФ."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "direction":    {"type": "string", "enum": ["incoming", "outgoing", "all"]},
                "date_from":    {"type": "string"},
                "date_to":      {"type": "string"},
                "counterparty": {"type": "string", "description": "Поставщик или покупатель"},
                "esf_number":   {"type": "string", "description": "Номер ЭСФ"},
                "status":       {"type": "string", "enum": ["pending", "accepted", "issued", "all"]},
                "limit":        {"type": "integer"},
            },
        },
    },
    {
        "name": "query_bank",
        "description": (
            "Запрашивает банковские транзакции по всем счетам компании. "
            "Используй для: платежей, поступлений, поиска конкретных операций, "
            "оборотов за период."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from":    {"type": "string"},
                "date_to":      {"type": "string"},
                "direction":    {"type": "string", "enum": ["in", "out", "all"], "description": "in=приход, out=расход"},
                "counterparty": {"type": "string"},
                "purpose":      {"type": "string", "description": "Поиск в назначении платежа"},
                "min_amount":   {"type": "number"},
                "max_amount":   {"type": "number"},
                "limit":        {"type": "integer"},
            },
        },
    },
    {
        "name": "get_bank_balances",
        "description": "Возвращает текущие остатки по всем банковским счетам и кассе.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "query_documents",
        "description": (
            "Запрашивает документы из архива (счета, акты, накладные, квитанции и др.). "
            "Используй для: поиска конкретного документа, проверки его существования, "
            "статистики по типам документов."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doc_type":     {"type": "string", "description": "invoice|act|esf|ttn|contract|receipt|payment_order|other"},
                "date_from":    {"type": "string"},
                "date_to":      {"type": "string"},
                "counterparty": {"type": "string"},
                "search":       {"type": "string", "description": "Поиск в описании и типе операции"},
                "doc_number":   {"type": "string", "description": "Номер документа"},
                "limit":        {"type": "integer"},
            },
        },
    },
    {
        "name": "query_salary",
        "description": "Запрашивает расчёты зарплаты и данные сотрудников.",
        "input_schema": {
            "type": "object",
            "properties": {
                "year":  {"type": "integer", "description": "Год расчёта"},
                "month": {"type": "integer", "description": "Месяц 1-12, или пропустить для всех"},
                "include_employees": {"type": "boolean", "description": "Включить список сотрудников"},
            },
        },
    },
    {
        "name": "query_deadlines",
        "description": "Запрашивает налоговые дедлайны и сроки отчётности.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string"},
                "date_to":   {"type": "string"},
                "is_done":   {"type": "boolean", "description": "true=выполненные, false=невыполненные"},
                "tax_type":  {"type": "string", "description": "nds|income_tax|social_fund|unified_tax|patent|other"},
            },
        },
    },
]


# ══════════════════════════════════════════════════════════════════════════
# ВЫПОЛНЕНИЕ ИНСТРУМЕНТОВ — реальные запросы к БД
# ══════════════════════════════════════════════════════════════════════════

def _execute_tool(name: str, params: dict, company_id: int, db: Session) -> dict:
    """Выполняет инструмент и возвращает JSON-результат для AI."""

    # ── Журнал проводок ───────────────────────────────────────────────────
    if name == "query_journal":
        q = db.query(models.JournalEntry, models.Document).outerjoin(
            models.Document, models.JournalEntry.document_id == models.Document.id
        ).filter(models.JournalEntry.company_id == company_id)

        if params.get("date_from"):
            q = q.filter(models.JournalEntry.entry_date >= params["date_from"])
        if params.get("date_to"):
            q = q.filter(models.JournalEntry.entry_date <= params["date_to"])
        if params.get("debit"):
            q = q.filter(models.JournalEntry.debit_account.ilike(f"{params['debit']}%"))
        if params.get("credit"):
            q = q.filter(models.JournalEntry.credit_account.ilike(f"{params['credit']}%"))
        if params.get("search"):
            q = q.filter(models.JournalEntry.description.ilike(f"%{params['search']}%"))
        if params.get("counterparty"):
            q = q.filter(models.Document.counterparty.ilike(f"%{params['counterparty']}%"))

        total = q.count()
        limit = min(params.get("limit", 100), 500)
        rows  = q.order_by(models.JournalEntry.entry_date.desc()).limit(limit).all()

        if not rows:
            return {"found": 0, "note": "Проводки не найдены по указанным критериям.", "items": []}

        items = []
        for e, doc in rows:
            items.append({
                "date":         str(e.entry_date),
                "debit":        e.debit_account,
                "debit_name":   e.debit_account_name or "",
                "credit":       e.credit_account,
                "credit_name":  e.credit_account_name or "",
                "amount":       float(e.amount),
                "currency":     e.currency,
                "description":  e.description,
                "counterparty": doc.counterparty if doc else None,
                "doc_number":   doc.doc_number if doc else None,
                "status":       e.status,
                "is_archived":  e.is_archived or False,
            })

        total_sum = round(sum(i["amount"] for i in items), 2)
        return {"found_total": total, "returned": len(items),
                "sum_returned": total_sum, "items": items}

    # ── ЭСФ ───────────────────────────────────────────────────────────────
    elif name == "query_esf":
        q = db.query(models.ESF).filter(models.ESF.company_id == company_id)

        direction = params.get("direction", "all")
        if direction != "all":
            q = q.filter(models.ESF.direction == direction)
        if params.get("date_from"):
            q = q.filter(models.ESF.esf_date >= params["date_from"])
        if params.get("date_to"):
            q = q.filter(models.ESF.esf_date <= params["date_to"])
        if params.get("esf_number"):
            q = q.filter(models.ESF.esf_number.ilike(f"%{params['esf_number']}%"))
        if params.get("counterparty"):
            cp = params["counterparty"]
            from sqlalchemy import or_
            q = q.filter(or_(
                models.ESF.supplier_name.ilike(f"%{cp}%"),
                models.ESF.buyer_name.ilike(f"%{cp}%"),
            ))
        if params.get("status") and params["status"] != "all":
            q = q.filter(models.ESF.status == params["status"])

        total = q.count()
        limit = min(params.get("limit", 100), 500)
        records = q.order_by(models.ESF.esf_date.desc()).limit(limit).all()

        if not records:
            return {"found": 0, "note": "ЭСФ не найдены по указанным критериям.", "items": []}

        total_amount = round(sum(r.amount     or 0 for r in records), 2)
        total_vat    = round(sum(r.vat_amount or 0 for r in records), 2)

        items = [{
            "esf_number":   r.esf_number,
            "date":         r.esf_date.strftime("%Y-%m-%d") if r.esf_date else None,
            "direction":    r.direction,
            "supplier":     r.supplier_name,
            "supplier_inn": r.supplier_inn,
            "buyer":        r.buyer_name,
            "buyer_inn":    r.buyer_inn,
            "amount":       r.amount,
            "vat_amount":   r.vat_amount,
            "vat_rate":     r.vat_rate,
            "status":       r.status,
        } for r in records]

        return {
            "found_total":    total,
            "returned":       len(items),
            "total_amount":   total_amount,
            "total_vat":      total_vat,
            "nds_to_pay":     round(
                sum(r.vat_amount or 0 for r in records if r.direction == "outgoing") -
                sum(r.vat_amount or 0 for r in records if r.direction == "incoming"), 2
            ) if direction == "all" else None,
            "items": items,
        }

    # ── Банк: транзакции ──────────────────────────────────────────────────
    elif name == "query_bank":
        accs = db.query(models.BankAccount).filter(
            models.BankAccount.company_id == company_id
        ).all()
        acc_ids = [a.id for a in accs]
        acc_map = {a.id: a for a in accs}

        if not acc_ids:
            return {"found": 0, "note": "Банковские счета не найдены.", "items": []}

        q = db.query(models.BankTransaction).filter(
            models.BankTransaction.account_id.in_(acc_ids)
        )

        direction = params.get("direction", "all")
        if direction != "all":
            q = q.filter(models.BankTransaction.direction == direction)
        if params.get("date_from"):
            q = q.filter(models.BankTransaction.date >= params["date_from"])
        if params.get("date_to"):
            q = q.filter(models.BankTransaction.date <= params["date_to"])
        if params.get("counterparty"):
            q = q.filter(models.BankTransaction.counterparty.ilike(f"%{params['counterparty']}%"))
        if params.get("purpose"):
            q = q.filter(models.BankTransaction.purpose.ilike(f"%{params['purpose']}%"))
        if params.get("min_amount"):
            q = q.filter(models.BankTransaction.amount >= params["min_amount"])
        if params.get("max_amount"):
            q = q.filter(models.BankTransaction.amount <= params["max_amount"])

        total = q.count()
        limit = min(params.get("limit", 100), 500)
        txs   = q.order_by(models.BankTransaction.date.desc()).limit(limit).all()

        if not txs:
            return {"found": 0, "note": "Транзакции не найдены по указанным критериям.", "items": []}

        items = [{
            "date":        t.date.strftime("%Y-%m-%d") if t.date else None,
            "bank":        acc_map[t.account_id].bank_name if t.account_id in acc_map else "?",
            "account":     acc_map[t.account_id].account_number if t.account_id in acc_map else "?",
            "direction":   t.direction,
            "amount":      t.amount,
            "currency":    t.currency,
            "counterparty":t.counterparty,
            "purpose":     t.purpose,
            "status":      t.status,
        } for t in txs]

        return {
            "found_total": total,
            "returned":    len(items),
            "total_in":    round(sum(i["amount"] for i in items if i["direction"] == "in"),  2),
            "total_out":   round(sum(i["amount"] for i in items if i["direction"] == "out"), 2),
            "items": items,
        }

    # ── Банк: остатки ─────────────────────────────────────────────────────
    elif name == "get_bank_balances":
        accs = db.query(models.BankAccount).filter(
            models.BankAccount.company_id == company_id
        ).all()
        if not accs:
            return {"note": "Банковские счета не найдены.", "accounts": []}

        result = []
        for acc in accs:
            txs = db.query(models.BankTransaction).filter(
                models.BankTransaction.account_id == acc.id
            ).all()
            balance = (acc.opening_balance or 0) + sum(
                t.amount if t.direction == "in" else -t.amount for t in txs
            )
            result.append({
                "bank":      acc.bank_name,
                "account":   acc.account_number,
                "currency":  acc.currency,
                "is_cash":   acc.is_cash,
                "balance":   round(balance, 2),
                "tx_count":  len(txs),
            })

        total_kgs = round(sum(a["balance"] for a in result if a["currency"] == "KGS"), 2)
        return {"accounts": result, "total_kgs": total_kgs}

    # ── Документы ─────────────────────────────────────────────────────────
    elif name == "query_documents":
        q = db.query(models.Document).filter(models.Document.company_id == company_id)

        if params.get("doc_type"):
            q = q.filter(models.Document.doc_type == params["doc_type"])
        if params.get("date_from"):
            q = q.filter(models.Document.doc_date >= params["date_from"])
        if params.get("date_to"):
            q = q.filter(models.Document.doc_date <= params["date_to"])
        if params.get("counterparty"):
            q = q.filter(models.Document.counterparty.ilike(f"%{params['counterparty']}%"))
        if params.get("doc_number"):
            q = q.filter(models.Document.doc_number.ilike(f"%{params['doc_number']}%"))
        if params.get("search"):
            from sqlalchemy import or_
            q = q.filter(or_(
                models.Document.operation_type.ilike(f"%{params['search']}%"),
                models.Document.ai_summary.ilike(f"%{params['search']}%"),
            ))

        total = q.count()
        limit = min(params.get("limit", 100), 500)
        docs  = q.order_by(models.Document.doc_date.desc()).limit(limit).all()

        if not docs:
            return {"found": 0, "note": "Документы не найдены по указанным критериям.", "items": []}

        items = [{
            "doc_number":   d.doc_number,
            "doc_type":     str(d.doc_type).replace("DocType.", "") if d.doc_type else None,
            "date":         d.doc_date.strftime("%Y-%m-%d") if d.doc_date else None,
            "counterparty": d.counterparty,
            "inn":          d.counterparty_inn,
            "amount":       d.amount,
            "currency":     d.currency,
            "vat":          d.vat_amount,
            "operation":    d.operation_type,
            "status":       d.posting_status,
        } for d in docs]

        return {
            "found_total":   total,
            "returned":      len(items),
            "total_amount":  round(sum((i["amount"] or 0) for i in items), 2),
            "items": items,
        }

    # ── Зарплата ──────────────────────────────────────────────────────────
    elif name == "query_salary":
        q = db.query(models.PayrollRun).filter(
            models.PayrollRun.company_id == company_id
        )
        if params.get("year"):
            q = q.filter(models.PayrollRun.year == params["year"])
        if params.get("month"):
            q = q.filter(models.PayrollRun.month == params["month"])

        runs = q.order_by(models.PayrollRun.year.desc(), models.PayrollRun.month.desc()).all()

        if not runs:
            return {"found": 0, "note": "Расчёты зарплаты не найдены.", "items": []}

        MONTHS = ["","Январь","Февраль","Март","Апрель","Май","Июнь",
                  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]

        items = [{
            "period":       f"{MONTHS[r.month]} {r.year}",
            "gross":        r.gross_total,
            "income_tax":   r.income_tax_total,
            "pfr_employee": r.sf_employee_total,
            "gnpfr":        r.gnpfr_total or 0,
            "pfr_employer": r.sf_employer_total,
            "net":          r.net_total,
            "is_paid":      r.is_paid,
            "is_tax_paid":  r.is_tax_paid,
        } for r in runs]

        # Сотрудники
        if params.get("include_employees"):
            employees = db.query(models.Employee).filter(
                models.Employee.company_id == company_id,
                models.Employee.is_active   == True,
            ).all()
            emp_list = [{
                "name":     e.full_name,
                "position": e.position,
                "dept":     e.department,
                "salary":   e.salary,
            } for e in employees]
            return {"found": len(runs), "payroll_runs": items, "employees": emp_list}

        return {"found": len(runs), "items": items}

    # ── Дедлайны ──────────────────────────────────────────────────────────
    elif name == "query_deadlines":
        q = db.query(models.Deadline).filter(
            models.Deadline.company_id == company_id
        )
        if params.get("date_from"):
            q = q.filter(models.Deadline.deadline_date >= params["date_from"])
        if params.get("date_to"):
            q = q.filter(models.Deadline.deadline_date <= params["date_to"])
        if params.get("is_done") is not None:
            q = q.filter(models.Deadline.is_done == params["is_done"])
        if params.get("tax_type"):
            q = q.filter(models.Deadline.tax_type == params["tax_type"])

        deadlines = q.order_by(models.Deadline.deadline_date).all()
        if not deadlines:
            return {"found": 0, "note": "Дедлайны не найдены.", "items": []}

        now = datetime.utcnow()
        items = [{
            "title":         d.title,
            "tax_type":      d.tax_type,
            "period":        d.period,
            "deadline_date": d.deadline_date.strftime("%Y-%m-%d") if d.deadline_date else None,
            "days_left":     max(0, (d.deadline_date - now).days) if d.deadline_date else None,
            "is_done":       d.is_done,
            "notes":         d.notes,
        } for d in deadlines]

        return {"found": len(items), "items": items}

    return {"error": f"Неизвестный инструмент: {name}"}


# ══════════════════════════════════════════════════════════════════════════
# СИСТЕМНЫЙ ПРОМПТ
# ══════════════════════════════════════════════════════════════════════════

CHAT_SYSTEM = """\
Ты — AI-бухгалтер системы БухАгент (Кыргызстан).
{company_info}
Сегодня: {today}

══════ АБСОЛЮТНЫЕ ПРАВИЛА (нарушение недопустимо) ══════
1. НИКОГДА не придумывай данные, суммы, даты, контрагентов.
2. ВСЕГДА используй инструменты для получения данных из базы перед ответом.
3. Если инструмент вернул found=0 или пустой список — отвечай честно:
   "По данным системы, [такой операции / документа / ЭСФ] не найдено."
4. Не предполагай и не оценивай приблизительно. Только точные данные из БД.
5. Если данных нет за период — так и скажи: "За указанный период данных нет."
6. Для теоретических вопросов о законах (без конкретных данных компании) —
   отвечай на основе знаний, но отмечай что это общая информация, не данные системы.

══════ КОГДА ИСПОЛЬЗОВАТЬ ИНСТРУМЕНТЫ ══════
• Вопрос о конкретной сумме, дате, контрагенте → ОБЯЗАТЕЛЬНО запроси БД
• "Была ли операция X?" → query_journal + query_bank (оба!)
• "Сколько НДС за квартал?" → query_esf с периодом, direction=all
• "Покажи платежи от поставщика Y" → query_bank + query_esf
• "Есть ли документ №123?" → query_documents с doc_number
• "Зарплата за март?" → query_salary
• "Остаток на счёте?" → get_bank_balances
• Любой вопрос "есть ли...", "было ли...", "сколько..." → инструменты!

══════ ЗНАНИЯ (без инструментов) ══════
• Налоговый кодекс КР 2026: НДС 12%, ПН 10%, ПФР 8% (3531), ГНПФР 2% (3534), СФ работодателя 17.5% (3530)
• Формула вычленения НДС: сумма × 12 ÷ 112
• МСФО, НСФО, план счетов КР (Постановление №28, 252 счёта)
• Налоговое законодательство РФ (общие принципы)
• ВЭД, таможня, ЕАЭС, классификация ТН ВЭД, международная торговля 2026

══════ ФОРМАТ ОТВЕТОВ ══════
• Русский язык, кратко и конкретно
• Числа из БД — точные, с форматированием (1 234 567 KGS)
• Таблица — только если 3+ позиций для сравнения
• Не пересказывай весь результат запроса — только суть и ключевые цифры
"""


# ══════════════════════════════════════════════════════════════════════════
# A) AI-ЧАТ — agentic loop с tool use
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{company_id}/chat")
def get_chat_history(
    company_id: int,
    db:   Session = Depends(get_db),
    company = Depends(require_company),
):
    """Последние 60 сообщений чата."""
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
    company = Depends(require_company),
):
    """Отправить сообщение AI-бухгалтеру. Использует tool use для запроса БД."""
    if not data.message.strip():
        raise HTTPException(400, "Пустое сообщение")

    # 1. Сохраняем сообщение пользователя
    user_msg = models.ChatMessage(
        company_id=company_id, role="user", content=data.message.strip()
    )
    db.add(user_msg)
    db.commit()

    # 2. История (последние 20 сообщений)
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.company_id == company_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )[-20:]
    messages_for_ai = [{"role": m.role, "content": m.content} for m in history]

    # 3. Информация о компании для системного промпта
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    company_info = (
        f"Компания: {company.name}, ИНН: {company.inn or '—'}, "
        f"Налоговый режим: {company.tax_regime or '—'}"
    ) if company else f"Компания ID: {company_id}"
    today = datetime.utcnow().strftime("%d.%m.%Y")
    system = CHAT_SYSTEM.format(company_info=company_info, today=today)

    # 4. Agentic loop: Claude сам решает когда и какие инструменты использовать
    ai_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    MAX_ITERATIONS = 8
    ai_text = "Не удалось получить ответ. Попробуйте ещё раз."

    for iteration in range(MAX_ITERATIONS):
        response = ai_client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            system=system,
            tools=TOOLS,
            messages=messages_for_ai,
        )

        if response.stop_reason == "tool_use":
            # AI хочет использовать инструменты — выполняем запросы к БД
            messages_for_ai.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    print(f"[CHAT] Tool call: {block.name}({json.dumps(block.input, ensure_ascii=False)[:200]})")
                    result = _execute_tool(block.name, block.input, company_id, db)
                    print(f"[CHAT] Tool result: found={result.get('found_total', result.get('found', '?'))}")
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": block.id,
                        "content":     json.dumps(result, ensure_ascii=False, default=str),
                    })
            messages_for_ai.append({"role": "user", "content": tool_results})

        elif response.stop_reason in ("end_turn", "max_tokens"):
            # Финальный ответ
            for block in response.content:
                if hasattr(block, "text"):
                    ai_text = block.text
                    break
            break

        else:
            break

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
    company = Depends(require_company),
):
    db.query(models.ChatMessage).filter(
        models.ChatMessage.company_id == company_id
    ).delete()
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# B) ПИСЬМА КЛИЕНТУ
# ══════════════════════════════════════════════════════════════════════════

def get_company_context(company_id: int, db: Session) -> str:
    """Краткий контекст для генерации писем клиенту."""
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        return ""
    now = datetime.utcnow()
    quarter = (now.month - 1) // 3 + 1
    q_start = datetime(now.year, (quarter - 1) * 3 + 1, 1)

    esf_in  = db.query(models.ESF).filter(models.ESF.company_id == company_id, models.ESF.direction == "incoming", models.ESF.esf_date >= q_start).all()
    esf_out = db.query(models.ESF).filter(models.ESF.company_id == company_id, models.ESF.direction == "outgoing", models.ESF.esf_date >= q_start).all()
    in_vat  = sum(e.vat_amount or 0 for e in esf_in)
    out_vat = sum(e.vat_amount or 0 for e in esf_out)

    pending_docs = db.query(models.Document).filter(
        models.Document.company_id == company_id,
        models.Document.status == "pending"
    ).count()

    soon = now + timedelta(days=30)
    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id == company_id,
        models.Deadline.deadline_date <= soon,
        models.Deadline.is_done == False,
    ).all()

    last_run = db.query(models.PayrollRun).filter(
        models.PayrollRun.company_id == company_id
    ).order_by(models.PayrollRun.year.desc(), models.PayrollRun.month.desc()).first()

    lines = [f"Компания: {company.name}", f"Дата: {now.strftime('%d.%m.%Y')}, Q{quarter} {now.year}"]
    lines.append(f"ЭСФ входящие: {len(esf_in)} шт., НДС {in_vat:,.0f} KGS; исходящие: {len(esf_out)} шт., НДС {out_vat:,.0f} KGS")
    lines.append(f"НДС к уплате: {out_vat - in_vat:,.0f} KGS")
    lines.append(f"Документов на обработке: {pending_docs}")
    if deadlines:
        lines.append("Дедлайны: " + "; ".join(f"{d.title} — {d.deadline_date.strftime('%d.%m.%Y')}" for d in deadlines))
    if last_run:
        MONTHS = ["","Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
        lines.append(f"Зарплата: {MONTHS[last_run.month]} {last_run.year}, к выдаче {last_run.net_total:,.0f} KGS, {'выплачена' if last_run.is_paid else 'не выплачена'}")

    return "\n".join(lines)


CLIENT_PROMPTS = {
    "status": "Напиши клиенту краткий отчёт о состоянии дел. Включи: документы, ЭСФ, дедлайны, зарплату. Тон: деловой. До 200 слов. Приветствие + подпись «Ваш бухгалтер».",
    "documents": "Напиши запрос на предоставление документов. Укажи сколько ждут обработки. Тон: вежливый, но настойчивый. До 150 слов.",
    "deadline": "Напиши напоминание о налоговых дедлайнах с конкретными датами. До 150 слов.",
    "payment": "Напиши вежливое напоминание об оплате бухгалтерских услуг с упоминанием выполненной работы. До 100 слов.",
}


def _msg_dict(m) -> dict:
    return {
        "id":           m.id,
        "role":         getattr(m, "role", "assistant"),
        "message_type": getattr(m, "message_type", None),
        "content":      m.content,
        "created_at":   m.created_at.isoformat() if m.created_at else None,
    }


@router.post("/{company_id}/client-message")
def generate_client_message(
    company_id: int,
    data: ClientMsgRequest,
    db:   Session = Depends(get_db),
    company = Depends(require_company),
):
    msg_type  = data.message_type if data.message_type in CLIENT_PROMPTS else "status"
    context   = get_company_context(company_id, db)
    prompt    = f"{context}\n\nЗадача: {CLIENT_PROMPTS[msg_type]}"

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model="claude-haiku-4-5",  # Haiku достаточен для писем
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    content = resp.content[0].text

    record = models.ClientMessage(company_id=company_id, message_type=msg_type, content=content)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _msg_dict(record)


@router.get("/{company_id}/client-messages")
def get_client_messages(
    company_id: int,
    db:   Session = Depends(get_db),
    company = Depends(require_company),
):
    msgs = (
        db.query(models.ClientMessage)
        .filter(models.ClientMessage.company_id == company_id)
        .order_by(models.ClientMessage.created_at.desc())
        .limit(20)
        .all()
    )
    return [_msg_dict(m) for m in msgs]


# ── Legacy ─────────────────────────────────────────────────────────────────
@router.get("/{company_id}/reminders")
def get_reminders(company_id: int, db: Session = Depends(get_db), company = Depends(require_company)):
    reminders = []
    pending = db.query(models.Document).filter(models.Document.company_id == company_id, models.Document.status == "pending").count()
    if pending:
        reminders.append({"type": "documents", "message": f"{pending} документов ожидают обработки", "priority": "medium"})
    soon = datetime.utcnow() + timedelta(days=3)
    for d in db.query(models.Deadline).filter(models.Deadline.company_id == company_id, models.Deadline.is_done == False, models.Deadline.deadline_date <= soon).all():
        reminders.append({"type": "deadline", "message": f"Дедлайн: {d.title} — {d.deadline_date.strftime('%d.%m.%Y')}", "priority": "high"})
    return reminders
