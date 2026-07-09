from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from sqlalchemy import text
import os

from routers import auth, companies, documents, esf, bank, salary, deadlines, communications, scanner, posting, nomenclature

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
app.include_router(nomenclature.router,   prefix="/api/nomenclature",   tags=["nomenclature"])

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
    _refresh_rates_on_startup()


def _refresh_rates_on_startup():
    """Подтягивает сегодняшние курсы НБКР (не критично при сбое)."""
    try:
        from database import SessionLocal
        from rates import refresh_today_rates
        db = SessionLocal()
        try:
            result = refresh_today_rates(db)
            print(f"✅ Курсы НБКР на {result['date']}: {result['rates']}")
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️  Курсы НБКР не загружены: {e}")

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
        # esf — новые поля
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'incoming'",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS buyer_name VARCHAR",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS buyer_inn VARCHAR",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS contract_number VARCHAR",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS vat_rate VARCHAR(10) DEFAULT '12'",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP",
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS bank_transaction_id INTEGER",
        # bank_accounts
        "ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance FLOAT DEFAULT 0",
        "ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_cash BOOLEAN DEFAULT FALSE",
        # bank_transactions
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KGS'",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS counterparty_inn VARCHAR(20)",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS doc_number VARCHAR(100)",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS linked_esf_id INTEGER",
        # employees — подразделение
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR",
        # payroll_run_entries — подразделение (снимок)
        "ALTER TABLE payroll_run_entries ADD COLUMN IF NOT EXISTS department VARCHAR",
        # payroll_runs — ГНПФР
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS gnpfr_total FLOAT DEFAULT 0",
        # payroll_run_entries — ГНПФР
        "ALTER TABLE payroll_run_entries ADD COLUMN IF NOT EXISTS gnpfr_employee FLOAT DEFAULT 0",
        # payroll_runs — статус выплат
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS is_tax_paid BOOLEAN DEFAULT FALSE",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS tax_paid_at TIMESTAMP",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS advance_total FLOAT DEFAULT 0",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS is_advance_paid BOOLEAN DEFAULT FALSE",
        "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS advance_paid_at TIMESTAMP",
        # payroll_run_entries — премии и удержания
        "ALTER TABLE payroll_run_entries ADD COLUMN IF NOT EXISTS bonus FLOAT DEFAULT 0",
        "ALTER TABLE payroll_run_entries ADD COLUMN IF NOT EXISTS deduction FLOAT DEFAULT 0",
        "ALTER TABLE payroll_run_entries ADD COLUMN IF NOT EXISTS taxable FLOAT",
        # employee_leaves
        """CREATE TABLE IF NOT EXISTS employee_leaves (
            id SERIAL PRIMARY KEY,
            company_id INTEGER REFERENCES companies(id),
            employee_id INTEGER REFERENCES employees(id),
            leave_type VARCHAR(20) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            days INTEGER NOT NULL,
            daily_rate FLOAT,
            pay_amount FLOAT,
            notes VARCHAR(500),
            journal_entry_id INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # payroll_runs
        """CREATE TABLE IF NOT EXISTS payroll_runs (
            id SERIAL PRIMARY KEY,
            company_id INTEGER REFERENCES companies(id),
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            status VARCHAR(20) DEFAULT 'posted',
            gross_total FLOAT DEFAULT 0,
            income_tax_total FLOAT DEFAULT 0,
            sf_employee_total FLOAT DEFAULT 0,
            sf_employer_total FLOAT DEFAULT 0,
            net_total FLOAT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # payroll_run_entries
        """CREATE TABLE IF NOT EXISTS payroll_run_entries (
            id SERIAL PRIMARY KEY,
            run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
            employee_id INTEGER REFERENCES employees(id),
            employee_name VARCHAR(255),
            position VARCHAR(255),
            is_foreign BOOLEAN DEFAULT FALSE,
            gross FLOAT,
            income_tax FLOAT,
            sf_employee FLOAT,
            sf_employer FLOAT,
            net FLOAT
        )""",
        # journal_entries — закрытие периода
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
        # journal_entries — дата проводки (entry_date) уже должна быть, но на всякий случай
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entry_date DATE",
        # journal_entries — имена счетов
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS debit_account_name VARCHAR(255)",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS credit_account_name VARCHAR(255)",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS ai_reasoning TEXT",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255)",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP",
        # journal_entries — связь с зарплатным расчётом (для каскадного удаления)
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS payroll_run_id INTEGER REFERENCES payroll_runs(id)",
        # official/internal — двухконтурный учёт
        "ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS default_scope VARCHAR(20) DEFAULT 'official'",
        "ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS scope VARCHAR(20)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'official'",
        "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'official'",
        # esf — linked_document_id
        "ALTER TABLE esf ADD COLUMN IF NOT EXISTS linked_document_id INTEGER REFERENCES documents(id)",
        # chat_messages — новая таблица (create_all создаст, но добавим IF NOT EXISTS на случай)
        """CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # client_messages — новая таблица
        """CREATE TABLE IF NOT EXISTS client_messages (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            message_type VARCHAR(50) DEFAULT 'status',
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # товарная номенклатура — канон + алиасы + строки документов
        """CREATE TABLE IF NOT EXISTS nomenclature_items (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            name VARCHAR(500) NOT NULL,
            category VARCHAR(255) DEFAULT '',
            article VARCHAR(100) DEFAULT '',
            base_unit VARCHAR(50) DEFAULT 'шт',
            code_1c VARCHAR(100) DEFAULT '',
            attrs JSON,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nomenclature_items_company ON nomenclature_items (company_id)",
        """CREATE TABLE IF NOT EXISTS nomenclature_aliases (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            item_id INTEGER NOT NULL REFERENCES nomenclature_items(id),
            supplier_inn VARCHAR(50) DEFAULT '',
            raw_name VARCHAR(500) NOT NULL,
            normalized_name VARCHAR(500) NOT NULL,
            supplier_code VARCHAR(100) DEFAULT '',
            unit VARCHAR(50) DEFAULT '',
            unit_ratio FLOAT DEFAULT 1.0,
            use_count INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nomenclature_aliases_lookup ON nomenclature_aliases (company_id, supplier_inn, normalized_name)",
        """CREATE TABLE IF NOT EXISTS document_lines (
            id SERIAL PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            line_no INTEGER DEFAULT 1,
            raw_name VARCHAR(500) NOT NULL,
            normalized_name VARCHAR(500) DEFAULT '',
            supplier_code VARCHAR(100) DEFAULT '',
            unit VARCHAR(50) DEFAULT '',
            qty FLOAT, price FLOAT, total FLOAT,
            vat_rate VARCHAR(20) DEFAULT '',
            item_id INTEGER REFERENCES nomenclature_items(id),
            match_status VARCHAR(20) DEFAULT 'review',
            match_note VARCHAR(500) DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_document_lines_doc ON document_lines (document_id)",
        "CREATE INDEX IF NOT EXISTS ix_document_lines_review ON document_lines (company_id, match_status)",
        # exchange_rates — курсы НБКР
        """CREATE TABLE IF NOT EXISTS exchange_rates (
            id SERIAL PRIMARY KEY,
            rate_date DATE NOT NULL,
            currency VARCHAR(3) NOT NULL,
            rate FLOAT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_exchange_rates_lookup ON exchange_rates (currency, rate_date DESC)",
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
