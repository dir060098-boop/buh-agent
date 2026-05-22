from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from sqlalchemy import text
import os

from routers import auth, companies, documents, esf, bank, salary, deadlines, communications, scanner, posting

app = FastAPI(title="БухАгент API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,           prefix="/api/auth",           tags=["auth"])
app.include_router(companies.router,      prefix="/api/companies",      tags=["companies"])
app.include_router(documents.router,      prefix="/api/documents",      tags=["documents"])
app.include_router(esf.router,            prefix="/api/esf",            tags=["esf"])
app.include_router(bank.router,           prefix="/api/bank",           tags=["bank"])
app.include_router(salary.router,         prefix="/api/salary",         tags=["salary"])

# Миграция полей Deadline (добавлены в обновлении)
print("[MIGRATION] Запускаем миграцию таблицы deadlines...")
try:
    with engine.connect() as conn:
        # PostgreSQL поддерживает ADD COLUMN IF NOT EXISTS
        for col, defn in [
            ("remind_date",    "TIMESTAMP"),
            ("period",         "VARCHAR"),
            ("done_at",        "TIMESTAMP"),
            ("done_by",        "VARCHAR"),
            ("notes",          "VARCHAR"),
            ("auto_generated", "BOOLEAN DEFAULT FALSE"),
            ("is_done",        "BOOLEAN DEFAULT FALSE"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS {col} {defn}"))
                conn.commit()
                print(f"[MIGRATION] deadlines.{col} OK")
            except Exception as e:
                conn.rollback()
                print(f"[MIGRATION] deadlines.{col} пропущен: {str(e)[:80]}")
    print("[MIGRATION] Миграция deadlines завершена")
except Exception as e:
    print(f"[MIGRATION] Критическая ошибка: {e}")

app.include_router(deadlines.router,      prefix="/api/deadlines",      tags=["deadlines"])
app.include_router(communications.router, prefix="/api/communications", tags=["communications"])
app.include_router(scanner.router,        prefix="/api/scanner",        tags=["scanner"])
app.include_router(posting.router,        prefix="/api/posting",        tags=["posting"])

@app.get("/")
def root():
    # Проверяем наличие API ключа при каждом healthcheck
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    key_ok = api_key.startswith("sk-ant-")
    return {
        "status": "ok",
        "service": "БухАгент API",
        "anthropic_key": "✅ настроен" if key_ok else "❌ НЕ НАСТРОЕН — сканер не работает",
        "key_prefix": api_key[:12] + "..." if len(api_key) > 12 else "отсутствует"
    }

@app.on_event("startup")
async def startup():
    # Проверяем API ключ при старте
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or not api_key.startswith("sk-ant-"):
        print("⚠️  ВНИМАНИЕ: ANTHROPIC_API_KEY не настроен или неверный!")
        print(f"   Текущее значение: '{api_key[:20]}...' " if api_key else "   Переменная отсутствует")
    else:
        print(f"✅ ANTHROPIC_API_KEY настроен: {api_key[:16]}...")

    Base.metadata.create_all(bind=engine)
    print("✅ Таблицы БД созданы/проверены")
    _run_migrations()
    _seed_chart_on_startup()

def _run_migrations():
    """Добавляет новые колонки в существующие таблицы."""
    migrations = [
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS debit_account VARCHAR(10)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS credit_account VARCHAR(10)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_confidence INTEGER",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS posting_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS operation_type VARCHAR(100)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS counterparty_inn VARCHAR(20)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_number VARCHAR(100)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_date TIMESTAMP",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS amount FLOAT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS currency VARCHAR(3)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS vat_amount FLOAT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_raw_json JSONB",
        # bank_accounts
        "ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance FLOAT DEFAULT 0",
        "ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_cash BOOLEAN DEFAULT FALSE",
        # bank_transactions
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KGS'",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
    ]
    try:
        with engine.connect() as conn:
            for sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception:
                    pass
        print("✅ Миграции применены")
    except Exception as e:
        print(f"⚠️  Ошибка миграций: {e}")

def _seed_chart_on_startup():
    """Загружает план счетов КР при первом запуске."""
    try:
        from database import SessionLocal
        from models import ChartOfAccount, PostingRule
        from seed_chart import CHART_OF_ACCOUNTS, POSTING_RULES

        db = SessionLocal()
        try:
            existing = db.query(ChartOfAccount).count()
            if existing > 0:
                print(f"✅ План счетов уже загружен ({existing} счетов)")
                return
            for item in CHART_OF_ACCOUNTS:
                db.add(ChartOfAccount(**item))
            for item in POSTING_RULES:
                db.add(PostingRule(**item))
            db.commit()
            print(f"✅ План счетов КР загружен: {len(CHART_OF_ACCOUNTS)} счетов, {len(POSTING_RULES)} правил")
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️  Ошибка загрузки плана счетов: {e}")
