"""
Модуль «Товары» — товарная номенклатура (канон + алиасы + review-очередь).

Принципы:
- Канон правится только руками (PATCH /items/{id})
- Merge обратим (unlink), алиасы бессмертны
- Массовые операции — обязательны (bulk-link, bulk-accept)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, or_
from pydantic import BaseModel
from typing import Optional, List

from database import get_db
from routers.auth import get_current_user, require_company
import models
from nomenclature_engine import normalize_name, split_name, learn_alias

router = APIRouter()


# ── Схемы ───────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name:      str
    category:  Optional[str] = None
    article:   Optional[str] = None
    base_unit: str = "шт"
    code_1c:   str = ""


class ItemUpdate(BaseModel):
    name:      Optional[str] = None
    category:  Optional[str] = None
    article:   Optional[str] = None
    base_unit: Optional[str] = None
    code_1c:   Optional[str] = None
    is_active: Optional[bool] = None


class LinkRequest(BaseModel):
    item_id:    int
    unit_ratio: float = 1.0


class BulkLinkRequest(BaseModel):
    line_ids:   List[int]
    item_id:    int
    unit_ratio: float = 1.0


class BulkAcceptRequest(BaseModel):
    line_ids: List[int]


class CreateItemFromLineRequest(BaseModel):
    name:      Optional[str] = None   # по умолчанию — нормализованное имя строки
    category:  Optional[str] = None
    article:   Optional[str] = None
    base_unit: Optional[str] = None   # по умолчанию — ЕИ строки
    code_1c:   str = ""


# ── Хелперы ─────────────────────────────────────────────────────────────────

def _item_dict(it: models.NomenclatureItem, db: Session = None) -> dict:
    d = {
        "id":        it.id,
        "name":      it.name,
        "category":  it.category or "",
        "article":   it.article or "",
        "base_unit": it.base_unit or "шт",
        "code_1c":   it.code_1c or "",
        "is_active": it.is_active if it.is_active is not None else True,
        "created_at": it.created_at.isoformat() if it.created_at else None,
    }
    if db is not None:
        d["alias_count"] = db.query(models.NomenclatureAlias).filter(
            models.NomenclatureAlias.item_id == it.id).count()
        d["line_count"] = db.query(models.DocumentLine).filter(
            models.DocumentLine.item_id == it.id).count()
    return d


def _line_dict(l: models.DocumentLine, db: Session = None) -> dict:
    d = {
        "id":            l.id,
        "document_id":   l.document_id,
        "line_no":       l.line_no,
        "raw_name":      l.raw_name,
        "supplier_code": l.supplier_code or "",
        "unit":          l.unit or "",
        "qty":           l.qty,
        "price":         l.price,
        "total":         l.total,
        "vat_rate":      l.vat_rate or "",
        "item_id":       l.item_id,
        "match_status":  l.match_status,
        "match_note":    l.match_note or "",
    }
    if db is not None:
        doc = db.query(models.Document).filter(models.Document.id == l.document_id).first()
        if doc:
            d["doc_number"]   = doc.doc_number
            d["doc_date"]     = str(doc.doc_date)[:10] if doc.doc_date else None
            d["counterparty"] = doc.counterparty
            d["counterparty_inn"] = doc.counterparty_inn
        if l.item_id:
            item = db.query(models.NomenclatureItem).filter(
                models.NomenclatureItem.id == l.item_id).first()
            d["item_name"] = item.name if item else None
    return d


def _get_line(db: Session, company_id: int, line_id: int) -> models.DocumentLine:
    line = db.query(models.DocumentLine).filter(
        models.DocumentLine.id == line_id,
        models.DocumentLine.company_id == company_id,
    ).first()
    if not line:
        raise HTTPException(404, "Строка не найдена")
    return line


# ── Канонический справочник ─────────────────────────────────────────────────

@router.get("/{company_id}/items")
def list_items(
    company_id: int,
    search: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    q = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id)
    if not include_inactive:
        q = q.filter(models.NomenclatureItem.is_active == True)  # noqa: E712
    if search:
        s = f"%{search}%"
        q = q.filter(or_(
            models.NomenclatureItem.name.ilike(s),
            models.NomenclatureItem.category.ilike(s),
            models.NomenclatureItem.article.ilike(s),
            models.NomenclatureItem.code_1c.ilike(s),
        ))
    total = q.count()
    items = q.order_by(models.NomenclatureItem.category,
                       models.NomenclatureItem.article,
                       models.NomenclatureItem.name).offset(offset).limit(limit).all()
    return {
        "items": [_item_dict(it, db) for it in items],
        "total": total,
        "has_more": offset + limit < total,
    }


@router.post("/{company_id}/items")
def create_item(
    company_id: int,
    data: ItemCreate,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    name = normalize_name(data.name)
    if not name:
        raise HTTPException(400, "Название обязательно")
    existing = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id,
        models.NomenclatureItem.name == name,
    ).first()
    if existing:
        raise HTTPException(409, f"Позиция «{name}» уже существует (id={existing.id})")
    cat, art = split_name(name)
    item = models.NomenclatureItem(
        company_id=company_id,
        name=name,
        category=data.category if data.category is not None else cat,
        article=data.article if data.article is not None else art,
        base_unit=data.base_unit or "шт",
        code_1c=data.code_1c or "",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_dict(item, db)


@router.patch("/{company_id}/items/{item_id}")
def update_item(
    company_id: int,
    item_id: int,
    data: ItemUpdate,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    item = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.id == item_id,
        models.NomenclatureItem.company_id == company_id,
    ).first()
    if not item:
        raise HTTPException(404, "Позиция не найдена")
    if data.name is not None:
        item.name = normalize_name(data.name)
    if data.category is not None:
        item.category = data.category
    if data.article is not None:
        item.article = data.article
    if data.base_unit is not None:
        item.base_unit = data.base_unit
    if data.code_1c is not None:
        item.code_1c = data.code_1c
    if data.is_active is not None:
        item.is_active = data.is_active
    db.commit()
    db.refresh(item)
    return _item_dict(item, db)


@router.get("/{company_id}/items/{item_id}/aliases")
def list_aliases(
    company_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    aliases = db.query(models.NomenclatureAlias).filter(
        models.NomenclatureAlias.company_id == company_id,
        models.NomenclatureAlias.item_id == item_id,
    ).order_by(models.NomenclatureAlias.use_count.desc()).all()
    return [{
        "id": a.id,
        "supplier_inn": a.supplier_inn or "",
        "raw_name": a.raw_name,
        "supplier_code": a.supplier_code or "",
        "unit": a.unit or "",
        "unit_ratio": a.unit_ratio or 1.0,
        "use_count": a.use_count or 0,
    } for a in aliases]


@router.delete("/{company_id}/aliases/{alias_id}")
def delete_alias(
    company_id: int,
    alias_id: int,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """Удаление ошибочного алиаса — единственный способ «разучить» систему."""
    alias = db.query(models.NomenclatureAlias).filter(
        models.NomenclatureAlias.id == alias_id,
        models.NomenclatureAlias.company_id == company_id,
    ).first()
    if not alias:
        raise HTTPException(404, "Алиас не найден")
    db.delete(alias)
    db.commit()
    return {"ok": True}


# ── Строки документов / review-очередь ──────────────────────────────────────

@router.get("/{company_id}/lines")
def list_lines(
    company_id: int,
    status: Optional[str] = Query(None, description="auto/suggested/review/confirmed; через запятую"),
    document_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    q = db.query(models.DocumentLine).filter(
        models.DocumentLine.company_id == company_id)
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        q = q.filter(models.DocumentLine.match_status.in_(statuses))
    if document_id:
        q = q.filter(models.DocumentLine.document_id == document_id)
    if search:
        q = q.filter(models.DocumentLine.raw_name.ilike(f"%{search}%"))
    total = q.count()
    lines = q.order_by(models.DocumentLine.normalized_name,
                       models.DocumentLine.id).offset(offset).limit(limit).all()
    return {
        "items": [_line_dict(l, db) for l in lines],
        "total": total,
        "has_more": offset + limit < total,
    }


@router.get("/{company_id}/stats")
def stats(
    company_id: int,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    rows = db.query(
        models.DocumentLine.match_status,
        sa_func.count(models.DocumentLine.id),
    ).filter(
        models.DocumentLine.company_id == company_id
    ).group_by(models.DocumentLine.match_status).all()
    by_status = {r[0]: r[1] for r in rows}
    items_count = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id,
        models.NomenclatureItem.is_active == True,  # noqa: E712
    ).count()
    return {
        "items": items_count,
        "lines_total": sum(by_status.values()),
        "auto": by_status.get("auto", 0),
        "suggested": by_status.get("suggested", 0),
        "review": by_status.get("review", 0),
        "confirmed": by_status.get("confirmed", 0),
        "pending": by_status.get("suggested", 0) + by_status.get("review", 0),
    }


# ── Merge / unmerge ─────────────────────────────────────────────────────────

@router.post("/{company_id}/lines/{line_id}/link")
def link_line(
    company_id: int,
    line_id: int,
    data: LinkRequest,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """«Это то же самое»: строка → канон, создаётся алиас (обучение)."""
    line = _get_line(db, company_id, line_id)
    item = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.id == data.item_id,
        models.NomenclatureItem.company_id == company_id,
    ).first()
    if not item:
        raise HTTPException(404, "Каноническая позиция не найдена")

    doc = db.query(models.Document).filter(
        models.Document.id == line.document_id).first()
    inn = (doc.counterparty_inn if doc else "") or ""

    line.item_id = item.id
    line.match_status = "confirmed"
    line.match_note = "привязано вручную"
    learn_alias(db, company_id, item.id, inn, line.raw_name,
                line.supplier_code or "", line.unit or "", data.unit_ratio)
    db.commit()
    return _line_dict(line, db)


@router.post("/{company_id}/lines/bulk-link")
def bulk_link(
    company_id: int,
    data: BulkLinkRequest,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """Массовая привязка выбранных строк к одному канону."""
    item = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.id == data.item_id,
        models.NomenclatureItem.company_id == company_id,
    ).first()
    if not item:
        raise HTTPException(404, "Каноническая позиция не найдена")
    linked = 0
    for line_id in data.line_ids:
        line = db.query(models.DocumentLine).filter(
            models.DocumentLine.id == line_id,
            models.DocumentLine.company_id == company_id,
        ).first()
        if not line:
            continue
        doc = db.query(models.Document).filter(
            models.Document.id == line.document_id).first()
        inn = (doc.counterparty_inn if doc else "") or ""
        line.item_id = item.id
        line.match_status = "confirmed"
        line.match_note = "привязано вручную (пакетно)"
        learn_alias(db, company_id, item.id, inn, line.raw_name,
                    line.supplier_code or "", line.unit or "", data.unit_ratio)
        linked += 1
    db.commit()
    return {"ok": True, "linked": linked}


@router.post("/{company_id}/lines/bulk-accept")
def bulk_accept(
    company_id: int,
    data: BulkAcceptRequest,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """Подтвердить предложенные (suggested) привязки пачкой."""
    accepted = 0
    for line_id in data.line_ids:
        line = db.query(models.DocumentLine).filter(
            models.DocumentLine.id == line_id,
            models.DocumentLine.company_id == company_id,
            models.DocumentLine.match_status == "suggested",
        ).first()
        if not line or not line.item_id:
            continue
        doc = db.query(models.Document).filter(
            models.Document.id == line.document_id).first()
        inn = (doc.counterparty_inn if doc else "") or ""
        line.match_status = "confirmed"
        line.match_note = "предложение подтверждено"
        learn_alias(db, company_id, line.item_id, inn, line.raw_name,
                    line.supplier_code or "", line.unit or "")
        accepted += 1
    db.commit()
    return {"ok": True, "accepted": accepted}


@router.post("/{company_id}/lines/{line_id}/unlink")
def unlink_line(
    company_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """Unmerge: отвязать строку, вернуть в review. Алиас НЕ удаляется
    (для «разучивания» — DELETE /aliases/{id})."""
    line = _get_line(db, company_id, line_id)
    line.item_id = None
    line.match_status = "review"
    line.match_note = "отвязано вручную"
    db.commit()
    return _line_dict(line, db)


@router.post("/{company_id}/lines/{line_id}/create-item")
def create_item_from_line(
    company_id: int,
    line_id: int,
    data: CreateItemFromLineRequest,
    db: Session = Depends(get_db),
    company = Depends(require_company),
):
    """«Новая позиция»: создать канон из строки + алиас + привязать."""
    line = _get_line(db, company_id, line_id)
    name = normalize_name(data.name or line.raw_name)
    existing = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id,
        models.NomenclatureItem.name == name,
    ).first()
    if existing:
        item = existing  # канон уже есть — просто привязываем
    else:
        cat, art = split_name(name)
        item = models.NomenclatureItem(
            company_id=company_id,
            name=name,
            category=data.category if data.category is not None else cat,
            article=data.article if data.article is not None else art,
            base_unit=data.base_unit or line.unit or "шт",
            code_1c=data.code_1c or "",
        )
        db.add(item)
        db.flush()

    doc = db.query(models.Document).filter(
        models.Document.id == line.document_id).first()
    inn = (doc.counterparty_inn if doc else "") or ""

    line.item_id = item.id
    line.match_status = "confirmed"
    line.match_note = "создан новый канон" if not existing else "привязано к существующему"
    learn_alias(db, company_id, item.id, inn, line.raw_name,
                line.supplier_code or "", line.unit or "")
    db.commit()
    return {"line": _line_dict(line, db), "item": _item_dict(item, db)}
