"""
Дедлайны и налоговый календарь КР.

Логика статусов:
- scheduled  — дедлайн создан, до даты напоминания
- remind     — с 15-го числа: открытое напоминание, висит пока не закроют
- due_today  — день сдачи (20-е число)
- overdue    — просрочен, не сдан
- done       — бухгалтер отметил как сданный

Автогенерация: при создании компании или вызове /generate — создаются
дедлайны на 12 месяцев вперёд исходя из налогового режима.

Налоговые режимы КР:
- ОРН (общий режим): НДС, налог с продаж, подоходный налог, Соцфонд, годовая декларация
- УСН (упрощённая система): единый налог, Соцфонд
- Патент: срок патента, Соцфонд
- Плательщик НДС: НДС + ОРН
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from routers.auth import get_current_user
import models
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

router = APIRouter()

# ── КОНСТАНТЫ СРОКОВ ─────────────────────────────────────
# Дефолты; у каждого налога может быть свой "day" в TAX_SCHEDULE
REMIND_BEFORE_DAYS = 5   # напоминание за N дней до срока
DEADLINE_DAY = 20        # день сдачи по умолчанию

MONTHS_RU = {
    1:'январь', 2:'февраль', 3:'март', 4:'апрель',
    5:'май', 6:'июнь', 7:'июль', 8:'август',
    9:'сентябрь', 10:'октябрь', 11:'ноябрь', 12:'декабрь'
}

# Налоги по режимам. "day" — день сдачи в месяце, следующем за периодом.
# Сроки КР: соцфонд — до 15-го, НДС — до 25-го, остальное — до 20-го.
# ВАЖНО: даты проверить у практикующего бухгалтера при смене законодательства.
TAX_SCHEDULE = {
    "ОРН (общий режим)": [
        {"tax_type": "nds",         "title": "НДС",                   "frequency": "monthly", "day": 25},
        {"tax_type": "sales_tax",   "title": "Налог с продаж",         "frequency": "monthly", "day": 20},
        {"tax_type": "income_tax",  "title": "Подоходный налог",       "frequency": "monthly", "day": 20},
        {"tax_type": "social_fund", "title": "Социальный фонд",        "frequency": "monthly", "day": 15},
        {"tax_type": "annual",      "title": "Годовая декларация",     "frequency": "annual", "month": 3, "day": 1},
    ],
    "Плательщик НДС": [
        {"tax_type": "nds",         "title": "НДС",                   "frequency": "monthly", "day": 25},
        {"tax_type": "sales_tax",   "title": "Налог с продаж",         "frequency": "monthly", "day": 20},
        {"tax_type": "income_tax",  "title": "Подоходный налог",       "frequency": "monthly", "day": 20},
        {"tax_type": "social_fund", "title": "Социальный фонд",        "frequency": "monthly", "day": 15},
        {"tax_type": "annual",      "title": "Годовая декларация",     "frequency": "annual", "month": 3, "day": 1},
    ],
    "Упрощённая система": [
        {"tax_type": "unified_tax", "title": "Единый налог",           "frequency": "quarterly", "day": 20},
        {"tax_type": "social_fund", "title": "Социальный фонд",        "frequency": "monthly", "day": 15},
        {"tax_type": "annual",      "title": "Годовая декларация",     "frequency": "annual", "month": 3, "day": 1},
    ],
    "Патент": [
        {"tax_type": "social_fund", "title": "Социальный фонд",        "frequency": "monthly", "day": 15},
        {"tax_type": "patent",      "title": "Патент",                  "frequency": "once"},
    ],
}

TAX_ICON = {
    "nds":         "🧾",
    "sales_tax":   "💰",
    "income_tax":  "👤",
    "social_fund": "🏥",
    "unified_tax": "📊",
    "patent":      "📋",
    "annual":      "📁",
    "other":       "📌",
}

# ── УТИЛИТЫ ─────────────────────────────────────────────

def get_status(d: models.Deadline) -> str:
    if d.is_done:
        return "done"
    today = date.today()
    dl = d.deadline_date.date() if d.deadline_date else today
    rd = d.remind_date.date() if d.remind_date else dl
    if today > dl:
        return "overdue"
    if today == dl:
        return "due_today"
    if today >= rd:
        return "remind"
    return "scheduled"

def deadline_to_dict(d: models.Deadline) -> dict:
    status = get_status(d)
    return {
        "id":           d.id,
        "company_id":   d.company_id,
        "title":        d.title,
        "tax_type":     d.tax_type,
        "icon":         TAX_ICON.get(d.tax_type, "📌"),
        "period":       d.period,
        "remind_date":  str(d.remind_date)[:10] if d.remind_date else None,
        "deadline_date":str(d.deadline_date)[:10] if d.deadline_date else None,
        "is_done":      d.is_done,
        "done_at":      str(d.done_at)[:10] if d.done_at else None,
        "done_by":      d.done_by,
        "notes":        d.notes,
        "status":       status,
        "auto_generated": d.auto_generated,
    }

def generate_deadlines_for_company(company: models.Company, db: Session, months_ahead: int = 12):
    """Генерирует дедлайны на months_ahead месяцев вперёд."""
    regime = company.tax_regime or "ОРН (общий режим)"
    taxes  = TAX_SCHEDULE.get(regime, TAX_SCHEDULE["ОРН (общий режим)"])
    today  = date.today()
    created = []

    for tax in taxes:
        freq = tax["frequency"]

        if freq == "monthly":
            dl_day = tax.get("day", DEADLINE_DAY)
            for i in range(months_ahead):
                # Отчётный период — текущий месяц + i
                period_date = (today.replace(day=1) + relativedelta(months=i))
                # Дедлайн — свой день налога в следующем месяце
                deadline_month = period_date + relativedelta(months=1)
                dl_date  = deadline_month.replace(day=dl_day)
                rem_date = dl_date - timedelta(days=REMIND_BEFORE_DAYS)
                period_str = period_date.strftime("%Y-%m")
                title = f"{tax['title']} за {MONTHS_RU[period_date.month]} {period_date.year}"

                exists = db.query(models.Deadline).filter(
                    models.Deadline.company_id == company.id,
                    models.Deadline.tax_type == tax["tax_type"],
                    models.Deadline.period == period_str
                ).first()
                if not exists:
                    db.add(models.Deadline(
                        company_id=company.id, title=title,
                        tax_type=tax["tax_type"], period=period_str,
                        remind_date=datetime.combine(rem_date, datetime.min.time()),
                        deadline_date=datetime.combine(dl_date, datetime.min.time()),
                        auto_generated=True
                    ))
                    created.append(title)
                elif (exists.auto_generated and not exists.is_done
                      and exists.deadline_date
                      and exists.deadline_date.date() != dl_date):
                    # Срок изменился (напр. соцфонд 20-е → 15-е) — исправляем несданные
                    exists.deadline_date = datetime.combine(dl_date, datetime.min.time())
                    exists.remind_date   = datetime.combine(rem_date, datetime.min.time())
                    created.append(f"{title} (срок обновлён → {dl_date.strftime('%d.%m')})")

        elif freq == "quarterly":
            dl_day = tax.get("day", DEADLINE_DAY)
            for i in range(0, months_ahead, 3):
                period_date = (today.replace(day=1) + relativedelta(months=i))
                # Начало квартала
                q_start_month = ((period_date.month - 1) // 3) * 3 + 1
                q_start = period_date.replace(month=q_start_month, day=1)
                q_end   = q_start + relativedelta(months=3) - timedelta(days=1)
                dl_date  = (q_end + relativedelta(months=1)).replace(day=dl_day)
                rem_date = dl_date - timedelta(days=REMIND_BEFORE_DAYS)
                q_num    = (q_start_month - 1) // 3 + 1
                period_str = f"{q_start.year}-Q{q_num}"
                title = f"{tax['title']} за Q{q_num} {q_start.year}"

                exists = db.query(models.Deadline).filter(
                    models.Deadline.company_id == company.id,
                    models.Deadline.tax_type == tax["tax_type"],
                    models.Deadline.period == period_str
                ).first()
                if not exists:
                    db.add(models.Deadline(
                        company_id=company.id, title=title,
                        tax_type=tax["tax_type"], period=period_str,
                        remind_date=datetime.combine(rem_date, datetime.min.time()),
                        deadline_date=datetime.combine(dl_date, datetime.min.time()),
                        auto_generated=True
                    ))
                    created.append(title)

        elif freq == "annual":
            for year in [today.year, today.year + 1]:
                dl_date  = date(year, tax.get("month", 3), tax.get("day", 1))
                rem_date = dl_date - timedelta(days=5)
                period_str = str(year - 1)
                title = f"{tax['title']} за {year - 1} год"
                exists = db.query(models.Deadline).filter(
                    models.Deadline.company_id == company.id,
                    models.Deadline.tax_type == tax["tax_type"],
                    models.Deadline.period == period_str
                ).first()
                if not exists:
                    db.add(models.Deadline(
                        company_id=company.id, title=title,
                        tax_type=tax["tax_type"], period=period_str,
                        remind_date=datetime.combine(rem_date, datetime.min.time()),
                        deadline_date=datetime.combine(dl_date, datetime.min.time()),
                        auto_generated=True
                    ))
                    created.append(title)

    db.commit()
    return created


# ── СХЕМЫ ─────────────────────────────────────────────────

class DeadlineCreate(BaseModel):
    title:         str
    tax_type:      str = "other"
    period:        Optional[str] = None
    remind_date:   Optional[str] = None
    deadline_date: str
    notes:         Optional[str] = None

class DeadlineDone(BaseModel):
    notes: Optional[str] = None


# ── ЭНДПОИНТЫ ─────────────────────────────────────────────


@router.post("/migrate")
def migrate_deadlines_table(db: Session = Depends(get_db)):
    """Принудительная миграция таблицы deadlines — добавляет новые колонки."""
    from sqlalchemy import text
    results = []
    cols = [
        ("period",         "VARCHAR"),
        ("remind_date",    "TIMESTAMP"),
        ("done_at",        "TIMESTAMP"),
        ("done_by",        "VARCHAR"),
        ("notes",          "VARCHAR"),
        ("auto_generated", "BOOLEAN DEFAULT FALSE"),
        ("is_done",        "BOOLEAN DEFAULT FALSE"),
    ]
    for col, defn in cols:
        try:
            db.execute(text(f"ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS {col} {defn}"))
            db.commit()
            results.append(f"OK: {col}")
        except Exception as e:
            db.rollback()
            results.append(f"ERR {col}: {str(e)[:60]}")
    return {"results": results}


@router.post("/generate/{company_id}")
def generate_deadlines(
    company_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Автогенерация дедлайнов на 12 месяцев вперёд."""
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(404, "Компания не найдена")

    created = generate_deadlines_for_company(company, db, months_ahead=12)
    return {"created": len(created), "titles": created}


