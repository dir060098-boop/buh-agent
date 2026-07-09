"""
Сканер первичных документов с предпросмотром перед сохранением в БД.

Флоу:
1. POST /{company_id}/recognize  — AI распознаёт документ, НЕ сохраняет в БД
2. POST /{company_id}/confirm    — бухгалтер подтверждает данные → сохраняет в БД + разноска
3. GET  /{company_id}/list       — список документов компании
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic, base64, os, uuid, json, re, io
from datetime import datetime
import sqlalchemy as sa

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SUPPORTED_IMAGES = {"image/jpeg","image/jpg","image/png","image/webp","image/heic","image/heif"}
SUPPORTED_DOCS   = {"application/pdf"}

SCANNER_PROMPT = """Ты — опытный бухгалтер в Кыргызстане (Бишкек). Тебе дан первичный документ.

ВАЖНО: Учёт ведётся со стороны ПОКУПАТЕЛЯ/ЗАКАЗЧИКА услуг.
- Контрагент (counterparty) = ПОСТАВЩИК/ИСПОЛНИТЕЛЬ — тот кто выставил документ
- Наша компания = покупатель — тот кто получил документ и должен заплатить

Документы могут быть на русском, кыргызском или английском языке.
Валюты: KGS (сом), RUB (рубль), USD (доллар), EUR (евро), TRY (турецкая лира).

Внимательно прочитай документ и извлеки данные. Верни ТОЛЬКО валидный JSON:

{
  "doc_type": "invoice|act|esf|ttn|contract|receipt|bank_statement|payment_order|payroll|other",
  "doc_number": "номер документа или null",
  "doc_date": "дата YYYY-MM-DD или null",
  "supplier_name": "ТОЛЬКО название поставщика/исполнителя — без меток полей ('Ф.И.О. ИП/Наименование организации:' и т.п.)",
  "supplier_inn": "ИНН поставщика или null",
  "buyer_name": "ТОЛЬКО название покупателя/заказчика — без меток полей",
  "buyer_inn": "ИНН покупателя или null",
  "counterparty": "ТОЛЬКО название поставщика (= supplier_name) — тот с кем работает наша компания",
  "counterparty_inn": "ИНН поставщика",
  "direction": "incoming",
  "amount": числовое значение итоговой суммы к оплате,
  "vat_amount": сумма НДС числом или 0,
  "currency": "KGS|RUB|USD|EUR|TRY",
  "bank_name": "название банка поставщика или null",
  "bank_account": "номер счёта поставщика или null",
  "operation_type": "краткое описание: аренда, транспортные услуги, покупка товара, страхование и т.д.",
  "items": [{"name": "наименование", "qty": число, "price": число, "amount": число}],
  "summary": "краткое описание документа 1-2 предложения на русском",
  "issues": ["список проблем: нечёткое фото, неразборчивая сумма и т.д."],
  "confidence": число от 0 до 100
}

ПРАВИЛА ДЛЯ СУММ:
- Апостроф как разделитель тысяч: 12'695 = 12695, 1'230'000 = 1230000
- Если в документе несколько сумм — бери ИТОГОВУЮ сумму к оплате
- Квитанция с двумя блоками сумм — складывай все суммы: 12695 + 50 = 12745
- Никогда не объединяй цифры из разных строк

Типы документов:
- invoice: счёт на оплату, счёт-фактура
- act: акт выполненных работ/услуг
- esf: электронная счёт-фактура КР
- ttn: товарно-транспортная накладная, ТТН, CMR
- contract: договор, спецификация к договору
- receipt: квитанция, кассовый чек, ПКО, РКО
- bank_statement: выписка банка
- payment_order: платёжное поручение
- payroll: расчётная ведомость

