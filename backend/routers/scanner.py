from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import get_db, settings
from routers.auth import get_current_user
import models, anthropic, base64, os, uuid, json

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

SCANNER_PROMPT = """Ты AI-бухгалтер. Тебе дан документ (фото или скан). 
Извлеки следующие данные и верни ТОЛЬКО JSON без лишнего текста:
{
  "doc_type": "invoice|act|esf|ttn|contract|receipt|bank_statement|other",
  "doc_number": "номер документа или null",
  "doc_date": "дата в формате YYYY-MM-DD или null",
  "counterparty": "название контрагента или null",
  "counterparty_inn": "ИНН контрагента или null",
  "amount": число или null,
  "currency": "KGS|RUB|USD|EUR",
  "summary": "краткое описание документа 1-2 предложения",
  "issues": ["список проблем если есть: неверная дата, отсутствует ИНН и т.д."]
}"""

@router.post("/{company_id}/scan")
async def scan_document(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    # Проверяем компанию
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == user.id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Сохраняем файл
    ext = file.filename.split(".")[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Отправляем в Claude
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    b64 = base64.standard_b64encode(content).decode("utf-8")
    media_type = file.content_type or "image/jpeg"

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": SCANNER_PROMPT}
                ]
            }]
        )
        raw_text = response.content[0].text
        ai_data = json.loads(raw_text)
    except Exception as e:
        ai_data = {"doc_type": "other", "summary": f"Ошибка распознавания: {str(e)}", "issues": []}
        raw_text = str(e)

    # Сохраняем документ в БД
    doc = models.Document(
        company_id=company_id,
        doc_type=ai_data.get("doc_type", "other"),
        doc_number=ai_data.get("doc_number"),
        counterparty=ai_data.get("counterparty"),
        counterparty_inn=ai_data.get("counterparty_inn"),
        amount=ai_data.get("amount"),
        currency=ai_data.get("currency", "KGS"),
        file_path=filepath,
        ai_raw_text=raw_text,
        ai_summary=ai_data.get("summary"),
        status="pending"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "document_id": doc.id,
        "ai_result": ai_data,
        "status": "pending"
    }
