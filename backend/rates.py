"""
Курсы валют НБКР (Национальный банк Кыргызской Республики).

API: https://www.nbkr.kg/XML/daily.xml — только текущий день,
поэтому курсы накапливаются в таблице exchange_rates по мере работы.
Для прошлой даты без курса берётся ближайший более ранний из БД,
либо (fallback) текущий курс НБКР.
"""

from datetime import date as _date, datetime
from typing import Optional
import xml.etree.ElementTree as ET

import httpx
from sqlalchemy.orm import Session

import models

NBKR_URL = "https://www.nbkr.kg/XML/daily.xml"


def fetch_nbkr_rates() -> dict:
    """Запрашивает текущие курсы НБКР. Возвращает {"USD": 87.45, ...} и дату."""
    resp = httpx.get(NBKR_URL, timeout=10)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    rate_date_str = root.attrib.get("Date", "")  # "12.06.2026"
    try:
        rate_date = datetime.strptime(rate_date_str, "%d.%m.%Y").date()
    except ValueError:
        rate_date = _date.today()

    rates = {}
    for cur in root.findall("Currency"):
        iso = cur.attrib.get("ISOCode")
        try:
            nominal = float(cur.findtext("Nominal", "1").replace(",", "."))
            value   = float(cur.findtext("Value", "0").replace(",", "."))
            if iso and value > 0:
                rates[iso] = round(value / nominal, 4)
        except (ValueError, AttributeError):
            continue

    return {"date": rate_date, "rates": rates}


def store_rates(db: Session, rate_date: _date, rates: dict) -> int:
    """Сохраняет курсы в БД (idempotent). Возвращает кол-во новых записей."""
    added = 0
    for currency, rate in rates.items():
        exists = db.query(models.ExchangeRate).filter(
            models.ExchangeRate.rate_date == rate_date,
            models.ExchangeRate.currency  == currency,
        ).first()
        if not exists:
            db.add(models.ExchangeRate(
                rate_date=rate_date, currency=currency, rate=rate
            ))
            added += 1
    if added:
        db.commit()
    return added


def get_rate(db: Session, currency: str, on_date: Optional[_date] = None) -> Optional[float]:
    """Курс валюты к сому на дату.

    1. Точное совпадение в БД
    2. Ближайший более ранний курс в БД
    3. Fallback: текущий курс НБКР (сохраняется в БД)
    """
    if not currency or currency == "KGS":
        return 1.0
    on_date = on_date or _date.today()

    # 1-2: из БД (точный или ближайший ранний)
    row = (
        db.query(models.ExchangeRate)
        .filter(
            models.ExchangeRate.currency  == currency,
            models.ExchangeRate.rate_date <= on_date,
        )
        .order_by(models.ExchangeRate.rate_date.desc())
        .first()
    )
    if row:
        return row.rate

    # 3: fallback — текущий НБКР
    try:
        data = fetch_nbkr_rates()
        store_rates(db, data["date"], data["rates"])
        return data["rates"].get(currency)
    except Exception as e:
        print(f"[RATES] NBKR fetch failed: {e}")
        return None


def refresh_today_rates(db: Session) -> dict:
    """Подтягивает сегодняшние курсы НБКР в БД. Вызывается при старте/по запросу."""
    data = fetch_nbkr_rates()
    added = store_rates(db, data["date"], data["rates"])
    return {"date": str(data["date"]), "rates": data["rates"], "added": added}
