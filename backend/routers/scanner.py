"""
Сканер первичных документов.
Принимает: PDF, JPEG, PNG, HEIC, WEBP (с камеры телефона или загрузкой файла)
После распознавания — автоматически запускает AI-разноску по счетам КР.

POST /api/scanner/{company_id}/scan  — сканировать документ
GET  /api/scanner/{company_id}/list  — список документов компании
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic, base64, os, uuid, json
from typing import Optional
import subprocess

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Поддерживаемые форматы
SUPPORTED_IMAGES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
SUPPORTED_DOCS   = {"application/pdf"}

SCANNER_PROMPT = """Ты — опытный бухгалтер в Кыргызстане (Бишкек). Тебе дан документ (фото с камеры или скан).

Внимательно рассмотри документ и извлеки все данные. Верни ТОЛЬКО валидный JSON без markdown и без лишнего текста:

{
  "doc_type": "invoice|act|esf|ttn|contract|receipt|bank_statement|payment_order|payroll|other",
  "doc_number": "номер документа или null",
  "doc_date": "дата в формате YYYY-MM-DD или null",
  "counterparty": "название контрагента (поставщика или покупателя) или null",
  "counterparty_inn": "ИНН/ПИН контрагента или null",
  "amount": числовое значение суммы или null,
  "vat_amount": сумма НДС числом или 0,
  "currency": "KGS|RUB|USD|EUR",
  "operation_type": "краткое описание типа операции, например: покупка товара, транспортные услуги, аренда, таможенные сборы",
  "summary": "краткое описание документа 1-2 предложения на русском",
  "issues": ["список проблем если есть: нечёткое фото, отсутствует ИНН, неразборчивая сумма и т.д."],
  "confidence": число от 0 до 100 — насколько уверен в распознавании
}