ВАЖНО ДЛЯ КЫРГЫЗСКИХ ЭСФ (форма BLANK STI-007):
- Поля формы содержат метки: "Ф.И.О. ИП/Наименование организации:", "Поставщик ИНН:" и т.д.
- В JSON пиши ТОЛЬКО само значение, БЕЗ метки поля.
- Пример: ячейка содержит "Ф.И.О. ИП/Наименование организации: Иванов А.А." → supplier_name = "Иванов А.А."
- Поставщик (rows 201-208) — это продавец/исполнитель (supplier)
- Покупатель (rows 301-308) — это наша компания (buyer)
"""


def clean_name(name: str) -> str:
    """
    Убирает метки полей из кыргызских ЭСФ (форма BLANK STI-007).
    Claude читает ячейку целиком: 'Ф.И.О. ИП/Наименование организации: Иванов А.'
    Нам нужно только: 'Иванов А.'
    """
    if not name:
        return name
    prefixes = [
        "ф.и.о. ип/наименование организации :",
        "ф.и.о. ип/наименование организации:",
        "ф.и.о. ип / наименование организации:",
        "наименование организации:",
        "ф.и.о.:",
        "наименование:",
    ]
    s = name.strip()
    s_lower = s.lower()
    for prefix in prefixes:
        if s_lower.startswith(prefix):
            return s[len(prefix):].strip()
    return s


# ── КГ ЭСФ ПАРСЕР (pdfplumber) ───────────────────────────────────────────────
# Кыргызская форма BLANK STI-007 имеет 100% предсказуемую структуру.
# Используем прямое извлечение вместо AI-распознавания → нет OCR-ошибок.

_ESF_NUM_RE  = re.compile(r'\d{5,10}-\d{3}-\d{8,}')
_ESF_DATE_RE = re.compile(r'\b(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\b')


def _pf(val) -> float:
    """Parse float safely"""
    if val is None:
        return 0.0
    try:
        return float(str(val).strip().replace(' ', '').replace(',', '.'))
    except Exception:
        return 0.0


def _extract_esf_name_from_text(page, side: str) -> str:
    """
    Извлечь имя поставщика или покупателя из сырого текста страницы.
    side = 'left' (поставщик, cols 0..50%) или 'right' (покупатель, cols 50%..100%)
    """
    w, h = page.width, page.height
    if side == 'left':
        crop = page.crop((0, h * 0.15, w * 0.50, h * 0.48))
    else:
        crop = page.crop((w * 0.50, h * 0.15, w, h * 0.48))
    text = crop.extract_text() or ""
    m = re.search(
        r'(?:Наименование\s+организации|Ф\.И\.О\.\s*ИП)[^\n:]*[:\s]+(.+?)(?:\n|$)',
        text, re.IGNORECASE
    )
    if m:
        return clean_name(m.group(1).strip())
    # Fallback: первая непустая строка длиннее 5 символов
    for line in text.splitlines():
        line = line.strip()
        if len(line) > 5 and not line[0].isdigit():
            return clean_name(line)
    return ""


def detect_and_parse_esf(content: bytes):
    """
    Обнаружить и распарсить КГ ЭСФ (BLANK STI-007) через pdfplumber.
    Возвращает dict с полями документа, или None если это не ЭСФ.

    Преимущества над AI-распознаванием:
    - 100% точные числа (сумма, НДС, количество)
    - Нет OCR-ошибок в именах (Азнахунова ≠ Алпахунова)
    - Правильное разделение поставщик / покупатель
    - Извлекает все строки товаров
    """
    try:
        import pdfplumber
    except ImportError:
        return None

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if not pdf.pages:
                return None

            page1   = pdf.pages[0]
            text1   = page1.extract_text() or ""
            tables1 = page1.extract_tables()

            # ── Проверка: это КГ ЭСФ? ──────────────────────────────────
            is_esf = (
                "BLANK STI" in text1
                or ("СЧЕТ-ФАКТУРА" in text1 and "Кыргыз" in text1)
            )
            if not is_esf:
                return None

            result = {
                "doc_type":       "esf",
                "doc_number":     None,
                "doc_date":       None,
                "supplier_inn":   None,
                "supplier_name":  None,
                "buyer_inn":      None,
                "buyer_name":     None,
                "amount":         0.0,
                "vat_amount":     0.0,
                "currency":       "KGS",
                "items":          [],
            }

            # ── 1. Номер ЭСФ ────────────────────────────────────────────
            for t in tables1:
                if len(t) == 1 and len(t[0]) == 2:
                    val = str(t[0][0] or "").strip()
                    if _ESF_NUM_RE.match(val):
                        result["doc_number"] = val
                        break
            if not result["doc_number"]:
                m = _ESF_NUM_RE.search(text1)
                if m:
                    result["doc_number"] = m.group()

            # ── 2. Дата из таблиц с цифрами (формат КГ ЭСФ) ───────────
            # КГ ЭСФ хранит дату в двух 4-ячейных таблицах:
            #   ['3','1','0','3']  → день "31", месяц "03"
            #   ['2','0','2','5']  → год "2025"
            digit4_tables = []
            for t in tables1:
                if len(t) == 1 and len(t[0]) == 4:
                    cells = [str(c or "").strip() for c in t[0]]
                    if all(c.isdigit() for c in cells):
                        digit4_tables.append(cells)
            for i in range(len(digit4_tables) - 1):
                dm, yr4 = digit4_tables[i], digit4_tables[i + 1]
                day_s   = dm[0] + dm[1]
                month_s = dm[2] + dm[3]
                year_s  = yr4[0] + yr4[1] + yr4[2] + yr4[3]
                try:
                    day_i, mon_i, yr_i = int(day_s), int(month_s), int(year_s)
                    if 1 <= day_i <= 31 and 1 <= mon_i <= 12 and 2000 <= yr_i <= 2099:
                        d = datetime.strptime(f"{day_i:02d}.{mon_i:02d}.{yr_i}", "%d.%m.%Y")
                        result["doc_date"] = d.strftime("%Y-%m-%d")
                        break
                except Exception:
                    continue
            # Fallback: поиск в сыром тексте (31 03 2025 или 31.03.2025)
            if not result["doc_date"]:
                for pattern in (
                    r'\b(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\b',
                    r'\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b',
                ):
                    m = re.search(pattern, text1)
                    if m:
                        try:
                            d = datetime.strptime(
                                f"{int(m.group(1)):02d}.{int(m.group(2)):02d}.{m.group(3)}",
                                "%d.%m.%Y"
                            )
                            result["doc_date"] = d.strftime("%Y-%m-%d")
                            break
                        except Exception:
                            pass

            # ── 3. ИНН и имена из таблицы заголовка (32 колонки) ───────
            for t in tables1:
                for row in t:
                    if not row or len(row) < 18:
                        continue
                    row_id = str(row[0] or "").replace(" ", "")

                    if row_id == "201":
                        # Поставщик ИНН: ячейки 2-15
                        s_digits = [str(c or "").strip() for c in row[2:16]]
                        inn = "".join(d for d in s_digits if d.isdigit())
                        if inn:
                            result["supplier_inn"] = inn
                        # Покупатель ИНН: ячейки 18-31
                        b_digits = [str(c or "").strip() for c in row[18:32]]
                        inn = "".join(d for d in b_digits if d.isdigit())
                        if inn:
                            result["buyer_inn"] = inn

                    elif row_id == "202":
                        # Поставщик name: левая часть (ячейки 1-15, могут быть None)
                        for cell in row[1:16]:
                            s = str(cell or "").strip()
                            if len(s) > 5 and s not in ("201", "202"):
                                result["supplier_name"] = clean_name(s)
                                break
                        # Покупатель name: правая часть (ячейки 16+)
                        for cell in row[16:]:
                            s = str(cell or "").strip()
                            if len(s) > 5 and s not in ("301", "302", "3 0 2"):
                                result["buyer_name"] = clean_name(s)
                                break

            # ── 4. Имена из сырого текста если таблица не дала ─────────
            # Слова, которые НЕ являются именами (метки форм, системные слова)
            _NOT_NAMES = {
                "оприходование", "поставщик", "покупатель", "исполнитель",
                "заказчик", "наименование", "организации", "филиал",
            }

            def _is_valid_name(s: str) -> bool:
                if not s or len(s) < 4:
                    return False
                first_word = s.split()[0].lower().rstrip(".")
                return first_word not in _NOT_NAMES and not s[0].isdigit()

            if not _is_valid_name(result.get("supplier_name", "")):
                result["supplier_name"] = _extract_esf_name_from_text(page1, "left")
                if not _is_valid_name(result.get("supplier_name", "")):
                    result["supplier_name"] = None   # лучше None чем мусор

            if not _is_valid_name(result.get("buyer_name", "")):
                result["buyer_name"] = _extract_esf_name_from_text(page1, "right")
                if not _is_valid_name(result.get("buyer_name", "")):
                    result["buyer_name"] = None

            # ── 5. Строки товаров со всех страниц ──────────────────────
            for page in pdf.pages:
                for t in page.extract_tables():
                    if not t or len(t) < 3:
                        continue
                    if not any(cell and 'Код товара' in str(cell) for cell in t[0]):
                        continue
                    for row in t[2:]:
                        if not row or len(row) < 12:
                            continue
                        if not str(row[0] or "").strip().isdigit():
                            continue
                        name  = str(row[2] or "").strip()
                        total = _pf(row[11])
                        vat   = _pf(row[8])
                        if total:
                            result["amount"]     += total
                        if vat:
                            result["vat_amount"] += vat
                        if name:
                            result["items"].append({
                                "name":   name,
                                "qty":    _pf(row[5]),
                                "price":  _pf(row[4]),
                                "amount": total,
                            })

            print(
                f"[ESF_PARSER] ✓ number={result['doc_number']} "
                f"date={result['doc_date']} "
                f"supplier_inn={result['supplier_inn']} "
                f"supplier_name={result['supplier_name']!r} "
                f"buyer_name={result['buyer_name']!r} "
                f"amount={result['amount']:.2f} "
                f"items={len(result['items'])}"
            )
            return result

    except Exception as e:
        print(f"[ESF_PARSER] Error: {e}")
        return None


# Промпт для Claude когда данные уже извлечены pdfplumber-ом
# Просим только summary и operation_type
ESF_SUMMARY_PROMPT = """Тебе переданы данные электронной счёт-фактуры (ЭСФ) из Кыргызстана.
Данные уже извлечены из PDF. Твоя задача — добавить два поля:

