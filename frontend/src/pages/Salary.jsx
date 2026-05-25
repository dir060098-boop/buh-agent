import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { salary, companies } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

// ── Утилиты ────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

const SEL = {
  background: 'var(--surface)', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 10px',
  color: 'var(--text)', fontSize: 13, fontFamily: 'Manrope, sans-serif', cursor: 'pointer',
}
const INP = { ...SEL, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const LBL = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}

const EMPTY_EMP = { full_name: '', inn: '', position: '', salary: '', hire_date: '', is_foreign: false }

// ── Главный компонент ───────────────────────────────────────────────────────
export default function Salary() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [company, setCompany]   = useState(null)
  const [tab, setTab]           = useState('employees')   // employees | payroll
  const [employees, setEmployees] = useState([])
  const [preview, setPreview]   = useState(null)          // { rows, totals, tax_info }
  const [history, setHistory]   = useState([])
  const [selectedRun, setSelectedRun] = useState(null)    // детали прошлого расчёта
  const [loading, setLoading]   = useState(false)
  const [confirmState, setConfirmState] = useState(null)

  // Форма добавления сотрудника
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [empForm, setEmpForm]       = useState(EMPTY_EMP)
  const [saving, setSaving]         = useState(false)

  // Форма расчёта зарплаты
  const now = new Date()
  const [payYear, setPayYear]   = useState(now.getFullYear())
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1)
  const [posting, setPosting]   = useState(false)

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  const loadEmployees = useCallback(() => {
    salary.employees(companyId).then(r => setEmployees(r.data)).catch(() => {})
  }, [companyId])

  const loadPreview = useCallback(() => {
    setLoading(true)
    salary.payroll(companyId)
      .then(r => setPreview(r.data))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false))
  }, [companyId])

  const loadHistory = useCallback(() => {
    salary.history(companyId).then(r => setHistory(r.data)).catch(() => {})
  }, [companyId])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (tab === 'payroll') {
      loadPreview()
      loadHistory()
    }
  }, [tab, loadPreview, loadHistory])

  // ── Добавить сотрудника ─────────────────────────────────────────────────
  async function handleAddEmployee() {
    if (!empForm.full_name || !empForm.salary || !empForm.hire_date) return
    setSaving(true)
    try {
      await salary.addEmployee(companyId, { ...empForm, salary: parseFloat(empForm.salary) })
      setShowAddEmp(false)
      setEmpForm(EMPTY_EMP)
      loadEmployees()
    } finally { setSaving(false) }
  }

  // ── Уволить сотрудника ──────────────────────────────────────────────────
  function handleFire(emp) {
    setConfirmState({
      title: 'Уволить сотрудника?',
      message: `«${emp.full_name}» будет переведён в статус «Уволен». Данные сохранятся в истории расчётов.`,
      confirmLabel: 'Уволить',
      danger: true,
      onConfirm: async () => {
        await salary.fire(companyId, emp.id)
        loadEmployees()
      }
    })
  }

  // ── Удалить сотрудника полностью ────────────────────────────────────────
  function handleDeleteEmp(emp) {
    setConfirmState({
      title: 'Удалить сотрудника?',
      message: `«${emp.full_name}» будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await salary.deleteEmployee(companyId, emp.id)
        loadEmployees()
      }
    })
  }

  // ── Провести расчёт ─────────────────────────────────────────────────────
  async function handleRunPayroll() {
    setPosting(true)
    try {
      const run = await salary.runPayroll(companyId, { year: payYear, month: payMonth })
      loadHistory()
      setSelectedRun(run.data)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Ошибка расчёта'
      alert(msg)
    } finally { setPosting(false) }
  }

  // ── Удалить расчёт ──────────────────────────────────────────────────────
  function handleDeleteRun(run) {
    setConfirmState({
      title: 'Удалить расчёт?',
      message: `Расчёт за ${MONTHS[run.month]} ${run.year} и связанные проводки в журнале будут удалены.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await salary.deleteRun(companyId, run.id)
        setSelectedRun(null)
        loadHistory()
      }
    })
  }

  // ── Открыть детали расчёта ───────────────────────────────────────────────
  async function openRun(run) {
    const r = await salary.getRun(companyId, run.id)
    setSelectedRun(r.data)
  }

  const active   = employees.filter(e => e.is_active)
  const inactive = employees.filter(e => !e.is_active)

  const alreadyPosted = history.some(r => r.year === payYear && r.month === payMonth)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Шапка */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={() => navigate(`/company/${companyId}`)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Назад
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>👥 Зарплата и кадры</div>
          {company && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{company.name}</div>}
        </div>
      </div>

      {/* Табы */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: 0 }}>
        {[['employees', '👤 Сотрудники'], ['payroll', '💰 Расчёт зарплаты']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '12px 20px', fontSize: 13, fontWeight: 700, color: tab === key ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px' }}>

        {/* ════════════════ ТАБ: СОТРУДНИКИ ════════════════ */}
        {tab === 'employees' && (
          <div>
            {/* Шапка таба */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: 'Активных', val: active.length, color: 'var(--success)' },
                  { label: 'Уволено', val: inactive.length, color: 'var(--text3)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAddEmp(true)}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Добавить сотрудника
              </button>
            </div>

            {/* Таблица активных */}
            {active.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginBottom: 16 }}>
                <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'grid', gridTemplateColumns: '1fr 120px 140px 90px 80px 80px' }}>
                  <div>Сотрудник</div>
                  <div>ИНН</div>
                  <div>Должность</div>
                  <div style={{ textAlign: 'right' }}>Оклад</div>
                  <div style={{ textAlign: 'center' }}>Статус</div>
                  <div></div>
                </div>
                {active.map(emp => (
                  <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px 90px 80px 80px', padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{emp.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>с {fmtDate(emp.hire_date)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{emp.inn || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{emp.position || '—'}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(emp.salary)}</div>
                    <div style={{ textAlign: 'center' }}>
                      {emp.is_foreign
                        ? <span style={{ background: '#fff8e1', color: '#b45309', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Нерезидент</span>
                        : <span style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Резидент</span>
                      }
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => handleFire(emp)} title="Уволить"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--warn)', fontFamily: 'inherit' }}>
                        Уволить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {active.length === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Сотрудников нет — добавьте первого
              </div>
            )}

            {/* Уволенные (свёрнуто) */}
            {inactive.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text3)', fontWeight: 700, padding: '6px 0', userSelect: 'none' }}>
                  Уволенные ({inactive.length})
                </summary>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginTop: 6 }}>
                  {inactive.map(emp => (
                    <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px 90px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', opacity: 0.6 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{emp.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>уволен {fmtDate(emp.fire_date)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{emp.inn || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{emp.position || '—'}</div>
                      <div style={{ textAlign: 'right', fontSize: 13 }}>{fmt(emp.salary)}</div>
                      <div></div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleDeleteEmp(emp)} title="Удалить"
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--error)', fontFamily: 'inherit' }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ════════════════ ТАБ: РАСЧЁТ ЗАРПЛАТЫ ════════════════ */}
        {tab === 'payroll' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

            {/* Левая колонка: предпросмотр + кнопка */}
            <div>
              {/* Выбор месяца */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>Месяц</label>
                    <select value={payMonth} onChange={e => setPayMonth(+e.target.value)} style={{ ...SEL, width: '100%' }}>
                      {MONTHS.slice(1).map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>Год</label>
                    <select value={payYear} onChange={e => setPayYear(+e.target.value)} style={{ ...SEL, width: '100%' }}>
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={handleRunPayroll}
                    disabled={posting || alreadyPosted || active.length === 0}
                    style={{
                      background: alreadyPosted ? 'var(--surface2)' : 'var(--accent)',
                      color: alreadyPosted ? 'var(--text3)' : '#fff',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      padding: '9px 20px', fontSize: 13, fontWeight: 700,
                      cursor: (posting || alreadyPosted || active.length === 0) ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                      opacity: active.length === 0 ? 0.5 : 1,
                    }}>
                    {posting ? 'Проводится...' : alreadyPosted ? '✓ Уже проведено' : '⚡ Провести'}
                  </button>
                </div>
                {alreadyPosted && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--warn)', background: 'var(--warn-light)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                    Расчёт за {MONTHS[payMonth]} {payYear} уже проведён. Чтобы пересчитать — удалите его из истории.
                  </div>
                )}
              </div>

              {/* Предпросмотр расчёта */}
              {loading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
              ) : preview && preview.rows.length > 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px' }}>
                    <div>Сотрудник</div>
                    <div style={{ textAlign: 'right' }}>Оклад</div>
                    <div style={{ textAlign: 'right' }}>ПН 10%</div>
                    <div style={{ textAlign: 'right' }}>СФ 8%</div>
                    <div style={{ textAlign: 'right' }}>К выдаче</div>
                    <div style={{ textAlign: 'right' }}>СФ раб-ль</div>
                  </div>
                  {preview.rows.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.employee_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {r.position || ''}
                          {r.is_foreign && <span style={{ marginLeft: 4, color: '#b45309', fontSize: 10, fontWeight: 700 }}>нерезидент</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(r.gross)}</div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(r.income_tax)}</div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(r.sf_employee)}</div>
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>{fmt(r.net)}</div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--warn)' }}>{fmt(r.sf_employer)}</div>
                    </div>
                  ))}
                  {/* Итого */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px', padding: '10px 16px', background: 'var(--surface2)', borderTop: '2px solid var(--border)', fontWeight: 800, fontSize: 12 }}>
                    <div style={{ color: 'var(--text3)' }}>ИТОГО</div>
                    <div style={{ textAlign: 'right' }}>{fmt(preview.totals.gross)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(preview.totals.income_tax)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(preview.totals.sf_employee)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt(preview.totals.net)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(preview.totals.sf_employer)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  Нет активных сотрудников — добавьте их на вкладке «Сотрудники»
                </div>
              )}
            </div>

            {/* Правая колонка: история */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>📋 История расчётов</div>
              {history.length === 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  Расчётов пока нет
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.map(run => (
                    <div key={run.id}
                      onClick={() => openRun(run)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{MONTHS[run.month]} {run.year}</div>
                        <span style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>Проведено</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
                        К выдаче: <strong>{fmt(run.net_total)} KGS</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        Оклады: {fmt(run.gross_total)} · ПН: {fmt(run.income_tax_total)} · СФ: {fmt(run.sf_employer_total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════ МОДАЛ: Добавить сотрудника ════════ */}
      {showAddEmp && (
        <div onClick={() => setShowAddEmp(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Новый сотрудник</div>
              <button onClick={() => setShowAddEmp(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={LBL}>ФИО *</label>
                <input value={empForm.full_name} onChange={e => setEmpForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Иванов Иван Иванович" style={INP} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LBL}>ИНН</label>
                  <input value={empForm.inn} onChange={e => setEmpForm(f => ({ ...f, inn: e.target.value }))}
                    placeholder="1234567890" style={INP} />
                </div>
                <div>
                  <label style={LBL}>Должность</label>
                  <input value={empForm.position} onChange={e => setEmpForm(f => ({ ...f, position: e.target.value }))}
                    placeholder="Бухгалтер" style={INP} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LBL}>Оклад (KGS) *</label>
                  <input type="number" value={empForm.salary} onChange={e => setEmpForm(f => ({ ...f, salary: e.target.value }))}
                    placeholder="30000" style={INP} />
                </div>
                <div>
                  <label style={LBL}>Дата приёма *</label>
                  <input type="date" value={empForm.hire_date} onChange={e => setEmpForm(f => ({ ...f, hire_date: e.target.value }))}
                    style={INP} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                <input type="checkbox" checked={empForm.is_foreign}
                  onChange={e => setEmpForm(f => ({ ...f, is_foreign: e.target.checked }))} />
                Нерезидент КР (иностранный сотрудник)
              </label>
              {empForm.is_foreign && (
                <div style={{ fontSize: 11, color: '#b45309', background: '#fff8e1', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  Ставки: ПН 10%, СФ = 0% (освобождён)
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={handleAddEmployee}
                disabled={!empForm.full_name || !empForm.salary || !empForm.hire_date || saving}
                style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!empForm.full_name || !empForm.salary || !empForm.hire_date) ? 0.5 : 1 }}>
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
              <button onClick={() => setShowAddEmp(false)}
                style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ МОДАЛ: Детали расчёта ════════ */}
      {selectedRun && (
        <div onClick={() => setSelectedRun(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 640, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Шапка */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Расчёт за {MONTHS[selectedRun.month]} {selectedRun.year}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {selectedRun.entries?.length || 0} сотрудников · к выдаче {fmt(selectedRun.net_total)} KGS
                </div>
              </div>
              <button onClick={() => setSelectedRun(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>

            {/* Таблица */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Заголовок */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px', padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <div>Сотрудник</div>
                <div style={{ textAlign: 'right' }}>Оклад</div>
                <div style={{ textAlign: 'right' }}>ПН</div>
                <div style={{ textAlign: 'right' }}>СФ</div>
                <div style={{ textAlign: 'right' }}>К выдаче</div>
                <div style={{ textAlign: 'right' }}>СФ р-ль</div>
              </div>
              {(selectedRun.entries || []).map((e, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.employee_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.position || ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(e.gross)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(e.income_tax)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(e.sf_employee)}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>{fmt(e.net)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--warn)' }}>{fmt(e.sf_employer)}</div>
                </div>
              ))}
              {/* Итого */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 90px 90px', padding: '10px 16px', background: 'var(--surface2)', fontWeight: 800, fontSize: 12 }}>
                <div style={{ color: 'var(--text3)' }}>ИТОГО</div>
                <div style={{ textAlign: 'right' }}>{fmt(selectedRun.gross_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(selectedRun.income_tax_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(selectedRun.sf_employee_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt(selectedRun.net_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(selectedRun.sf_employer_total)}</div>
              </div>

              {/* Легенда проводок */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--ai-light)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ai)', marginBottom: 6 }}>📒 Проводки в журнале</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text2)' }}>
                  <div>Дт 8010 / Кт 3520 — {fmt(selectedRun.gross_total)} (начисление зарплаты)</div>
                  <div>Дт 3520 / Кт 3410 — {fmt(selectedRun.income_tax_total)} (подоходный налог)</div>
                  {selectedRun.sf_employee_total > 0 && <div>Дт 3520 / Кт 3530 — {fmt(selectedRun.sf_employee_total)} (СФ работника)</div>}
                  {selectedRun.sf_employer_total > 0 && <div>Дт 8020 / Кт 3530 — {fmt(selectedRun.sf_employer_total)} (СФ работодателя)</div>}
                </div>
              </div>
            </div>

            {/* Футер */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => navigate(`/company/${companyId}/journal`)}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                📒 Перейти в журнал
              </button>
              <button onClick={() => handleDeleteRun(selectedRun)}
                style={{ background: 'none', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--error)' }}>
                Удалить расчёт
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  )
}
