from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, Enum, Numeric, JSON, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    companies = relationship("Company", back_populates="owner")

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    inn = Column(String)
    tax_regime = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="companies")
    documents = relationship("Document", back_populates="company")
    esf_records = relationship("ESF", back_populates="company")
    bank_accounts = relationship("BankAccount", back_populates="company")
    employees = relationship("Employee", back_populates="company")
    payroll_runs = relationship("PayrollRun", back_populates="company")
    deadlines = relationship("Deadline", back_populates="company")
    journal_entries = relationship("JournalEntry", back_populates="company")

class DocType(str, enum.Enum):
    invoice = "invoice"
    act = "act"
    upd = "upd"
    esf = "esf"
    ttn = "ttn"
    contract = "contract"
    receipt = "receipt"
    bank_statement = "bank_statement"
    payment_order = "payment_order"
    payroll = "payroll"
    other = "other"

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    doc_type = Column(Enum(DocType), default=DocType.other)
    doc_number = Column(String)
    doc_date = Column(DateTime)
    counterparty = Column(String)
    counterparty_inn = Column(String)
    amount = Column(Float)
    currency = Column(String, default="KGS")
    vat_amount = Column(Float, default=0)
    file_path = Column(String)
    ai_raw_text = Column(Text)
    ai_summary = Column(Text)
    ai_raw_json = Column(JSON)
    # Поля для AI-разноски
    debit_account = Column(String)
    credit_account = Column(String)
    ai_confidence = Column(Integer)
    posting_status = Column(String, default="pending")  # pending / posted / needs_review
    operation_type = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="documents")
    journal_entries = relationship("JournalEntry", back_populates="document")

