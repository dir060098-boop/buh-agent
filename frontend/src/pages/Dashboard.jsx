import { useEffect, useState } from "react"
import { companies, auth } from "../api/client"
import { useNavigate } from "react-router-dom"

const TAX_REGIMES = ["ОРН (общий режим)", "Упрощённая система", "Патент", "Плательщик НДС"]

const EMPTY_FORM = { name: "", inn: "", tax_regime: "ОРН (общий режим)" }

export default function Dashboard() {
  const [list, setList] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Форма создания
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [createError, setCreateError] = useState("")
  const [creating, setSaving] = useState(false)

  // Форма редактирования
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editError, setEditError] = useState("")
  const [editing, setEditing] = useState(false)
  const [innConfirmPending, setInnConfirmPending] = useState(false)

  // Удаление
  const [deleteId, setDeleteId] = useState(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    await Promise.all([
      companies.list().then(r => setList(r.data)).catch(() => {}),
      auth.me().then(r => setUser(r.data)).catch(() => {})
    ])
    setLoading(false)
  }

  // ── СОЗДАНИЕ ──────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.name.trim()) { setCreateError("Введите название"); return }
    setSaving(true); setCreateError("")
    try {
      await companies.create({ name: createForm.name.trim(), inn: createForm.inn.trim() || null, tax_regime: createForm.tax_regime })
      await load()
      setShowCreate(false)
      setCreateForm(EMPTY_FORM)
    } catch (e) {
      setCreateError(e.response?.data?.detail || "Ошибка при создании")
    } finally { setSaving(false) }
  }

  // ── РЕДАКТИРОВАНИЕ ────────────────────────────────────
  function openEdit(c) {
    setEditId(c.id)
    setEditForm({ name: c.name, inn: c.inn || "", tax_regime: c.tax_regime || "ОРН (общий режим)" })
    setEditError("")
    setInnConfirmPending(false)
  }

  async function handleEdit(e, confirmed = false) {
    e?.preventDefault()
    setEditing(true); setEditError("")
    try {
      const original = list.find(c => c.id === editId)
      const innChanged = editForm.inn.trim() !== (original?.inn || "")
      await companies.update(editId, {
        name: editForm.name.trim(),
        inn: editForm.inn.trim() || null,
        tax_regime: editForm.tax_regime,
        inn_confirmed: confirmed || !innChanged
      })
      await load()
      setEditId(null)
    } catch (e) {
      const detail = e.response?.data?.detail || ""
      if (detail === "INN_CONFIRM_REQUIRED") {
        setInnConfirmPending(true)
        setEditError("ИНН изменён — подтвердите что это правильно")
      } else {
        setEditError(detail || "Ошибка при сохранении")
      }
    } finally { setEditing(false) }
  }

  // ── УДАЛЕНИЕ ──────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true); setDeleteError("")
    try {
      await companies.delete(deleteId)
      await load()
      setDeleteId(null)
    } catch (e) {
      setDeleteError(e.response?.data?.detail || "Ошибка при удалении")
    } finally { setDeleting(false) }
  }

  function handleLogout() {
    localStorage.removeItem("token")
    navigate("/login")
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : "Добрый вечер"

  // ── RENDER ────────────────────────────────────────────
  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", fontFamily: "Manrope, sans-serif", color: "#e8eaf6" }}>

      {/* Шапка */}
      <div style={{ background: "#181c27", borderBottom: "1px solid #2a3050", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Бух<span style={{ color: "#4F46E5" }}>Агент</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user && <span style={{ fontSize: 12, color: "#8892b0" }}>{user.full_name || user.email}</span>}
          <button onClick={handleLogout} style={{ background: "none", border: "1px solid #2a3050", borderRadius: 6, padding: "5px 12px", color: "#8892b0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Выйти</button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{greeting} 👋</h1>
          <p style={{ margin: 0, color: "#8892b0", fontSize: 13 }}>Мои компании</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#4a5580" }}>Загрузка...</div>
        ) : (
          <>
            {/* Пустое состояние */}
            {list.length === 0 && !showCreate && (
              <div style={{ textAlign: "center", padding: "48px 24px", background: "#181c27", borderRadius: 14, border: "1px solid #2a3050", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Компаний пока нет</p>
                <p style={{ fontSize: 13, color: "#8892b0", margin: "0 0 20px" }}>Добавьте первую компанию чтобы начать работу</p>
                <button onClick={() => setShowCreate(true)}
                  style={{ background: "#4F46E5", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  + Добавить компанию
                </button>
              </div>
            )}

            {/* Список компаний */}
            {list.map(c => (
              <div key={c.id} style={{ background: "#181c27", border: "1px solid #2a3050", borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>

                {/* Кликабельная часть */}
                <div onClick={() => navigate("/company/" + c.id)}
                  style={{ flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#4F46E522", border: "1px solid #4F46E544", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏢</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#8892b0", marginTop: 2 }}>
                      {c.inn && `ИНН ${c.inn}`}{c.inn && c.tax_regime && " · "}{c.tax_regime}
                    </div>
                    <div style={{ fontSize: 11, color: "#4a5580", marginTop: 3 }}>
                      {c.doc_count > 0 && `${c.doc_count} doc`}
                      {c.doc_count > 0 && c.journal_count > 0 && " · "}
                      {c.journal_count > 0 && `${c.journal_count} проводок`}
                    </div>
                  </div>
                </div>

                {/* Бейджи */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {c.pending_docs > 0 && (
                    <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>{c.pending_docs} ожид.</span>
                  )}
                  {c.overdue_deadlines > 0 && (
                    <span style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>{c.overdue_deadlines} срок</span>
                  )}
                </div>

                {/* Кнопки действий */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(c)}
                    title="Редактировать"
                    style={{ background: "none", border: "1px solid #2a3050", borderRadius: 6, padding: "6px 10px", color: "#8892b0", cursor: "pointer", fontSize: 14 }}>✏️</button>
                  <button
                    onClick={() => { setDeleteId(c.id); setDeleteError("") }}
                    title={c.can_delete ? "Удалить" : "Нельзя удалить — есть данные"}
                    style={{ background: "none", border: "1px solid #2a3050", borderRadius: 6, padding: "6px 10px", color: c.can_delete ? "#EF4444" : "#4a5580", cursor: c.can_delete ? "pointer" : "not-allowed", fontSize: 14, opacity: c.can_delete ? 1 : 0.4 }}>🗑️</button>
                </div>
              </div>
            ))}

            {/* Кнопка добавить */}
            {!showCreate && (
              <button onClick={() => { setShowCreate(true); setCreateError("") }}
                style={{ width: "100%", background: "none", border: "1px dashed #2a3050", borderRadius: 12, padding: "13px", color: "#8892b0", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", marginTop: 4 }}>
                + Добавить компанию
              </button>
            )}
          </>
        )}

        {/* ── ФОРМА СОЗДАНИЯ ── */}
        {showCreate && <CompanyForm
          title="Новая компания"
          form={createForm}
          setForm={setCreateForm}
          error={createError}
          saving={creating}
          onSubmit={handleCreate}
          onCancel={() => { setShowCreate(false); setCreateError("") }}
        />}

        {/* ── ФОРМА РЕДАКТИРОВАНИЯ ── */}
        {editId && <CompanyForm
          title="Редактировать компанию"
          form={editForm}
          setForm={setEditForm}
          error={editError}
          saving={editing}
          innConfirmPending={innConfirmPending}
          onSubmit={handleEdit}
          onConfirmInn={() => handleEdit(null, true)}
          onCancel={() => { setEditId(null); setInnConfirmPending(false) }}
          isEdit
        />}

        {/* ── ДИАЛОГ УДАЛЕНИЯ ── */}
        {deleteId && (() => {
          const c = list.find(x => x.id === deleteId)
          return (
            <div style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
              <div style={{ background: "#181c27", border: "1px solid #2a3050", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%" }}>
                {c?.can_delete ? (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Удалить компанию?</h3>
                    <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8892b0" }}>«{c?.name}» будет удалена без возможности восстановления.</p>
                    {deleteError && <div style={{ background: "#3A0808", color: "#FCA5A5", fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 14 }}>{deleteError}</div>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={handleDelete} disabled={deleting}
                        style={{ flex: 1, background: "#EF4444", color: "#fff", border: "none", padding: 11, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {deleting ? "Удаляю..." : "Удалить"}
                      </button>
                      <button onClick={() => setDeleteId(null)}
                        style={{ flex: 1, background: "none", border: "1px solid #2a3050", color: "#8892b0", padding: 11, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Отмена
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🚫</div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Нельзя удалить</h3>
                    <p style={{ margin: "0 0 6px", fontSize: 13, color: "#8892b0" }}>У компании «{c?.name}» есть данные:</p>
                    <ul style={{ margin: "0 0 20px", padding: "0 0 0 20px", fontSize: 13, color: "#8892b0" }}>
                      {c?.doc_count > 0 && <li>{c.doc_count} документов</li>}
                      {c?.journal_count > 0 && <li>{c.journal_count} проводок</li>}
                    </ul>
                    <p style={{ margin: "0 0 20px", fontSize: 13, color: "#F59E0B" }}>Сначала удалите все данные компании.</p>
                    <button onClick={() => setDeleteId(null)}
                      style={{ width: "100%", background: "#4F46E5", color: "#fff", border: "none", padding: 11, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      Понятно
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Переиспользуемая форма компании ──────────────────────
function CompanyForm({ title, form, setForm, error, saving, onSubmit, onCancel, isEdit, innConfirmPending, onConfirmInn }) {
  return (
    <div style={{ background: "#181c27", border: "1px solid #4F46E5", borderRadius: 14, padding: 20, marginTop: 12 }}>
      <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 800 }}>{title}</h3>
      <form onSubmit={onSubmit}>
        <Field label="Название *">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ОсОО Ромашка" autoFocus style={inputStyle} />
        </Field>

        <Field label={isEdit ? "ИНН (изменение требует подтверждения)" : "ИНН"}>
          <input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))}
            placeholder="12345678901234" style={inputStyle} />
        </Field>

        <Field label="Налоговый режим">
          <select value={form.tax_regime} onChange={e => setForm(f => ({ ...f, tax_regime: e.target.value }))} style={inputStyle}>
            {["ОРН (общий режим)", "Упрощённая система", "Патент", "Плательщик НДС"].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>

        {error && (
          <div style={{ background: "#3A0808", color: "#FCA5A5", fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Подтверждение смены ИНН */}
        {innConfirmPending && (
          <div style={{ background: "#2A1F00", border: "1px solid #F59E0B", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#FDE68A" }}>⚠️ Вы меняете ИНН. Это может повлиять на связанные документы. Подтвердите изменение.</p>
            <button type="button" onClick={onConfirmInn}
              style={{ background: "#F59E0B", color: "#000", border: "none", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Да, изменить ИНН
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving}
            style={{ flex: 1, background: saving ? "#6B7280" : "#4F46E5", color: "#fff", border: "none", padding: 11, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Сохраняю..." : isEdit ? "Сохранить" : "Добавить"}
          </button>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, background: "none", color: "#8892b0", border: "1px solid #2a3050", padding: 11, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: "100%", background: "#0f1117", border: "1px solid #2a3050",
  borderRadius: 8, padding: "10px 12px", color: "#e8eaf6",
  fontSize: 14, fontFamily: "Manrope, sans-serif", boxSizing: "border-box"
}
