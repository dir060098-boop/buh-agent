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
import models, anthropic, base64, os, uuid, json
from datetime import datetime
import sqlalchemy as sa

router = APIRouter()

UPLOAD_DIR = "uploads"
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
  "supplier_name": "название поставщика/исполнителя кто выставил документ",
  "supplier_inn": "ИНН поставщика или null",
  "buyer_name": "название покупателя/заказчика кто получил документ",
  "buyer_inn": "ИНН покупателя или null",
  "counterparty": "название поставщика (= supplier_name) — тот с кем работает наша компания",
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
"""


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
            mat = fitz.Matrix(3, 3)
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


def build_claude_message(b64: str, media_type: str) -> dict:
    if media_type == "application/pdf":
        content_block = {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":b64}}
    else:
        content_block = {"type":"image","source":{"type":"base64","media_type":media_type,"data":b64}}
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

    # Отправляем в Claude для распознавания
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    b64, claude_media_type = prepare_for_claude(content, media_type)
    message = build_claude_message(b64, claude_media_type)
    ai_data = {}
    raw_text = ""

    print(f"[SCANNER] ====== NEW SCAN ======")
    print(f"[SCANNER] file={file.filename}")
    print(f"[SCANNER] content_type_from_browser={file.content_type}")
    print(f"[SCANNER] detected_media_type={media_type}")
    print(f"[SCANNER] size={len(content)} bytes")
    print(f"[SCANNER] claude_media_type={claude_media_type}")
    print(f"[SCANNER] b64_len={len(b64)}")
    # Проверяем начало файла (magic bytes)
    magic = content[:8].hex()
    print(f"[SCANNER] file_magic_bytes={magic}")
    if content[:4] == b'%PDF':
        print(f"[SCANNER] file_is_valid_pdf=True")
    else:
        print(f"[SCANNER] file_is_valid_pdf=False - NOT a PDF!")

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
            "supplier_name":  ai_data.get("supplier_name"),
            "supplier_inn":   ai_data.get("supplier_inn"),
            "buyer_name":     ai_data.get("buyer_name"),
            "buyer_inn":      ai_data.get("buyer_inn"),
            "counterparty":   ai_data.get("counterparty") or ai_data.get("supplier_name"),
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
        "posting": posting_result
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
