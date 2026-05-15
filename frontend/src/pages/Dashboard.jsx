import { useEffect, useState } from "react"
import { companies, auth } from "../api/client"
import { useNavigate } from "react-router-dom"

export default function Dashboard() {
  const [list, setList] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", inn: "", tax_regime: "ОРН" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      companies.list().then(r => setList(r.data)).catch(() => {}),
      auth.me().then(r => setUser(r.data)).catch(() => {})
    ]).finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError("Введите название компании"); return }
    setSaving(true)
    setError("")
    try {
      await companies.create(form)
      const r = await companies.list()
      setList(r.data)
      setShowForm(false)
      setForm({ name: "", inn: "", tax_regime: "ОРН" })
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка при создании")
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem("token")
    navigate("/login")
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : "Добрый вечер"

  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", fontFamily: "Manrope, sans-serif", color: "#e8eaf6" }}>

      {/* Шапка */}
      <div style={{ background: "#181c27", borderBottom: "1px solid #2a3050", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#e8eaf6", letterSpacing: "-0.3px" }}>
          Бух<span style={{ color: "#4F46E5" }}>Агент</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user && <span style={{ fontSize: 12, color: "#8892b0" }}>{user.email}</span>}
          <button onClick={handleLogout}
            style={{ background: "none", border: "1px solid #2a3050", borderRadius: 6, padding: "5px 12px", color: "#8892b0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            Выйти
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>

        {/* Приветствие */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>
            {greeting} 👋
          </h1>
          <p style={{ margin: 0, color: "#8892b0", fontSize: 13 }}>
            {user?.full_name || "Бухгалтер"} · Мои компании
          </p>
        </div>

        {/* Список компаний */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#4a5580" }}>Загрузка...</div>
        ) : (
          <>
            {list.length === 0 && !showForm && (
              <div style={{ textAlign: "center", padding: "48px 24px", background: "#181c27", borderRadius: 14, border: "1px solid #2a3050", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                <p style={{ fontWeight: 700, color: "#e8eaf6", margin: "0 0 6px" }}>Компаний пока нет</p>
                <p style={{ fontSize: 13, color: "#8892b0", margin: "0 0 20px" }}>Добавьте первую компанию чтобы начать работу</p>
                <button onClick={() => setShowForm(true)}
                  style={{ background: "#4F46E5", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  + Добавить компанию
                </button>
              </div>
            )}

            {list.map(c => (
              <div key={c.id}
                onClick={() => navigate("/company/" + c.id)}
                style={{ background: "#181c27", border: "1px solid #2a3050", borderRadius: 12, padding: "16px 20px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#2a3050"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#4F46E522", border: "1px solid #4F46E544", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    🏢
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#8892b0", marginTop: 2 }}>
                      {c.inn && `ИНН ${c.inn}`}{c.inn && c.tax_regime && " · "}{c.tax_regime}
                    </div>
                  </div>
                </div>

                {/* Бейджи */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {c.pending_docs > 0 && (
                    <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
                      {c.pending_docs} doc
                    </span>
                  )}
                  {c.overdue_deadlines > 0 && (
                    <span style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
                      {c.overdue_deadlines} срок
                    </span>
                  )}
                  <span style={{ color: "#4a5580", fontSize: 20 }}>›</span>
                </div>
              </div>
            ))}

            {/* Кнопка добавить (если компании есть) */}
            {list.length > 0 && !showForm && (
              <button onClick={() => setShowForm(true)}
                style={{ width: "100%", background: "none", border: "1px dashed #2a3050", borderRadius: 12, padding: "14px", color: "#8892b0", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", marginTop: 4 }}>
                + Добавить компанию
              </button>
            )}
          </>
        )}

        {/* Форма добавления */}
        {showForm && (
          <div style={{ background: "#181c27", border: "1px solid #4F46E5", borderRadius: 14, padding: "20px", marginTop: 12 }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 800 }}>Новая компания</h3>
            <form onSubmit={handleCreate}>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Название *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ОсОО Ромашка"
                  autoFocus
                  style={{ width: "100%", background: "#0f1117", border: "1px solid #2a3050", borderRadius: 8, padding: "10px 12px", color: "#e8eaf6", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  ИНН
                </label>
                <input
                  value={form.inn}
                  onChange={e => setForm(f => ({ ...f, inn: e.target.value }))}
                  placeholder="12345678901234"
                  style={{ width: "100%", background: "#0f1117", border: "1px solid #2a3050", borderRadius: 8, padding: "10px 12px", color: "#e8eaf6", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Налоговый режим
                </label>
                <select
                  value={form.tax_regime}
                  onChange={e => setForm(f => ({ ...f, tax_regime: e.target.value }))}
                  style={{ width: "100%", background: "#0f1117", border: "1px solid #2a3050", borderRadius: 8, padding: "10px 12px", color: "#e8eaf6", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}>
                  <option value="ОРН">ОРН (общий режим)</option>
                  <option value="Упрощёнка">Упрощённая система</option>
                  <option value="Патент">Патент</option>
                  <option value="НДС">Плательщик НДС</option>
                </select>
              </div>

              {error && (
                <div style={{ background: "#3A0808", color: "#FCA5A5", fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, background: saving ? "#6B7280" : "#4F46E5", color: "#fff", border: "none", padding: "11px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {saving ? "Сохраняю..." : "Добавить"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError("") }}
                  style={{ flex: 1, background: "none", color: "#8892b0", border: "1px solid #2a3050", padding: "11px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
