"""
Движок товарной номенклатуры: извлечение строк из PDF + матчинг к канону.

Перенесён из прототипа catalog_builder.py (товарная номенклатура база/).

Принципы (утверждены 2026-07-02):
- Канон = конкретное изделие, per company
- Алиас = (ИНН поставщика, нормализованная строка) → канон; алиасы бессмертны
- Канон никогда не мутирует автоматически — только руками
- v1: только нативные PDF (pdfplumber), фото — следующим этапом
"""

import re
import io
from typing import Optional

from sqlalchemy.orm import Session

import models

FUZZY_THRESHOLD = 0.85


# ── Нормализация (из прототипа) ─────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Единый вид для сравнения: верхний регистр, схлопнутые пробелы, е=ё."""
    s = re.sub(r"\s+", " ", str(name or "").strip().upper())
    return s.replace("Ё", "Е")


def split_name(name: str) -> tuple:
    """'ДЖИНСЫ 333' → ('ДЖИНСЫ', '333'); 'ВОДОЛАЗКА' → ('ВОДОЛАЗКА', '')"""
    parts = str(name or "").strip().split()
    if len(parts) >= 2 and re.match(r"^\d+[A-Za-zА-Яа-я]?$", parts[-1]):
        return " ".join(parts[:-1]), parts[-1]
    return str(name or "").strip(), ""


def fuzzy_ratio(a: str, b: str) -> float:
    a, b = (a or "").lower(), (b or "").lower()
    if a == b:
        return 1.0
    longer = max(len(a), len(b))
    if longer == 0:
        return 1.0
    matches = sum(c1 == c2 for c1, c2 in zip(a, b))
    return matches / longer


def parse_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace(" ", "").replace("\xa0", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── Извлечение строк из PDF ─────────────────────────────────────────────────
# Колонки ищутся по заголовкам, а не по фиксированным индексам —
# работает и для КГ ЭСФ, и для УПД, и для произвольных счетов-фактур.

_COL_PATTERNS = [
    ("code",     r"код\s*товара|артикул|код\b"),
    ("name",     r"наименован|товар(?!а)|описан|работ|услуг"),
    ("unit",     r"ед\.?\s*изм|единиц"),
    ("qty",      r"кол-?во|количест"),
    ("price",    r"цена|тариф"),
    ("total",    r"стоимост.*(с\s*ндс|всего)|сумма\s*с\s*ндс|всего|итого|стоимост"),
    ("vat_rate", r"ставка.*ндс|ндс.*ставк|%\s*ндс"),
]


def _map_columns(header_row) -> dict:
    """Сопоставляет индексы колонок по ключевым словам заголовка."""
    mapping = {}
    for idx, cell in enumerate(header_row):
        text = str(cell or "").lower().replace("\n", " ")
        if not text.strip():
            continue
        for field, pattern in _COL_PATTERNS:
            if field not in mapping and re.search(pattern, text):
                mapping[field] = idx
                break
    return mapping


def _is_goods_header(header_row) -> bool:
    m = _map_columns(header_row)
    return "name" in m and ("qty" in m or "total" in m or "price" in m)


def extract_lines_from_pdf(content: bytes) -> list:
    """
    Извлекает строки товаров/услуг из нативного PDF.
    Возвращает [{code, raw_name, unit, qty, price, total, vat_rate}].
    Пустой список — таблиц не найдено (фото/скан или документ без позиций).
    """
    import pdfplumber

    lines = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            col_map = None  # карта колонок переносится на следующие страницы
            for page in pdf.pages:
                for table in page.extract_tables():
                    if not table or len(table) < 2:
                        continue
                    start_row = 0
                    # Ищем строку заголовка в первых трёх строках таблицы
                    header_found = False
                    for h in range(min(3, len(table))):
                        if _is_goods_header(table[h]):
                            col_map = _map_columns(table[h])
                            start_row = h + 1
                            header_found = True
                            break
                    if not header_found:
                        # Продолжение товарной таблицы на новой странице:
                        # используем карту с прошлой страницы, если ширина совпадает
                        if not col_map or len(table[0]) <= max(col_map.values()):
                            continue

                    # Пропускаем строку нумерации колонок (1,2,3,...) если есть
                    if start_row < len(table):
                        row = table[start_row]
                        cells = [str(c or "").strip() for c in row]
                        if cells and all(c.isdigit() or not c for c in cells) and any(c.isdigit() for c in cells):
                            start_row += 1

                    for row in table[start_row:]:
                        if not row:
                            continue
                        get = lambda f: (
                            str(row[col_map[f]] or "").strip()
                            if f in col_map and col_map[f] < len(row) else ""
                        )
                        name = get("name")
                        if not name or len(name) < 2:
                            continue
                        low = name.lower()
                        # Служебные строки: итоги, продолжение шапки
                        if any(w in low for w in ("итого", "всего к оплате", "наименование")):
                            continue
                        qty   = parse_float(get("qty"))
                        price = parse_float(get("price"))
                        total = parse_float(get("total"))
                        if qty is None and total is None and price is None:
                            continue  # текстовая строка, не товарная позиция
                        lines.append({
                            "code":     get("code"),
                            "raw_name": name,
                            "unit":     get("unit") or "шт",
                            "qty":      qty,
                            "price":    price,
                            "total":    total,
                            "vat_rate": get("vat_rate"),
                        })
    except Exception as e:
        print(f"[NOMENCLATURE] PDF line extraction failed: {e}")
        return []
    return lines


# ── Матчинг строки к канону ─────────────────────────────────────────────────

def match_line(db: Session, company_id: int, supplier_inn: Optional[str],
               normalized_name: str, supplier_code: str = "") -> tuple:
    """
    Возвращает (item_id | None, match_status, match_note).

    Уровни:
      1. Точный алиас (ИНН + нормализованная строка)  → auto
      2. Точное имя канона                            → auto (+ новый алиас создаст вызывающий)
      3. Код поставщика + похожее имя (fuzzy ≥ 0.85)  → suggested
      4. Fuzzy по именам канонов (≥ 0.85)             → suggested
      5. Ничего                                       → review
    """
    inn = (supplier_inn or "").strip()

    # 1. Точный алиас
    q = db.query(models.NomenclatureAlias).filter(
        models.NomenclatureAlias.company_id == company_id,
        models.NomenclatureAlias.normalized_name == normalized_name,
    )
    alias = q.filter(models.NomenclatureAlias.supplier_inn == inn).first() if inn else None
    if alias is None:
        # алиас без привязки к ИНН (создан по документу без ИНН)
        alias = q.filter(models.NomenclatureAlias.supplier_inn == "").first()
    if alias:
        alias.use_count = (alias.use_count or 0) + 1
        return alias.item_id, "auto", f"алиас #{alias.id}"

    # 2. Точное имя канона
    item = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id,
        models.NomenclatureItem.name == normalized_name,
    ).first()
    if item:
        return item.id, "auto", "точное имя канона"

    # 3. Код поставщика: алиас с тем же ИНН+кодом, похожее имя
    if inn and supplier_code:
        code_aliases = db.query(models.NomenclatureAlias).filter(
            models.NomenclatureAlias.company_id == company_id,
            models.NomenclatureAlias.supplier_inn == inn,
            models.NomenclatureAlias.supplier_code == supplier_code,
        ).all()
        for a in code_aliases:
            ratio = fuzzy_ratio(normalized_name, a.normalized_name)
            if ratio >= FUZZY_THRESHOLD:
                return a.item_id, "suggested", f"код {supplier_code} + имя {ratio:.0%}"

    # 4. Fuzzy по канонам (только близкие по длине — дешёвый префильтр)
    n_len = len(normalized_name)
    candidates = db.query(models.NomenclatureItem).filter(
        models.NomenclatureItem.company_id == company_id,
        models.NomenclatureItem.is_active == True,  # noqa: E712
    ).all()
    best, best_ratio = None, 0.0
    for it in candidates:
        if abs(len(it.name or "") - n_len) > n_len * 0.4:
            continue
        ratio = fuzzy_ratio(normalized_name, it.name or "")
        if ratio >= FUZZY_THRESHOLD and ratio > best_ratio:
            best, best_ratio = it, ratio
    if best:
        return best.id, "suggested", f"похожее имя {best_ratio:.0%}: «{best.name}»"

    return None, "review", ""