class ESF(Base):
    __tablename__ = "esf"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    direction = Column(String, default="incoming")      # incoming | outgoing
    esf_number = Column(String)
    esf_date = Column(DateTime)
    # Входящий — поставщик
    supplier_name = Column(String)
    supplier_inn  = Column(String)
    # Исходящий — покупатель
    buyer_name = Column(String, nullable=True)
    buyer_inn  = Column(String, nullable=True)
    # Общие
    contract_number = Column(String, nullable=True)
    amount     = Column(Float)
    vat_amount = Column(Float, default=0)
    vat_rate   = Column(String, default="12")           # "12" | "0" | "exempt"
    status     = Column(String, default="pending")      # pending | accepted | issued
    accepted_at = Column(DateTime, nullable=True)
    linked_payment = Column(Boolean, default=False)
    linked_document_id  = Column(Integer, ForeignKey("documents.id"),         nullable=True)
    bank_transaction_id = Column(Integer, ForeignKey("bank_transactions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="esf_records")

class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    bank_name = Column(String)
    account_number = Column(String)
    currency = Column(String, default="KGS")
    opening_balance = Column(Float, default=0.0)  # начальный остаток
    is_cash = Column(Boolean, default=False)       # касса (True) или банк (False)
    company = relationship("Company", back_populates="bank_accounts")
    transactions = relationship("BankTransaction", back_populates="account", cascade="all, delete-orphan")

class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("bank_accounts.id"))
    date = Column(DateTime)
    amount = Column(Float)
    currency = Column(String, default="KGS")
    direction = Column(String)   # in / out
    counterparty = Column(String)
    purpose = Column(String)
    counterparty_inn = Column(String, nullable=True)   # ИНН контрагента из выписки
    doc_number = Column(String, nullable=True)          # номер документа из выписки
    linked_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    linked_esf_id = Column(Integer, ForeignKey("esf.id"), nullable=True)
    status = Column(String, default="unmatched")   # unmatched / matched
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    account = relationship("BankAccount", back_populates="transactions")

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    full_name = Column(String)
    inn = Column(String)
    position = Column(String)
    department = Column(String, nullable=True)   # Подразделение
    salary = Column(Float)
    hire_date = Column(DateTime)
    fire_date = Column(DateTime, nullable=True)
    is_foreign = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    company = relationship("Company", back_populates="employees")

# ============================================================
# ЗАРПЛАТА — ИСТОРИЯ РАСЧЁТОВ
# ============================================================
class PayrollRun(Base):
    """Один расчёт зарплаты за конкретный месяц."""
    __tablename__ = "payroll_runs"
    id               = Column(Integer, primary_key=True)
    company_id       = Column(Integer, ForeignKey("companies.id"))
    year             = Column(Integer, nullable=False)
    month            = Column(Integer, nullable=False)   # 1-12
    status           = Column(String, default="posted")  # posted
    gross_total      = Column(Float, default=0)
    income_tax_total = Column(Float, default=0)
    sf_employee_total= Column(Float, default=0)   # ПФР 8%
    gnpfr_total      = Column(Float, default=0)   # ГНПФР 2%
    sf_employer_total= Column(Float, default=0)
    net_total        = Column(Float, default=0)
    is_paid          = Column(Boolean, default=False)   # зарплата выплачена
    paid_at          = Column(DateTime, nullable=True)
    is_tax_paid      = Column(Boolean, default=False)   # налоги оплачены в бюджет
    tax_paid_at      = Column(DateTime, nullable=True)
    advance_total    = Column(Float, default=0)          # аванс уже выплачен (сумма)
    is_advance_paid  = Column(Boolean, default=False)
    advance_paid_at  = Column(DateTime, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    company          = relationship("Company", back_populates="payroll_runs")
    entries          = relationship("PayrollRunEntry", back_populates="run", cascade="all, delete-orphan")

class PayrollRunEntry(Base):
    """Строка расчёта: один сотрудник за один месяц."""
    __tablename__ = "payroll_run_entries"
    id            = Column(Integer, primary_key=True)
    run_id        = Column(Integer, ForeignKey("payroll_runs.id"))
    employee_id   = Column(Integer, ForeignKey("employees.id"), nullable=True)
    employee_name = Column(String)   # снимок ФИО
    position      = Column(String)
    is_foreign    = Column(Boolean, default=False)
    bonus         = Column(Float, default=0)   # премия (облагается налогом)
    deduction     = Column(Float, default=0)   # удержание (не влияет на налог)
    gross         = Column(Float)              # оклад
    taxable       = Column(Float)              # оклад + премия (налоговая база)
    department      = Column(String, nullable=True)  # снимок подразделения
    income_tax      = Column(Float)
    sf_employee     = Column(Float)            # ПФР 8%
    gnpfr_employee  = Column(Float, default=0) # ГНПФР 2%
    sf_employer     = Column(Float)
    net             = Column(Float)            # к выдаче = taxable - налоги - удержания
    run           = relationship("PayrollRun", back_populates="entries")

class EmployeeLeave(Base):
    """Отпуск или больничный сотрудника."""
    __tablename__ = "employee_leaves"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer, ForeignKey("companies.id"))
    employee_id   = Column(Integer, ForeignKey("employees.id"))
    leave_type    = Column(String, nullable=False)   # vacation | sick
    start_date    = Column(Date, nullable=False)
    end_date      = Column(Date, nullable=False)
    days          = Column(Integer, nullable=False)
    daily_rate    = Column(Float)                    # среднедневной заработок
    pay_amount    = Column(Float)                    # сумма начисления (работодатель)
    notes         = Column(String)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

class Deadline(Base):
    __tablename__ = "deadlines"
    id             = Column(Integer, primary_key=True)
    company_id     = Column(Integer, ForeignKey("companies.id"))
    title          = Column(String)          # "НДС за май 2026"
    tax_type       = Column(String)          # nds|income_tax|sales_tax|social_fund|unified_tax|patent|annual|other
    period         = Column(String)          # "2026-05" или "2026-Q2" или "2026"
    remind_date    = Column(DateTime)        # дата напоминания (обычно 15-е)
    deadline_date  = Column(DateTime)        # дата сдачи (обычно 20-е)
    is_done        = Column(Boolean, default=False)
    done_at        = Column(DateTime, nullable=True)
    done_by        = Column(String, nullable=True)   # email бухгалтера
    notes          = Column(String, nullable=True)   # комментарий
    auto_generated = Column(Boolean, default=False)  # создан автоматически
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    company        = relationship("Company", back_populates="deadlines")

# ============================================================
# ПЛАН СЧЕТОВ КР
# ============================================================
class ChartOfAccount(Base):
    __tablename__ = "chart_of_accounts"
    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    section = Column(String(50), nullable=False)
    account_type = Column(String(20), nullable=False)  # active / passive / active_passive
    level = Column(Integer, nullable=False)             # 1=раздел, 2=группа, 3=счёт
    parent_code = Column(String(10), nullable=True)
    is_active = Column(Boolean, default=True)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ============================================================
# ПРАВИЛА РАЗНОСКИ
# ============================================================
class PostingRule(Base):
    __tablename__ = "posting_rules"
    id = Column(Integer, primary_key=True)
    rule_name = Column(String(255), nullable=False)
    document_type = Column(String(100), nullable=False)
    operation_keywords = Column(JSON)        # список ключевых слов
    debit_account = Column(String(10), nullable=False)
    credit_account = Column(String(10), nullable=False)
    description = Column(Text)
    priority = Column(Integer, default=50)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ============================================================
# ЖУРНАЛ ПРОВОДОК
# ============================================================
class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=True)
    entry_date = Column(Date, nullable=False)
    debit_account = Column(String(10), nullable=False)
    credit_account = Column(String(10), nullable=False)
    debit_account_name = Column(String(255))
    credit_account_name = Column(String(255))
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(3), default="KGS")
    amount_kgs = Column(Numeric(18, 2))
    exchange_rate = Column(Numeric(10, 4))
    description = Column(Text)
    posting_rule_id = Column(Integer, ForeignKey("posting_rules.id"), nullable=True)
    ai_confidence = Column(Integer)
    ai_reasoning = Column(Text)
    status = Column(String(20), default="posted")  # posted / needs_review / rejected
    reviewed_by = Column(String(255))
    reviewed_at = Column(DateTime)
    is_archived = Column(Boolean, default=False)   # True = период закрыт
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="journal_entries")
    document = relationship("Document", back_populates="journal_entries")


