import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { companies } from "../api/client"

const SECTIONS = [
  { icon: "📷", title: "Сканер первички",   desc: "AI распознаёт документы",    path: "scanner"  },
  { icon: "📒", title: "Журнал проводок",   desc: "Разноска по счетам КР",      path: "journal"  },
  { icon: "📄", title: "Документы",         desc: "Входящие и статус",          path: "documents"},
  { icon: "🏦", title: "Банк и касса",      desc: "Выписки и сверка",           path: "bank"     },
  { icon: "📋", title: "ЭСФ",              desc: "Входящие и расхождения",     path: "esf"      },
  { icon: "👥", title: "Зарплата и кадры",  desc: "Сотрудники и приказы",       path: "salary"   },
  { icon: "📅", title: "Дедлайны",          desc: "Календарь отчётности",       path: "deadlines"},
  { icon: "💬", title: "Коммуникации",      desc: "AI пишет клиентам",          path: "communications"},
]

export default function CompanyMenu() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)

  useEffect(() => {
    companies.get(id).then(r => setCompany(r.data)).catch(() => {})
  }, [id])

  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", padding: 24, color: "#e8eaf6", fontFamily: "Manrope, sans-serif" }}>
      <button
        onClick={() => navigate("/")}
        style={{ background: "#181c27", border: "1px solid #2a3050", borderRadius: 8, padding: "8px 14px", color: "#8892b0", cursor: "pointer", marginBottom: 24, fontSize: 13, fontFamily: "inherit" }}>
        ← Назад
      </button>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>
          {company?.name || `Компания #${id}`}
        </h2>
        {company?.inn && (
          <span style={{ fontSize: 12, color: "#8892b0" }}>ИНН {company.inn}</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {SECTIONS.map(s => (
          <div
            key={s.path}
            onClick={() => navigate(`/company/${id}/${s.path}`)}
            style={{
              background: "#181c27", border: "1px solid #2a3050", borderRadius: 12,
              padding: "20px 16px", cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#2a3050"}
          >
            <div style={{ fontSize: 26, marginBottom: 10 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "#8892b0" }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