1. operation_type — короткое описание операции (3-6 слов), например:
   "покупка одежды и аксессуаров", "закупка обуви", "приобретение товаров"

2. summary — 1-2 предложения: что куплено, у кого, на какую сумму.

Данные документа:
{data}

Верни ТОЛЬКО валидный JSON:
{{"operation_type": "...", "summary": "..."}}"""


def convert_heic_to_jpeg(content: bytes) -> bytes:
    try:
        import subprocess
        result = subprocess.run(["convert","heic:-","jpeg:-"], input=content, capture_output=True, timeout=10)
        if result.returncode == 0:
            return result.stdout
    except Exception:
        pass
    return content


def prepare_for_claude(content: bytes, media_type: str):
    # HEIC -> JPEG
    if media_type in ("image/heic","image/heif"):
        content = convert_heic_to_jpeg(content)
        media_type = "image/jpeg"

    # PDF -> JPEG (конвертируем первую страницу)
    # Это решает проблему галлюцинаций когда Claude не может прочитать PDF-обёртку
    if media_type == "application/pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            page = doc[0]
            # Высокое качество: 3x zoom = ~216 DPI
            mat = fitz.Matrix(4, 4)
            pix = page.get_pixmap(matrix=mat)
            content = pix.tobytes("jpeg", jpg_quality=95)
            media_type = "image/jpeg"
            doc.close()
            print(f"[SCANNER] PDF->JPEG: {pix.width}x{pix.height}px, {len(content)} bytes")
        except Exception as e:
            print(f"[SCANNER] PDF->JPEG failed: {e}, sending as PDF")
            # Если конвертация не удалась — отправляем как PDF

    if media_type not in ("image/jpeg","image/png","image/gif","image/webp","application/pdf"):
        media_type = "image/jpeg"
    b64 = base64.standard_b64encode(content).decode("utf-8")
    return b64, media_type


def build_claude_message(b64_or_text: str, media_type: str) -> dict:
    """
    Строит сообщение для Claude.
    media_type="text" — текст из OCR, отправляем как текст (экономия токенов, выше точность)
    иначе — изображение в base64
    """
    if media_type == "text":
        # Текст извлечён через OCR — отправляем напрямую
        content_block = {
            "type": "text",
            "text": f"Вот текст документа, извлечённый через OCR:\n\n{b64_or_text}\n\n{SCANNER_PROMPT}"
        }
        return {"role":"user","content":[content_block]}
    elif media_type == "application/pdf":
        content_block = {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":b64_or_text}}
    else:
        content_block = {"type":"image","source":{"type":"base64","media_type":media_type,"data":b64_or_text}}
    return {"role":"user","content":[content_block,{"type":"text","text":SCANNER_PROMPT}]}


def detect_media_type(file: UploadFile) -> str:
    media_type = file.content_type or "image/jpeg"
    if file.filename:
        ext = file.filename.lower().split(".")[-1]
        ext_map = {
            "pdf":"application/pdf",
            "jpg":"image/jpeg","jpeg":"image/jpeg",
            "png":"image/png","webp":"image/webp",
            "heic":"image/heic","heif":"image/heif"
        }
        if ext in ext_map:
            media_type = ext_map[ext]
    return media_type


def check_duplicate(db: Session, company_id: int, ai_data: dict) -> Optional[models.Document]:
    """4 уровня проверки дублей."""
    doc_number   = ai_data.get("doc_number")
    counterparty = ai_data.get("counterparty")
    amount       = ai_data.get("amount")
    currency     = ai_data.get("currency", "KGS")
    doc_date     = ai_data.get("doc_date")
    doc_type     = ai_data.get("doc_type", "other")

    # Уровень 1: номер + контрагент
    if doc_number and counterparty:
        dup = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.doc_number == doc_number,
            models.Document.counterparty == counterparty
        ).first()
        if dup: return dup

    # Уровень 2: номер + сумма + тип
    if doc_number and amount:
        dup = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.doc_number == doc_number,
            models.Document.amount == amount,
            models.Document.doc_type == doc_type
        ).first()
        if dup: return dup

    # Уровень 3: сумма + контрагент + тип
    if amount and counterparty:
        dup = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.amount == amount,
            models.Document.currency == currency,
            models.Document.counterparty == counterparty,
            models.Document.doc_type == doc_type
        ).first()
        if dup: return dup

    # Уровень 4: номер + тип (без контрагента — для нечёткого совпадения)
    if doc_number and doc_type != "other":
        dup = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.doc_number == doc_number,
            models.Document.doc_type == doc_type
        ).first()
        if dup: return dup

    return None


# ── ШАБЛОН ПОДТВЕРЖДЕНИЯ ─────────────────────────────────
class ConfirmData(BaseModel):
    """Данные которые бухгалтер подтверждает или исправляет после предпросмотра."""
    file_path: str                          # путь к сохранённому файлу
    doc_type: str = "other"
    doc_number: Optional[str] = None
    doc_date: Optional[str] = None
    counterparty: Optional[str] = None
    counterparty_inn: Optional[str] = None
    amount: Optional[float] = None
    vat_amount: Optional[float] = 0
    currency: str = "KGS"
    operation_type: Optional[str] = None
    summary: Optional[str] = None
    ai_raw_json: Optional[dict] = None
    auto_post: bool = True                  # разнести автоматически после сохранения


# ── ЭНДПОИНТЫ ────────────────────────────────────────────

@router.post("/{company_id}/preview-posting")
async def preview_posting(
    company_id: int,
    recognition: dict,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Предварительная разноска для предпросмотра в сканере.
    НЕ сохраняет ничего в БД — только возвращает предложенные счета.
    Использует правила из таблицы posting_rules (без вызова Claude API).
    """
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    doc_type      = (recognition.get("doc_type") or "other").lower()
    operation_type = (recognition.get("operation_type") or "").lower()
    summary       = (recognition.get("summary") or "").lower()
    counterparty  = (recognition.get("counterparty") or "").lower()
    search_text   = f"{operation_type} {summary} {counterparty}"

    # Все активные правила по убыванию приоритета
    rules = db.query(models.PostingRule).filter(
        models.PostingRule.is_active == True
    ).order_by(models.PostingRule.priority.desc()).all()

    matched_rule = None

    # Проход 1: совпадение по doc_type + хотя бы одно ключевое слово
    for rule in rules:
        if rule.document_type == doc_type:
            keywords = [kw.lower() for kw in (rule.operation_keywords or [])]
            if not keywords or any(kw in search_text for kw in keywords):
                matched_rule = rule
                break

    # Проход 2: только doc_type (правило без ключевых слов или нет совпадений)
    if not matched_rule:
        for rule in rules:
            if rule.document_type == doc_type:
                matched_rule = rule
                break

    # Проход 3: любой тип, ключевые слова совпадают
    if not matched_rule:
        for rule in rules:
            keywords = [kw.lower() for kw in (rule.operation_keywords or [])]
            if keywords and any(kw in search_text for kw in keywords):
                matched_rule = rule
                break

    # Вспомогательная функция: название счёта из chart_of_accounts
    def account_name(code: str) -> str:
        acc = db.query(models.ChartOfAccount).filter(
            models.ChartOfAccount.code == code
        ).first()
        return acc.name if acc else code

    # Fallback если ни одно правило не подошло
    if not matched_rule:
        return {
            "debit_account":       "8490",
            "debit_account_name":  account_name("8490") or "Прочие расходы",
            "credit_account":      "3110",
            "credit_account_name": account_name("3110") or "Счета к оплате",
            "description":         recognition.get("summary") or f"Документ от {counterparty}",
            "confidence":          30,
            "reasoning":           "Подходящее правило не найдено — применён fallback"
        }

    amount   = recognition.get("amount", 0)
    currency = recognition.get("currency", "KGS")
    desc     = (recognition.get("summary")
                or f"{matched_rule.rule_name} — {counterparty} {amount} {currency}")

    return {
        "debit_account":       matched_rule.debit_account,
        "debit_account_name":  account_name(matched_rule.debit_account),
        "credit_account":      matched_rule.credit_account,
        "credit_account_name": account_name(matched_rule.credit_account),
        "description":         desc,
        "confidence":          85,
        "reasoning":           f"Правило: «{matched_rule.rule_name}»"
    }

