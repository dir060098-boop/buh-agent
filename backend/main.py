from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
models  # ensure models loaded
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
app.include_router(scanner.router,        prefix="/api/scanner",        tags=["scanner"])
app.include_router(esf.router,            prefix="/api/esf",            tags=["esf"])
app.include_router(bank.router,           prefix="/api/bank",           tags=["bank"])
app.include_router(salary.router,         prefix="/api/salary",         tags=["salary"])
app.include_router(deadlines.router,      prefix="/api/deadlines",      tags=["deadlines"])
app.include_router(communications.router, prefix="/api/communications", tags=["communications"])
app.include_router(posting.router,        prefix="/api/posting",        tags=["posting"])

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    print("Tables created")
    _seed_chart_on_startup()

def _seed_chart_on_startup():
    """Загружает план счетов КР и правила разноски при первом запуске (если таблицы пустые)."""
    try:
        from database import SessionLocal
        from models import ChartOfAccount, PostingRule
        from seed_chart import CHART_OF_ACCOUNTS, POSTING_RULES

        db = SessionLocal()
        try:
            existing = db.query(ChartOfAccount).count()
            if existing > 0:
                print(f"План счетов уже загружен ({existing} счетов), пропускаем")
                return

            loaded_accounts = 0
            for item in CHART_OF_ACCOUNTS:
                db.add(ChartOfAccount(**item))
                loaded_accounts += 1

            loaded_rules = 0
            for item in POSTING_RULES:
                db.add(PostingRule(**item))
                loaded_rules += 1

            db.commit()
            print(f"✅ План счетов КР загружен: {loaded_accounts} счетов, {loaded_rules} правил разноски")
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️  Ошибка загрузки плана счетов: {e}")

@app.get("/")
def root():
    return {"status": "ok", "app": "БухАгент"}