@router.get("/active/{company_id}")
def active_deadlines_summary(
    company_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Краткая сводка — только активные напоминания и просроченные."""
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(404, "Компания не найдена")

    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id == company_id,
        models.Deadline.is_done == False
    ).order_by(models.Deadline.deadline_date).all()

    result = [deadline_to_dict(d) for d in deadlines]
    active = [d for d in result if d["status"] in ("remind", "due_today", "overdue")]
    return {"active": active, "total_open": len(result)}

@router.get("/calendar/all")
def calendar_all(
    days_ahead: int = 30,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Сквозной календарь: несданные дедлайны ВСЕХ компаний пользователя —
    просроченные + ближайшие days_ahead дней, отсортированы по дате."""
    companies = db.query(models.Company).filter(
        models.Company.owner_id == user.id
    ).all()
    if not companies:
        return {"items": [], "overdue_count": 0}

    comp_names = {c.id: c.name for c in companies}
    horizon = datetime.combine(date.today() + timedelta(days=days_ahead),
                               datetime.max.time())

    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id.in_(list(comp_names.keys())),
        models.Deadline.is_done == False,  # noqa: E712
        models.Deadline.deadline_date <= horizon,
    ).order_by(models.Deadline.deadline_date).limit(200).all()

    items = []
    overdue = 0
    for d in deadlines:
        item = deadline_to_dict(d)
        item["company_name"] = comp_names.get(d.company_id, "")
        if item["status"] == "overdue":
            overdue += 1
        items.append(item)
    return {"items": items, "overdue_count": overdue}