@router.post("/{company_id}/recognize")
async def recognize_document(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    ШАГ 1 — AI распознаёт документ и возвращает результат для предпросмотра.
    Документ НЕ сохраняется в БД — только файл на диск.
    Бухгалтер видит результат, может исправить и затем вызывает /confirm.
    """
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    media_type = detect_media_type(file)
    allowed = SUPPORTED_IMAGES | SUPPORTED_DOCS
    if media_type not in allowed:
        raise HTTPException(status_code=415, detail=f"Формат не поддерживается: {media_type}")

    # Сохраняем файл на диск
    ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    print(f"[SCANNER] ====== NEW SCAN ======")
    print(f"[SCANNER] file={file.filename}, size={len(content)} bytes, type={media_type}")

    ai_data = {}
    raw_text = ""

    # ── Путь 1: КГ ЭСФ — pdfplumber (точные данные, без OCR-ошибок) ──────────
    esf_parsed = None
    if media_type == "application/pdf":
        esf_parsed = detect_and_parse_esf(content)

    if esf_parsed:
        # Данные извлечены точно; просим Claude только summary + operation_type
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        items_preview = ", ".join(
            it["name"] for it in esf_parsed["items"][:5]
        )
        if len(esf_parsed["items"]) > 5:
            items_preview += f" и ещё {len(esf_parsed['items']) - 5} позиций"

        data_str = (
            f"Поставщик: {esf_parsed['supplier_name'] or '—'} (ИНН {esf_parsed['supplier_inn'] or '—'})\n"
            f"Покупатель: {esf_parsed['buyer_name'] or '—'} (ИНН {esf_parsed['buyer_inn'] or '—'})\n"
            f"Номер ЭСФ: {esf_parsed['doc_number'] or '—'}\n"
            f"Дата: {esf_parsed['doc_date'] or '—'}\n"
            f"Сумма: {esf_parsed['amount']:.2f} {esf_parsed['currency']}\n"
            f"НДС: {esf_parsed['vat_amount']:.2f}\n"
            f"Товары ({len(esf_parsed['items'])} позиций): {items_preview}"
        )
        try:
            resp = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=300,
                messages=[{"role": "user", "content": ESF_SUMMARY_PROMPT.format(data=data_str)}]
            )
            extra = json.loads(resp.content[0].text.strip())
        except Exception:
            extra = {
                "operation_type": "покупка товаров",
                "summary": f"ЭСФ №{esf_parsed['doc_number']} от {esf_parsed['supplier_name'] or 'поставщика'} на сумму {esf_parsed['amount']:,.0f} {esf_parsed['currency']}."
            }

        ai_data = {
            "doc_type":        "esf",
            "doc_number":      esf_parsed["doc_number"],
            "doc_date":        esf_parsed["doc_date"],
            "supplier_name":   esf_parsed["supplier_name"],
            "supplier_inn":    esf_parsed["supplier_inn"],
            "buyer_name":      esf_parsed["buyer_name"],
            "buyer_inn":       esf_parsed["buyer_inn"],
            "counterparty":    esf_parsed["supplier_name"] or (
                                   f"ИНН {esf_parsed['supplier_inn']}" if esf_parsed["supplier_inn"] else None
                               ),
            "counterparty_inn":esf_parsed["supplier_inn"],
            "direction":       "incoming",
            "amount":          esf_parsed["amount"],
            "vat_amount":      esf_parsed["vat_amount"],
            "currency":        esf_parsed["currency"],
            "items":           esf_parsed["items"],
            "operation_type":  extra.get("operation_type", "покупка товаров"),
            "summary":         extra.get("summary", ""),
            "issues":          [],
            "confidence":      98,
        }
        print(f"[SCANNER] ESF path: counterparty={ai_data['counterparty']!r}, amount={ai_data['amount']:.2f}")

    else:
        # ── Путь 2: Все прочие документы — полное AI-распознавание ──────────
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        b64, claude_media_type = prepare_for_claude(content, media_type)
        message = build_claude_message(b64, claude_media_type)

        if content[:4] == b'%PDF':
            print(f"[SCANNER] PDF→AI path")
        else:
            print(f"[SCANNER] Image→AI path")

        try:
            response = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=1200,
                messages=[message]
            )
            raw_text = response.content[0].text.strip()
            print(f"[SCANNER] Claude raw response: {raw_text[:500]}")
            if "```" in raw_text:
                parts = raw_text.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    try:
                        ai_data = json.loads(part)
                        break
                    except Exception:
                        continue
            else:
                ai_data = json.loads(raw_text)
        except json.JSONDecodeError:
            ai_data = {
                "doc_type": "other",
                "summary": f"Документ распознан, структура не распознана: {raw_text[:200]}",
                "issues": ["Ошибка парсинга JSON"],
                "confidence": 30
            }
        except Exception as e:
            ai_data = {
                "doc_type": "other",
                "summary": f"Ошибка распознавания: {str(e)}",
                "issues": [str(e)],
                "confidence": 0
            }

    # Проверяем дубли — предупреждаем но НЕ блокируем (бухгалтер решает)
    duplicate = check_duplicate(db, company_id, ai_data)
    duplicate_warning = None
    if duplicate:
        from models import JournalEntry
        already_posted = db.query(JournalEntry).filter(
            JournalEntry.document_id == duplicate.id,
            JournalEntry.status.in_(["posted", "needs_review"])
        ).first()
        duplicate_warning = {
            "document_id": duplicate.id,
            "doc_number": duplicate.doc_number,
            "counterparty": duplicate.counterparty,
            "amount": duplicate.amount,
            "currency": duplicate.currency,
            "already_posted": already_posted is not None
        }

    return {
        "status": "preview",            # документ НЕ в БД, ждёт подтверждения
        "file_path": filepath,
        "source_type": "pdf" if media_type == "application/pdf" else "image",
        "duplicate_warning": duplicate_warning,
        "recognition": {
            "doc_type":       ai_data.get("doc_type", "other"),
            "doc_number":     ai_data.get("doc_number"),
            "doc_date":       ai_data.get("doc_date"),
            "supplier_name":  clean_name(ai_data.get("supplier_name")),
            "supplier_inn":   ai_data.get("supplier_inn"),
            "buyer_name":     clean_name(ai_data.get("buyer_name")),
            "buyer_inn":      ai_data.get("buyer_inn"),
            "counterparty":   clean_name(ai_data.get("counterparty") or ai_data.get("supplier_name")),
            "counterparty_inn": ai_data.get("counterparty_inn") or ai_data.get("supplier_inn"),
            "direction":      ai_data.get("direction", "incoming"),
            "amount":         ai_data.get("amount"),
            "vat_amount":     ai_data.get("vat_amount", 0),
            "currency":       ai_data.get("currency", "KGS"),
            "bank_name":      ai_data.get("bank_name"),
            "bank_account":   ai_data.get("bank_account"),
            "operation_type": ai_data.get("operation_type"),
            "items":          ai_data.get("items", []),
            "summary":        ai_data.get("summary"),
            "issues":         ai_data.get("issues", []),
            "confidence":     ai_data.get("confidence", 0)
        },
        "ai_raw_json": ai_data
    }


@router.get("/file")
def get_file(path: str):
    """Отдаёт загруженный файл для предпросмотра в браузере."""
    from fastapi.responses import FileResponse
    import mimetypes
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    # Безопасность: только файлы из папки uploads
    abs_path = os.path.abspath(path)
    abs_uploads = os.path.abspath(UPLOAD_DIR)
    if not abs_path.startswith(abs_uploads):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return FileResponse(path, media_type=mime)


@router.post("/{company_id}/confirm")
async def confirm_document(
    company_id: int,
    data: ConfirmData,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    ШАГ 2 — бухгалтер подтверждает (или исправляет) данные.
    Только после этого документ сохраняется в БД и разносится.
    """
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    # Парсим дату
    doc_date = None
    if data.doc_date:
        try:
            doc_date = datetime.strptime(data.doc_date, "%Y-%m-%d")
        except Exception:
            pass

    # Сохраняем документ в БД
    doc = models.Document(
        company_id=company_id,
        doc_type=data.doc_type,
        doc_number=data.doc_number,
        doc_date=doc_date,
        counterparty=data.counterparty,
        counterparty_inn=data.counterparty_inn,
        amount=data.amount,
        vat_amount=data.vat_amount,
        currency=data.currency,
        operation_type=data.operation_type,
        file_path=data.file_path,
        ai_summary=data.summary,
        ai_raw_json=data.ai_raw_json,
        posting_status="pending",
        status="processed"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # ── Извлечение строк товаров (только нативные PDF) + матчинг к канону ───
    lines_stats = None
    if data.file_path and data.file_path.lower().endswith(".pdf"):
        try:
            abs_uploads = os.path.abspath(UPLOAD_DIR)
            abs_path = os.path.abspath(data.file_path)
            if abs_path.startswith(abs_uploads) and os.path.exists(abs_path):
                from nomenclature_engine import extract_lines_from_pdf, process_document_lines
                with open(abs_path, "rb") as f:
                    raw_lines = extract_lines_from_pdf(f.read())
                if raw_lines:
                    lines_stats = process_document_lines(db, doc, raw_lines)
                    db.commit()
                    print(f"[SCANNER] ✓ Lines extracted: {lines_stats}")
        except Exception as e:
            print(f"[SCANNER] line extraction error: {e}")

    # ── Авто-создание записи в модуле ЭСФ если тип документа = esf ──────────
    esf_record = None
    if data.doc_type == "esf" and data.doc_number:
        # Проверяем дубль по номеру ЭСФ в этой компании
        existing_esf = db.query(models.ESF).filter(
            models.ESF.company_id == company_id,
            models.ESF.esf_number == data.doc_number,
        ).first()

        if not existing_esf:
            raw = data.ai_raw_json or {}
            esf_date_parsed = doc_date  # уже распарсена выше

            # НДС: из данных или авторасчёт 12/112
            vat_amount = data.vat_amount or 0
            if not vat_amount and data.amount:
                vat_amount = round(data.amount * 12 / 112, 2)

            esf_record = models.ESF(
                company_id      = company_id,
                direction       = raw.get("direction", "incoming"),
                esf_number      = data.doc_number,
                esf_date        = esf_date_parsed,
                supplier_name   = raw.get("supplier_name") or data.counterparty,
                supplier_inn    = raw.get("supplier_inn") or data.counterparty_inn,
                buyer_name      = raw.get("buyer_name"),
                buyer_inn       = raw.get("buyer_inn"),
                amount          = data.amount or 0,
                vat_amount      = vat_amount,
                vat_rate        = "12",
                status          = "pending",
                linked_document_id = doc.id,
            )
            db.add(esf_record)
            db.commit()
            db.refresh(esf_record)
            print(f"[SCANNER] ✓ ESF record created: id={esf_record.id}, number={esf_record.esf_number}, amount={esf_record.amount}")
        else:
            # ЭСФ с таким номером уже есть — привязываем документ к нему
            if not existing_esf.linked_document_id:
                existing_esf.linked_document_id = doc.id
                db.commit()
            esf_record = existing_esf
            print(f"[SCANNER] ESF already exists: id={existing_esf.id}, linked doc={doc.id}")

    # Автоматическая разноска если включена и есть сумма
    posting_result = None
    if data.auto_post and doc.amount and doc.amount > 0:
        try:
            from routers.posting import post_document_with_ai, DuplicatePostingError
            entry = post_document_with_ai(doc, db)
            posting_result = {
                "entry_id": entry.id,
                "debit": f"{entry.debit_account} {entry.debit_account_name}",
                "credit": f"{entry.credit_account} {entry.credit_account_name}",
                "amount": float(entry.amount),
                "currency": entry.currency,
                "confidence": entry.ai_confidence,
                "status": entry.status,
                "description": entry.description
            }
        except Exception as e:
            posting_result = {"error": str(e)}

    return {
        "document_id": doc.id,
        "status": "saved",
        "posting": posting_result,
        "esf_id": esf_record.id if esf_record else None,
        "lines": lines_stats,
    }


@router.get("/{company_id}/list")
def list_documents(
    company_id: int,
    posting_status: Optional[str] = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    q = db.query(models.Document).filter(models.Document.company_id == company_id)
    if posting_status:
        q = q.filter(models.Document.posting_status == posting_status)

    docs = q.order_by(models.Document.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type,
            "doc_number": d.doc_number,
            "doc_date": str(d.doc_date)[:10] if d.doc_date else None,
            "counterparty": d.counterparty,
            "counterparty_inn": d.counterparty_inn,
            "amount": d.amount,
            "currency": d.currency,
            "summary": d.ai_summary,
            "debit_account": d.debit_account,
            "credit_account": d.credit_account,
            "ai_confidence": d.ai_confidence,
            "posting_status": d.posting_status,
            "status": d.status,
            "created_at": str(d.created_at)
        }
        for d in docs
    ]
