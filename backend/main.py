from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, companies, documents, esf, bank, salary, deadlines, communications, scanner

app = FastAPI(title="БухАгент API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене заменить на домен фронтенда
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

@app.get("/")
def root():
    return {"status": "ok", "app": "БухАгент"}
