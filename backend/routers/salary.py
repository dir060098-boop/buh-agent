from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db
from routers.auth import get_current_user
import models

router = APIRouter()

class EmployeeCreate(BaseModel):
    full_name: str
    inn: Optional[str] = None
    position: Optional[str] = None
    salary: float
    hire_date: datetime
    is_foreign: bool = False

@router.get("/{company_id}/employees")
def list_employees(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Employee).filter(
        models.Employee.company_id == company_id,
        models.Employee.is_active == True
    ).all()

@router.post("/{company_id}/employees")
def add_employee(company_id: int, data: EmployeeCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = models.Employee(**data.dict(), company_id=company_id)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp

@router.patch("/{company_id}/employees/{emp_id}/fire")
def fire_employee(company_id: int, emp_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if emp:
        emp.is_active = False
        emp.fire_date = datetime.utcnow()
        db.commit()
    return {"ok": True}

@router.get("/{company_id}/payroll")
def calculate_payroll(company_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Расчёт зарплаты — базовая логика"""
    employees = db.query(models.Employee).filter(
        models.Employee.company_id == company_id,
        models.Employee.is_active == True
    ).all()
    result = []
    for e in employees:
        income_tax = e.salary * 0.10       # подоходный 10%
        social_fund = e.salary * 0.08      # соцфонд сотрудника 8%
        employer_social = e.salary * 0.175 # соцфонд работодателя 17.5%
        net = e.salary - income_tax - social_fund
        result.append({
            "employee": e.full_name,
            "gross": e.salary,
            "income_tax": income_tax,
            "social_fund_employee": social_fund,
            "social_fund_employer": employer_social,
            "net": net
        })
    return result
