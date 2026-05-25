"""
Модуль «Зарплата и кадры» для БухАгент КР.

Налоговые ставки (Кыргызстан):
  Резиденты:    ПН 10% | СФ работника 8% | СФ работодателя 17.5%
  Нерезиденты:  ПН 10% | СФ = 0%

Проводки при начислении зарплаты:
  Дт 8010 / Кт 3520 — начисление зарплаты (gross)
  Дт 3520 / Кт 3410 — удержан подоходный налог
  Дт 3520 / Кт 3530 — удержан соцфонд (работник)
  Дт 8020 / Кт 3530 — соцфонд работодателя
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

# ── Ставки налогов КР ──────────────────────────────────────────────────────
TAX = {
    "resident": {
        "income_tax":  0.10,
        "sf_employee": 0.08,
        "sf_employer": 0.175,
    },
    "foreign": {
        "income_tax":  0.10,
        "sf_employee": 0.0,   # нерезиденты освобождены от обязательного СФ
        "sf_employer": 0.0,
    },
}

MONTH_RU = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]


# ── Pydantic схемы ─────────────────────────────────────────────────────────
class EmployeeCreate(BaseModel):
    full_name:  str
    inn:        Optional[str] = None
    position:   Optional[str] = None
    salary:     float
    hire_date:  str            # YYYY-MM-DD
    is_foreign: bool = False

class EmployeeUpdate(BaseModel):
    full_name:  Optional[str]   = None
    inn:        Optional[str]   = None
    position:   Optional[str]   = None
    salary:     Optional[float] = None
    is_foreign: Optional[bool]  = None

class RunPayrollRequest(BaseModel):
    year:  int
    month: int   # 1-12

class PayRequest(BaseModel):
    pay_date:    str = ""        # YYYY-MM-DD, пусто = сегодня
    account_type: str = "bank"   # bank | cash


# ── Хелперы ────────────────────────────────────────────────────────────────
def _calc(emp: models.Employee) -> dict:
    rates = TAX["foreign"] if emp.is_foreign else TAX["resident"]
    gross      = emp.salary
    income_tax = round(gross * rates["income_tax"],  2)
    sf_emp     = round(gross * rates["sf_employee"], 2)
    sf_er      = round(gross * rates["sf_employer"], 2)
    net        = round(gross - income_tax - sf_emp,  2)
    return {
        "employee_id":   emp.id,
        "employee_name": emp.full_name,
        "position":      emp.position or "",
        "is_foreign":    emp.is_foreign,
        "gross":         gross,
        "income_tax":    income_tax,
        "sf_employee":   sf_emp,
        "sf_employer":   sf_er,
        "net":           net,
    }


def _emp_dict(emp: models.Employee) -> dict:
    return {
        "id":         emp.id,
        "full_name":  emp.full_name,
        "inn":        emp.inn,
        "position":   emp.position,
        "salary":     emp.salary,
        "hire_date":  emp.hire_date.strftime("%Y-%m-%d") if emp.hire_date else None,
        "fire_date":  emp.fire_date.strftime("%Y-%m-%d") if emp.fire_date else None,
        "is_foreign": emp.is_foreign,
        "is_active":  emp.is_active,
    }


def _run_dict(run: models.PayrollRun) -> dict:
    return {
        "id":               run.id,
        "year":             run.year,
        "month":            run.month,
        "month_name":       MONTH_RU[run.month] if 1 <= run.month <= 12 else "",
        "status":           run.status,
        "gross_total":      run.gross_total,
        "income_tax_total": run.income_tax_total,
        "sf_employee_total":run.sf_employee_total,
        "sf_employer_total":run.sf_employer_total,
        "net_total":        run.net_total,
        "is_paid":          run.is_paid or False,
        "paid_at":          run.paid_at.isoformat() if run.paid_at else None,
        "is_tax_paid":      run.is_tax_paid or False,
        "tax_paid_at":      run.tax_paid_at.isoformat() if run.tax_paid_at else None,
        "created_at":       run.created_at.isoformat() if run.created_at else None,
    }


def _run_detail(run: models.PayrollRun) -> dict:
    d = _run_dict(run)
    d["entries"] = [
        {
            "id":            e.id,
            "employee_id":   e.employee_id,
            "employee_name": e.employee_name,
            "position":      e.position,
            "is_foreign":    e.is_foreign,
            "gross":         e.gross,
            "income_tax":    e.income_tax,
            "sf_employee":   e.sf_employee,
            "sf_employer":   e.sf_employer,
            "net":           e.net,
        }
        for e in run.entries
    ]
    return d


def _acc_name(code: str, db: Session) -> str:
    acc = db.query(models.ChartOfAccount).filter(
        models.ChartOfAccount.code == code
    ).first()
    return acc.name if acc else code


def _post_entry(company_id: int, debit: str, credit: str, amount: float,
                desc: str, run: models.PayrollRun, db: Session) -> None:
    if amount <= 0:
        return
    entry_date = date(run.year, run.month, 1)
    e = models.JournalEntry(
        company_id         = company_id,
        document_id        = None,
        entry_date         = entry_date,
        debit_account      = debit,
        credit_account     = credit,
        debit_account_name = _acc_name(debit,  db),
        credit_account_name= _acc_name(credit, db),
        amount             = amount,
        currency           = "KGS",
        description        = desc,
        status             = "posted",
        ai_confidence      = 100,
        ai_reasoning       = "Авто-проводка: расчёт зарплаты",
    )
    db.add(e)


# ── Сотрудники ─────────────────────────────────────────────────────────────
@router.get("/{company_id}/employees")
def list_employees(company_id: int,
                   db: Session = Depends(get_db),
                   user = Depends(get_current_user)):
    emps = db.query(models.Employee).filter(
        models.Employee.company_id == company_id
    ).order_by(models.Employee.is_active.desc(),
               models.Employee.full_name).all()
    return [_emp_dict(e) for e in emps]


@router.post("/{company_id}/employees")
def add_employee(company_id: int, data: EmployeeCreate,
                 db: Session = Depends(get_db),
                 user = Depends(get_current_user)):
    hire_date = datetime.strptime(data.hire_date, "%Y-%m-%d")
    emp = models.Employee(
        company_id = company_id,
        full_name  = data.full_name,
        inn        = data.inn,
        position   = data.position,
        salary     = data.salary,
        hire_date  = hire_date,
        is_foreign = data.is_foreign,
        is_active  = True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return _emp_dict(emp)


@router.patch("/{company_id}/employees/{emp_id}/fire")
def fire_employee(company_id: int, emp_id: int,
                  db: Session = Depends(get_db),
                  user = Depends(get_current_user)):
    emp = db.query(models.Employee).filter(
        models.Employee.id == emp_id,
        models.Employee.company_id == company_id,
    ).first()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")
    emp.is_active  = False
    emp.fire_date  = datetime.utcnow()
    db.commit()
    return _emp_dict(emp)


@router.delete("/{company_id}/employees/{emp_id}")
def delete_employee(company_id: int, emp_id: int,
                    db: Session = Depends(get_db),
                    user = Depends(get_current_user)):
    emp = db.query(models.Employee).filter(
        models.Employee.id == emp_id,
        models.Employee.company_id == company_id,
    ).first()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")
    db.delete(emp)
    db.commit()
    return {"ok": True}


# ── Предпросмотр без сохранения ────────────────────────────────────────────
@router.get("/{company_id}/payroll")
def preview_payroll(company_id: int,
                    db: Session = Depends(get_db),
                    user = Depends(get_current_user)):
    """Предварительный расчёт — без сохранения."""
    emps = db.query(models.Employee).filter(
        models.Employee.company_id == company_id,
        models.Employee.is_active  == True,
    ).all()
    rows = [_calc(e) for e in emps]
    return {
        "rows": rows,
        "totals": {
            "gross":       round(sum(r["gross"]       for r in rows), 2),
            "income_tax":  round(sum(r["income_tax"]  for r in rows), 2),
            "sf_employee": round(sum(r["sf_employee"] for r in rows), 2),
            "sf_employer": round(sum(r["sf_employer"] for r in rows), 2),
            "net":         round(sum(r["net"]         for r in rows), 2),
        },
        "tax_info": {
            "resident":   TAX["resident"],
            "foreign":    TAX["foreign"],
        }
    }


# ── История расчётов ───────────────────────────────────────────────────────
@router.get("/{company_id}/payroll/history")
def payroll_history(company_id: int,
                    db: Session = Depends(get_db),
                    user = Depends(get_current_user)):
    runs = db.query(models.PayrollRun).filter(
        models.PayrollRun.company_id == company_id
    ).order_by(models.PayrollRun.year.desc(),
               models.PayrollRun.month.desc()).all()
    return [_run_dict(r) for r in runs]


@router.get("/{company_id}/payroll/run/{run_id}")
def get_run(company_id: int, run_id: int,
            db: Session = Depends(get_db),
            user = Depends(get_current_user)):
    run = db.query(models.PayrollRun).filter(
        models.PayrollRun.id         == run_id,
        models.PayrollRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(404, "Расчёт не найден")
    return _run_detail(run)


# ── Провести расчёт ────────────────────────────────────────────────────────
@router.post("/{company_id}/payroll/run")
def run_payroll(company_id: int, data: RunPayrollRequest,
                db: Session = Depends(get_db),
                user = Depends(get_current_user)):
    """Рассчитать, сохранить и создать проводки в журнале."""
    if not (1 <= data.month <= 12):
        raise HTTPException(400, "Неверный месяц")

    # Проверка дубля
    dup = db.query(models.PayrollRun).filter(
        models.PayrollRun.company_id == company_id,
        models.PayrollRun.year       == data.year,
        models.PayrollRun.month      == data.month,
    ).first()
    if dup:
        raise HTTPException(
            400,
            f"Расчёт за {MONTH_RU[data.month]} {data.year} уже проведён. "
            f"Удалите предыдущий, чтобы пересчитать."
        )

    emps = db.query(models.Employee).filter(
        models.Employee.company_id == company_id,
        models.Employee.is_active  == True,
    ).all()
    if not emps:
        raise HTTPException(400, "Нет активных сотрудников")

    rows = [_calc(e) for e in emps]

    gross      = round(sum(r["gross"]       for r in rows), 2)
    it_total   = round(sum(r["income_tax"]  for r in rows), 2)
    sf_emp_t   = round(sum(r["sf_employee"] for r in rows), 2)
    sf_er_t    = round(sum(r["sf_employer"] for r in rows), 2)
    net        = round(sum(r["net"]         for r in rows), 2)

    # Сохраняем PayrollRun
    run = models.PayrollRun(
        company_id        = company_id,
        year              = data.year,
        month             = data.month,
        status            = "posted",
        gross_total       = gross,
        income_tax_total  = it_total,
        sf_employee_total = sf_emp_t,
        sf_employer_total = sf_er_t,
        net_total         = net,
    )
    db.add(run)
    db.flush()   # нужен run.id

    # Строки по сотрудникам
    for r in rows:
        db.add(models.PayrollRunEntry(
            run_id        = run.id,
            employee_id   = r["employee_id"],
            employee_name = r["employee_name"],
            position      = r["position"],
            is_foreign    = r["is_foreign"],
            gross         = r["gross"],
            income_tax    = r["income_tax"],
            sf_employee   = r["sf_employee"],
            sf_employer   = r["sf_employer"],
            net           = r["net"],
        ))

    # Проводки
    label = f"{MONTH_RU[data.month]} {data.year}"
    _post_entry(company_id, "8010", "3520", gross,
                f"Начисление заработной платы за {label}", run, db)
    _post_entry(company_id, "3520", "3410", it_total,
                f"Удержан подоходный налог за {label}", run, db)
    _post_entry(company_id, "3520", "3530", sf_emp_t,
                f"Удержан социальный фонд (работники) за {label}", run, db)
    _post_entry(company_id, "8020", "3530", sf_er_t,
                f"Начислен социальный фонд работодателя за {label}", run, db)

    db.commit()
    db.refresh(run)
    return _run_detail(run)


# ── Удалить расчёт ─────────────────────────────────────────────────────────
@router.delete("/{company_id}/payroll/run/{run_id}")
def delete_run(company_id: int, run_id: int,
               db: Session = Depends(get_db),
               user = Depends(get_current_user)):
    run = db.query(models.PayrollRun).filter(
        models.PayrollRun.id         == run_id,
        models.PayrollRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(404, "Расчёт не найден")
    db.delete(run)
    db.commit()
    return {"ok": True}


# ── Редактировать сотрудника ────────────────────────────────────────────────
@router.patch("/{company_id}/employees/{emp_id}")
def update_employee(company_id: int, emp_id: int, data: EmployeeUpdate,
                    db: Session = Depends(get_db),
                    user = Depends(get_current_user)):
    emp = db.query(models.Employee).filter(
        models.Employee.id         == emp_id,
        models.Employee.company_id == company_id,
    ).first()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")
    if data.full_name  is not None: emp.full_name  = data.full_name
    if data.inn        is not None: emp.inn        = data.inn
    if data.position   is not None: emp.position   = data.position
    if data.salary     is not None: emp.salary     = data.salary
    if data.is_foreign is not None: emp.is_foreign = data.is_foreign
    db.commit()
    return _emp_dict(emp)


# ── Выплатить зарплату ─────────────────────────────────────────────────────
@router.post("/{company_id}/payroll/run/{run_id}/pay")
def pay_salary(company_id: int, run_id: int, data: PayRequest,
               db: Session = Depends(get_db),
               user = Depends(get_current_user)):
    """
    Выплатить зарплату — создаёт проводку Дт 3520 / Кт 1210 (банк) или Кт 1110 (касса).
    """
    run = db.query(models.PayrollRun).filter(
        models.PayrollRun.id         == run_id,
        models.PayrollRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(404, "Расчёт не найден")
    if run.is_paid:
        raise HTTPException(400, "Зарплата уже выплачена")

    credit = "1110" if data.account_type == "cash" else "1210"
    pay_dt = datetime.strptime(data.pay_date, "%Y-%m-%d") if data.pay_date else datetime.utcnow()
    label  = f"{MONTH_RU[run.month]} {run.year}"

    _post_entry(company_id, "3520", credit, run.net_total,
                f"Выплата заработной платы за {label}", run, db)

    run.is_paid = True
    run.paid_at = pay_dt
    db.commit()
    db.refresh(run)
    return _run_detail(run)


# ── Оплатить налоги в бюджет ───────────────────────────────────────────────
@router.post("/{company_id}/payroll/run/{run_id}/pay-taxes")
def pay_taxes(company_id: int, run_id: int, data: PayRequest,
              db: Session = Depends(get_db),
              user = Depends(get_current_user)):
    """
    Оплата налогов и соцфонда в бюджет:
      Дт 3410 / Кт 1210 — подоходный налог
      Дт 3530 / Кт 1210 — социальный фонд (работник + работодатель)
    """
    run = db.query(models.PayrollRun).filter(
        models.PayrollRun.id         == run_id,
        models.PayrollRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(404, "Расчёт не найден")
    if run.is_tax_paid:
        raise HTTPException(400, "Налоги уже оплачены")

    credit  = "1110" if data.account_type == "cash" else "1210"
    pay_dt  = datetime.strptime(data.pay_date, "%Y-%m-%d") if data.pay_date else datetime.utcnow()
    label   = f"{MONTH_RU[run.month]} {run.year}"
    sf_total = round((run.sf_employee_total or 0) + (run.sf_employer_total or 0), 2)

    _post_entry(company_id, "3410", credit, run.income_tax_total,
                f"Оплата подоходного налога за {label}", run, db)
    _post_entry(company_id, "3530", credit, sf_total,
                f"Оплата социального фонда за {label}", run, db)

    run.is_tax_paid = True
    run.tax_paid_at = pay_dt
    db.commit()
    db.refresh(run)
    return _run_detail(run)
