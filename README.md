# БухАгент — AI-система для бухгалтера

AI-агент для автоматизации документооборота и бухгалтерского учёта. Работает с несколькими компаниями одновременно.

## Стек

| Слой | Технология |
|------|-----------|
| Фронтенд | React + Vite + Tailwind CSS |
| Бэкенд | Python + FastAPI |
| База данных | PostgreSQL (Railway) |
| AI | Claude API (Anthropic) |
| Деплой | Railway |

## Структура репозитория

```
buh-agent/
├── frontend/        # React приложение
│   └── src/
│       ├── pages/       # Login, Dashboard, Company, разделы
│       ├── components/  # Общие компоненты
│       └── api/         # HTTP запросы к бэкенду
├── backend/         # FastAPI сервер
│   ├── routers/     # Эндпоинты по разделам
│   ├── models/      # Модели БД (SQLAlchemy)
│   └── services/    # Бизнес-логика + Claude API
└── docs/            # Документация и схемы
```

## Функциональность

- 📷 **Сканер первички** — AI распознаёт документы (фото, PDF)
- 📄 **Документы** — входящие, статус, привязка к операциям
- 🏦 **Банк и касса** — выписки, сверка, разноска платежей
- 📋 **ЭСФ** — входящие, расхождения, статус ГНС
- 👥 **Зарплата и кадры** — сотрудники, приказы, ФСЗН
- 📅 **Дедлайны и налоги** — календарь, напоминания
- 💬 **Коммуникации** — AI пишет напоминания клиентам

## Запуск локально

### Бэкенд
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # заполни переменные
uvicorn main:app --reload
```

### Фронтенд
```bash
cd frontend
npm install
cp .env.example .env      # заполни VITE_API_URL
npm run dev
```