def learn_alias(db: Session, company_id: int, item_id: int,
                supplier_inn: Optional[str], raw_name: str,
                supplier_code: str = "", unit: str = "",
                unit_ratio: float = 1.0) -> models.NomenclatureAlias:
    """Создаёт (или находит) алиас — «обучение» системы после ручного merge."""
    inn = (supplier_inn or "").strip()
    normalized = normalize_name(raw_name)
    existing = db.query(models.NomenclatureAlias).filter(
        models.NomenclatureAlias.company_id == company_id,
        models.NomenclatureAlias.supplier_inn == inn,
        models.NomenclatureAlias.normalized_name == normalized,
    ).first()
    if existing:
        existing.use_count = (existing.use_count or 0) + 1
        if existing.item_id != item_id:
            existing.item_id = item_id  # перепривязка = исправление прошлой ошибки
        return existing
    alias = models.NomenclatureAlias(
        company_id=company_id,
        item_id=item_id,
        supplier_inn=inn,
        raw_name=raw_name,
        normalized_name=normalized,
        supplier_code=supplier_code or "",
        unit=unit or "",
        unit_ratio=unit_ratio or 1.0,
        use_count=1,
    )
    db.add(alias)
    return alias


def process_document_lines(db: Session, doc: "models.Document",
                           raw_lines: list) -> dict:
    """
    Создаёт DocumentLine для документа и матчит каждую строку.
    Возвращает статистику {total, auto, suggested, review}.
    """
    stats = {"total": 0, "auto": 0, "suggested": 0, "review": 0}
    inn = doc.counterparty_inn or ""
    for i, rl in enumerate(raw_lines, 1):
        normalized = normalize_name(rl["raw_name"])
        item_id, status, note = match_line(
            db, doc.company_id, inn, normalized, rl.get("code") or ""
        )
        # Авто-привязка по точному имени канона — сразу учим алиас
        if status == "auto" and item_id and "канона" in note:
            learn_alias(db, doc.company_id, item_id, inn,
                        rl["raw_name"], rl.get("code") or "", rl.get("unit") or "")
        db.add(models.DocumentLine(
            document_id=doc.id,
            company_id=doc.company_id,
            line_no=i,
            raw_name=rl["raw_name"],
            normalized_name=normalized,
            supplier_code=rl.get("code") or "",
            unit=rl.get("unit") or "",
            qty=rl.get("qty"),
            price=rl.get("price"),
            total=rl.get("total"),
            vat_rate=rl.get("vat_rate") or "",
            item_id=item_id,
            match_status=status,
            match_note=note,
        ))
        stats["total"] += 1
        stats[status] += 1
    return stats