# ============================================================
# КОММУНИКАЦИИ — ЧАТЫ И ПИСЬМА КЛИЕНТАМ
# ============================================================
class ChatMessage(Base):
    """История AI-чата по конкретной компании."""
    __tablename__ = "chat_messages"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    role       = Column(String, nullable=False)   # "user" | "assistant"
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ExchangeRate(Base):
    """Курсы валют НБКР к сому, накапливаются по датам."""
    __tablename__ = "exchange_rates"
    id        = Column(Integer, primary_key=True)
    rate_date = Column(Date, nullable=False)
    currency  = Column(String(3), nullable=False)   # USD, EUR, RUB, ...
    rate      = Column(Float, nullable=False)        # сомов за 1 единицу
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ClientMessage(Base):
    """Сгенерированные письма/сообщения для клиента-директора."""
    __tablename__ = "client_messages"
    id           = Column(Integer, primary_key=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=False)
    message_type = Column(String, default="status")   # status | documents | deadline | payment
    content      = Column(Text, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# ТОВАРНАЯ НОМЕНКЛАТУРА — канон + алиасы + строки документов
# ============================================================
class NomenclatureItem(Base):
    """Каноническая позиция: конкретное изделие. Правится только руками."""
    __tablename__ = "nomenclature_items"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name       = Column(String, nullable=False)         # каноническое имя (нормализованное)
    category   = Column(String, default="")             # 'ДЖИНСЫ' из 'ДЖИНСЫ 333'
    article    = Column(String, default="")             # артикул '333'
    base_unit  = Column(String, default="шт")           # базовая единица измерения
    code_1c    = Column(String, default="")             # код существующей позиции в 1С (маппинг)
    attrs      = Column(JSON, nullable=True)            # марка/размер/ГОСТ — на будущее
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    aliases    = relationship("NomenclatureAlias", back_populates="item",
                              cascade="all, delete-orphan")


class NomenclatureAlias(Base):
    """«Как называет поставщик» → канон. Алиасы бессмертны — это обучение системы."""
    __tablename__ = "nomenclature_aliases"
    id              = Column(Integer, primary_key=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    item_id         = Column(Integer, ForeignKey("nomenclature_items.id"), nullable=False)
    supplier_inn    = Column(String, default="", index=True)   # "" = документ без ИНН
    raw_name        = Column(String, nullable=False)           # как в документе
    normalized_name = Column(String, nullable=False, index=True)
    supplier_code   = Column(String, default="")               # код товара у поставщика
    unit            = Column(String, default="")               # ЕИ поставщика
    unit_ratio      = Column(Float, default=1.0)               # пересчёт в базовую ЕИ канона
    use_count       = Column(Integer, default=1)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    item            = relationship("NomenclatureItem", back_populates="aliases")


class DocumentLine(Base):
    """Строка товара/услуги из документа (извлечена из PDF)."""
    __tablename__ = "document_lines"
    id              = Column(Integer, primary_key=True)
    document_id     = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    line_no         = Column(Integer, default=1)
    raw_name        = Column(String, nullable=False)
    normalized_name = Column(String, default="")
    supplier_code   = Column(String, default="")
    unit            = Column(String, default="")
    qty             = Column(Float, nullable=True)
    price           = Column(Float, nullable=True)
    total           = Column(Float, nullable=True)
    vat_rate        = Column(String, default="")
    item_id         = Column(Integer, ForeignKey("nomenclature_items.id"), nullable=True)
    match_status    = Column(String, default="review")  # auto / suggested / review / confirmed
    match_note      = Column(String, default="")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