Типы документов:
- invoice: счёт на оплату, счёт-фактура
- act: акт выполненных работ/услуг
- esf: электронная счёт-фактура (ЭСФ Кыргызстана)
- ttn: товарно-транспортная накладная, товарная накладная, CMR
- contract: договор, договор-заявка, спецификация к договору
- receipt: квитанция, чек, ПКО, РКО
- bank_statement: выписка банка
- payment_order: платёжное поручение, платёжный ордер
- payroll: расчётная ведомость, расчёт зарплаты
"""


def convert_heic_to_jpeg(content: bytes) -> bytes:
    """Конвертирует HEIC в JPEG через ImageMagick если доступен."""
    try:
        import subprocess
        result = subprocess.run(
            ["convert", "heic:-", "jpeg:-"],
            input=content, capture_output=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout
    except Exception:
        pass
    return content  # возвращаем как есть если не удалось


def prepare_for_claude(content: bytes, media_type: str) -> tuple[str, str]:
    """
    Подготавливает файл для отправки в Claude.
    Возвращает (base64_data, media_type_for_claude).
    """
    # HEIC → JPEG конвертация
    if media_type in ("image/heic", "image/heif"):
        content = convert_heic_to_jpeg(content)
        media_type = "image/jpeg"

    # Claude поддерживает: image/jpeg, image/png, image/gif, image/webp, application/pdf
    if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"):
        media_type = "image/jpeg"  # fallback

    b64 = base64.standard_b64encode(content).decode("utf-8")
    return b64, media_type


def build_claude_message(b64: str, media_type: str) -> dict:
    """Строит сообщение для Claude с документом."""
    if media_type == "application/pdf":
        # PDF передаём как документ
        content_block = {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": b64
            }
        }
    else:
        # Изображение (фото с камеры, скан)
        content_block = {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64
            }
        }

    return {
        "role": "user",
        "content": [
            content_block,
            {"type": "text", "text": SCANNER_PROMPT}
        ]
    }


@router.post("/{company_id}/scan")
async def scan_document(
    company_id: int,
    file: UploadFile = File(...),
    auto_post: bool = Form(default=True),  # автоматически разнести после сканирования
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Сканирует документ (PDF, фото с камеры, изображение).
    Поддерживает: PDF, JPEG, PNG, WEBP, HEIC (iPhone).
    После сканирования автоматически создаёт проводку через AI.
    """
    # Проверяем доступ к компании
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    # Читаем файл
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    # Определяем тип файла
    media_type = file.content_type or "image/jpeg"
    # Уточняем по расширению если content_type не определился
    if file.filename:
        ext = file.filename.lower().split(".")[-1]
        ext_map = {
            "pdf": "application/pdf",
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
            "heic": "image/heic", "heif": "image/heif"
        }
        if ext in ext_map:
            media_type = ext_map[ext]

    allowed = SUPPORTED_IMAGES | SUPPORTED_DOCS
    if media_type not in allowed:
        raise HTTPException(
            status_code=415,
            detail=f"Формат не поддерживается: {media_type}. Поддерживаются: PDF, JPEG, PNG, WEBP, HEIC"
        )

    # Сохраняем файл на диск
    ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    # Подготавливаем для Claude
    b64, claude_media_type = prepare_for_claude(content, media_type)
    message = build_claude_message(b64, claude_media_type)

    # Отправляем в Claude для распознавания
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    raw_text = ""
    ai_data = {}

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[message]
        )
        raw_text = response.content[0].text.strip()

        # Убираем markdown если есть
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
            "summary": f"Документ распознан, но не удалось разобрать структуру. Текст: {raw_text[:200]}",
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
        raw_text = str(e)

    # Парсим дату
    doc_date = None
    if ai_data.get("doc_date"):
        try:
            from datetime import datetime
            doc_date = datetime.strptime(ai_data["doc_date"], "%Y-%m-%d")
        except Exception:
            pass

    # ── ПРОВЕРКА ДУБЛЕЙ ────────────────────────────────────────
    doc_number  = ai_data.get("doc_number")
    counterparty = ai_data.get("counterparty")
    amount      = ai_data.get("amount")
    currency    = ai_data.get("currency", "KGS")
    doc_date    = ai_data.get("doc_date")
    doc_type    = ai_data.get("doc_type", "other")

    duplicate = None

    # Уровень 1 — точное совпадение: номер + контрагент + компания
    if doc_number and counterparty:
        duplicate = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.doc_number == doc_number,
            models.Document.counterparty == counterparty
        ).first()

    # Уровень 2 — номер + сумма + тип (контрагент мог распознаться иначе)
    if not duplicate and doc_number and amount:
        duplicate = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.doc_number == doc_number,
            models.Document.amount == amount,
            models.Document.doc_type == doc_type
        ).first()

    # Уровень 3 — сумма + дата + контрагент + тип (документ без чёткого номера)
    if not duplicate and amount and doc_date and counterparty:
        duplicate = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.amount == amount,
            models.Document.currency == currency,
            models.Document.counterparty == counterparty,
            models.Document.doc_type == doc_type
        ).first()

    # Уровень 4 — сумма + дата + тип (последний шанс поймать дубль)
    if not duplicate and amount and doc_date:
        from sqlalchemy import func, cast
        import sqlalchemy as sa
        duplicate = db.query(models.Document).filter(
            models.Document.company_id == company_id,
            models.Document.amount == amount,
            models.Document.currency == currency,
            models.Document.doc_type == doc_type,
            sa.cast(models.Document.doc_date, sa.Date) == doc_date
        ).first()

    if duplicate:
        already_posted = db.query(models.JournalEntry).filter(
            models.JournalEntry.document_id == duplicate.id,
            models.JournalEntry.status.in_(["posted", "needs_review"])
        ).first()

        return {
            "document_id": duplicate.id,
            "duplicate": True,
            "already_posted": already_posted is not None,
            "warning": (
                f"Документ уже {'разнесён в журнал' if already_posted else 'загружен'}. "
                f"№{duplicate.doc_number or '—'} от {str(duplicate.doc_date)[:10] if duplicate.doc_date else '—'}, "
                f"{duplicate.counterparty or '—'}, {duplicate.amount} {duplicate.currency}"
            ),
            "file_saved": filepath,
            "source_type": "pdf" if media_type == "application/pdf" else "image",
            "recognition": {
                "doc_type": doc_type,
                "doc_number": doc_number,
                "doc_date": doc_date,
                "counterparty": counterparty,
                "amount": amount,
                "currency": currency,
                "summary": ai_data.get("summary"),
                "confidence": ai_data.get("confidence", 0)
            },
            "posting": {"entry_id": already_posted.id, "status": already_posted.status} if already_posted else None,
            "status": "duplicate"
        }
    # ── КОНЕЦ ПРОВЕРКИ ДУБЛЕЙ ────────────────────────────────

    # Сохраняем документ в БД
    doc = models.Document(
        company_id=company_id,
        doc_type=ai_data.get("doc_type", "other"),
        doc_number=ai_data.get("doc_number"),
        doc_date=doc_date,
        counterparty=ai_data.get("counterparty"),
        counterparty_inn=ai_data.get("counterparty_inn"),
        amount=ai_data.get("amount"),
        vat_amount=ai_data.get("vat_amount", 0),
        currency=ai_data.get("currency", "KGS"),
        operation_type=ai_data.get("operation_type"),
        file_path=filepath,
        ai_raw_text=raw_text,
        ai_summary=ai_data.get("summary"),
        ai_raw_json=ai_data,
        ai_confidence=ai_data.get("confidence", 0),
        posting_status="pending",
        status="processed" if ai_data.get("confidence", 0) > 0 else "error"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Автоматически запускаем разноску если есть сумма и включен auto_post
    posting_result = None
    if auto_post and doc.amount and doc.amount > 0:
        try:
            from routers.posting import post_document_with_ai
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
            posting_result = {"error": f"Разноска не удалась: {str(e)}"}

    return {
        "document_id": doc.id,
        "file_saved": filepath,
        "source_type": "pdf" if media_type == "application/pdf" else "image",
        "recognition": {
            "doc_type": ai_data.get("doc_type"),
            "doc_number": ai_data.get("doc_number"),
            "doc_date": ai_data.get("doc_date"),
            "counterparty": ai_data.get("counterparty"),
            "counterparty_inn": ai_data.get("counterparty_inn"),
            "amount": ai_data.get("amount"),
            "vat_amount": ai_data.get("vat_amount", 0),
            "currency": ai_data.get("currency"),
            "operation_type": ai_data.get("operation_type"),
            "summary": ai_data.get("summary"),
            "issues": ai_data.get("issues", []),
            "confidence": ai_data.get("confidence", 0)
        },
        "posting": posting_result,
        "status": doc.status
    }


@router.get("/{company_id}/list")
def list_documents(
    company_id: int,
    posting_status: Optional[str] = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """Список документов компании."""
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
            "doc_date": str(d.doc_date) if d.doc_date else None,
            "counterparty": d.counterparty,
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
