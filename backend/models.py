from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, Enum
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
    tax_regime = Column(String)   # ОРН, упрощёнка, патент
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="companies")
    documents = relationship("Document", back_populates="company")
    esf_records = relationship("ESF", back_populates="company")
    bank_accounts = relationship("BankAccount", back_populates="company")
    employees = relationship("Employee", back_populates="company")
    deadlines = relationship("Deadline", back_populates="company")

class DocType(str, enum.Enum):
    invoice = "invoice"         # счёт
    act = "act"                 # акт
    upd = "upd"                 # УПД
    esf = "esf"                 # ЭСФ
    ttn = "ttn"                 # ТТН / накладная
    contract = "contract"       # договор
    receipt = "receipt"         # чек / ПКО / РКО
    bank_statement = "bank_statement"
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
    file_path = Column(String)
    ai_raw_text = Column(Text)       # что извлёк AI
    ai_summary = Column(Text)        # краткое резюме AI
    status = Column(String, default="pending")  # pending / processed / error
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="documents")

class ESF(Base):
    __tablename__ = "esf"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    esf_number = Column(String)
    esf_date = Column(DateTime)
    supplier_inn = Column(String)
    supplier_name = Column(String)
    amount = Column(Float)
    vat_amount = Column(Float, default=0)
    status = Column(String)         # принят, аннулирован, ошибка
    linked_payment = Column(Boolean, default=False)
    linked_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="esf_records")

class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    bank_name = Column(String)
    account_number = Column(String)
    currency = Column(String, default="KGS")
    company = relationship("Company", back_populates="bank_accounts")
    transactions = relationship("BankTransaction", back_populates="account")

class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("bank_accounts.id"))
    date = Column(DateTime)
    amount = Column(Float)
    direction = Column(String)      # in / out
    counterparty = Column(String)
    purpose = Column(String)        # назначение платежа
    linked_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    linked_esf_id = Column(Integer, ForeignKey("esf.id"), nullable=True)
    status = Column(String, default="unmatched")  # unmatched / matched
    account = relationship("BankAccount", back_populates="transactions")

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    full_name = Column(String)
    inn = Column(String)
    position = Column(String)
    salary = Column(Float)
    hire_date = Column(DateTime)
    fire_date = Column(DateTime, nullable=True)
    is_foreign = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    company = relationship("Company", back_populates="employees")

class Deadline(Base):
    __tablename__ = "deadlines"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    title = Column(String)
    deadline_date = Column(DateTime)
    tax_type = Column(String)       # НДС, соцфонд, подоходный, отчёт
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="deadlines")