@router.get("/{company_id}")
def list_deadlines(
    company_id: int,
    status: Optional[str] = None,   # scheduled|remind|due_today|overdue|done
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(404, "Компания не найдена")

    deadlines = db.query(models.Deadline).filter(
        models.Deadline.company_id == company_id
    ).order_by(models.Deadline.deadline_date).all()

    result = [deadline_to_dict(d) for d in deadlines]
    if status:
        result = [d for d in result if d["status"] == status]
    return result


@router.post("/{company_id}")
def create_deadline(
    company_id: int,
    data: DeadlineCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Создать дедлайн вручную."""
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(404, "Компания не найдена")

    dl = models.Deadline(
        company_id=company_id,
        title=data.title,
        tax_type=data.tax_type,
        period=data.period,
        remind_date=datetime.strptime(data.remind_date, "%Y-%m-%d") if data.remind_date else None,
        deadline_date=datetime.strptime(data.deadline_date, "%Y-%m-%d"),
        notes=data.notes,
        auto_generated=False
    )
    db.add(dl); db.commit(); db.refresh(dl)
    return deadline_to_dict(dl)


@router.patch("/{deadline_id}/done")
def mark_done(
    deadline_id: int,
    data: DeadlineDone,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Отметить дедлайн как сданный — закрывает напоминание."""
    dl = (
        db.query(models.Deadline)
        .join(models.Company, models.Deadline.company_id == models.Company.id)
        .filter(models.Deadline.id == deadline_id, models.Company.owner_id == user.id)
        .first()
    )
    if not dl:
        raise HTTPException(404, "Дедлайн не найден")
    dl.is_done  = True
    dl.done_at  = datetime.now()
    dl.done_by  = user.email
    dl.notes    = data.notes or dl.notes
    db.commit()
    return deadline_to_dict(dl)


@router.patch("/{deadline_id}/reopen")
def reopen_deadline(
    deadline_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Переоткрыть закрытый дедлайн."""
    dl = (
        db.query(models.Deadline)
        .join(models.Company, models.Deadline.company_id == models.Company.id)
        .filter(models.Deadline.id == deadline_id, models.Company.owner_id == user.id)
        .first()
    )
    if not dl:
        raise HTTPException(404, "Дедлайн не найден")
    dl.is_done = False; dl.done_at = None; dl.done_by = None
    db.commit()
    return deadline_to_dict(dl)


@router.delete("/{deadline_id}")
def delete_deadline(
    deadline_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    dl = (
        db.query(models.Deadline)
        .join(models.Company, models.Deadline.company_id == models.Company.id)
        .filter(models.Deadline.id == deadline_id, models.Company.owner_id == user.id)
        .first()
    )
    if not dl:
        raise HTTPException(404, "Дедлайн не найден")
    db.delete(dl); db.commit()
    return {"ok": True}

