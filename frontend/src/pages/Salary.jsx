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
  const part = s.slice(0, 10)   // берём только YYYY-MM-DD из ISO строки
  const [y, m, d] = part.split('-')
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

const EMPTY_EMP   = { full_name: '', inn: '', position: '', salary: '', hire_date: '', is_foreign: false }
const EMPTY_LEAVE = { employee_id: '', leave_type: 'vacation', start_date: '', end_date: '', notes: '' }
const today = new Date().toISOString().slice(0, 10)

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

  // Форма добавления / редактирования сотрудника
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [editEmp, setEditEmp]       = useState(null)      // null = добавление, объект = редактирование
  const [empForm, setEmpForm]       = useState(EMPTY_EMP)
  const [saving, setSaving]         = useState(false)

  // Форма расчёта зарплаты
  const now = new Date()
  const [payYear, setPayYear]   = useState(now.getFullYear())
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1)
  const [posting, setPosting]   = useState(false)

  // Форма выплаты
  const [payForm, setPayForm] = useState({ pay_date: today, account_type: 'bank' })
  const [paying, setPaying]   = useState(false)

  // Корректировки (премии/удержания) перед проведением
  const [adjustments, setAdjustments] = useState({})   // { employee_id: { bonus, deduction } }

  // Аванс
  const [advForm, setAdvForm] = useState({ amount: '', pay_date: today, account_type: 'bank' })

  // Расчётный листок
  const [slipEntry, setSlipEntry] = useState(null)

  // Отпуска и больничные
  const [leaves, setLeaves]               = useState([])
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveForm, setLeaveForm]         = useState(EMPTY_LEAVE)
  const [savingLeave, setSavingLeave]     = useState(false)

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

  const loadLeaves = useCallback(() => {
    salary.leaves(companyId).then(r => setLeaves(r.data)).catch(() => {})
  }, [companyId])

  useEffect(() => {
    if (tab === 'leaves') loadLeaves()
  }, [tab, loadLeaves])

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

  // ── Открыть форму редактирования ────────────────────────────────────────
  function openEditEmp(emp) {
    setEditEmp(emp)
    setEmpForm({
      full_name:  emp.full_name,
      inn:        emp.inn || '',
      position:   emp.position || '',
      salary:     emp.salary,
      hire_date:  emp.hire_date || '',
      is_foreign: emp.is_foreign,
    })
    setShowAddEmp(true)
  }

  // ── Сохранить изменения сотрудника ───────────────────────────────────────
  async function handleSaveEmployee() {
    if (!empForm.full_name || !empForm.salary) return
    setSaving(true)
    try {
      if (editEmp) {
        await salary.updateEmployee(companyId, editEmp.id, {
          full_name:  empForm.full_name,
          inn:        empForm.inn || null,
          position:   empForm.position || null,
          salary:     parseFloat(empForm.salary),
          is_foreign: empForm.is_foreign,
        })
      } else {
        await salary.addEmployee(companyId, { ...empForm, salary: parseFloat(empForm.salary) })
      }
      setShowAddEmp(false)
      setEditEmp(null)
      setEmpForm(EMPTY_EMP)
      loadEmployees()
      if (tab === 'payroll') loadPreview()
    } finally { setSaving(false) }
  }

  // ── Выплатить зарплату ───────────────────────────────────────────────────
  async function handlePaySalary() {
    setPaying(true)
    try {
      const r = await salary.paySalary(companyId, selectedRun.id, payForm)
      setSelectedRun(r.data)
      loadHistory()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка выплаты')
    } finally { setPaying(false) }
  }

  // ── Оплатить налоги ──────────────────────────────────────────────────────
  async function handlePayTaxes() {
    setPaying(true)
    try {
      const r = await salary.payTaxes(companyId, selectedRun.id, payForm)
      setSelectedRun(r.data)
      loadHistory()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка оплаты налогов')
    } finally { setPaying(false) }
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
      const adjs = Object.entries(adjustments)
        .filter(([, v]) => (v.bonus || 0) !== 0 || (v.deduction || 0) !== 0)
        .map(([emp_id, v]) => ({
          employee_id: parseInt(emp_id),
          bonus:       parseFloat(v.bonus)     || 0,
          deduction:   parseFloat(v.deduction) || 0,
        }))
      const run = await salary.runPayroll(companyId, { year: payYear, month: payMonth, adjustments: adjs })
      setAdjustments({})
      loadHistory()
      setSelectedRun(run.data)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Ошибка расчёта'
      alert(msg)
    } finally { setPosting(false) }
  }

  // ── Аванс ────────────────────────────────────────────────────────────────
  async function handlePayAdvance() {
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) return
    setPaying(true)
    try {
      const r = await salary.payAdvance(companyId, selectedRun.id, {
        amount:       parseFloat(advForm.amount),
        pay_date:     advForm.pay_date,
        account_type: advForm.account_type,
      })
      setSelectedRun(r.data)
      loadHistory()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    } finally { setPaying(false) }
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

  // ── Экспорт расчёта в Excel ───────────────────────────────────────────────
  async function handleExportRun() {
    try {
      const res = await salary.exportRun(companyId, selectedRun.id)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `payroll_${selectedRun.year}_${String(selectedRun.month).padStart(2, '0')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Ошибка экспорта')
    }
  }

  // ── Добавить отпуск/больничный ─────────────────────────────────────────────
  async function handleAddLeave() {
    if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) return
    setSavingLeave(true)
    try {
      await salary.addLeave(companyId, leaveForm)
      setShowLeaveForm(false)
      setLeaveForm(EMPTY_LEAVE)
      loadLeaves()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    } finally { setSavingLeave(false) }
  }

  function handleDeleteLeave(leave) {
    setConfirmState({
      title: 'Удалить запись?',
      message: `Отпуск/больничный «${leave.employee_name}» (${leave.start_date} – ${leave.end_date}) будет удалён.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await salary.deleteLeave(companyId, leave.id)
        loadLeaves()
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
        {[['employees', '👤 Сотрудники'], ['payroll', '💰 Расчёт зарплаты'], ['leaves', '🌴 Отпуска/б-ные']].map(([key, label]) => (
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
                      <button onClick={() => openEditEmp(emp)} title="Редактировать"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit' }}>
                        ✏️
                      </button>
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
                  <div style={{ padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'grid', gridTemplateColumns: '1fr 75px 80px 80px 70px 70px 70px 85px' }}>
                    <div>Сотрудник</div>
                    <div style={{ textAlign: 'right' }}>Оклад</div>
                    <div style={{ textAlign: 'center' }}>Премия</div>
                    <div style={{ textAlign: 'center' }}>Удержание</div>
                    <div style={{ textAlign: 'right' }}>ПН 10%</div>
                    <div style={{ textAlign: 'right' }}>ПФР 8%</div>
                    <div style={{ textAlign: 'right' }}>ГНПФР 2%</div>
                    <div style={{ textAlign: 'right' }}>К выдаче</div>
                  </div>
                  {preview.rows.map((r, i) => {
                    const adj = adjustments[r.employee_id] || { bonus: '', deduction: '' }
                    const bonus = parseFloat(adj.bonus) || 0
                    const ded   = parseFloat(adj.deduction) || 0
                    // Пересчёт на лету с ГНПФР
                    const taxable = r.gross + bonus
                    const it    = Math.round(taxable * 0.10 * 100) / 100
                    const pfr   = Math.round(taxable * (r.is_foreign ? 0 : 0.08) * 100) / 100
                    const gnpfr = Math.round(taxable * (r.is_foreign ? 0 : 0.02) * 100) / 100
                    const net   = Math.round((taxable - it - pfr - gnpfr - ded) * 100) / 100
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 75px 80px 80px 70px 70px 70px 85px', padding: '8px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 4 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.employee_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.position || ''}{r.is_foreign && <span style={{ marginLeft: 4, color: '#b45309' }}>нерез.</span>}</div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{fmt(r.gross)}</div>
                        <div>
                          <input
                            type="number" min="0" placeholder="0"
                            value={adj.bonus}
                            onChange={e => setAdjustments(a => ({ ...a, [r.employee_id]: { ...( a[r.employee_id] || {}), bonus: e.target.value } }))}
                            style={{ width: '100%', boxSizing: 'border-box', ...INP, padding: '4px 6px', fontSize: 12, color: 'var(--success)', textAlign: 'right' }}
                          />
                        </div>
                        <div>
                          <input
                            type="number" min="0" placeholder="0"
                            value={adj.deduction}
                            onChange={e => setAdjustments(a => ({ ...a, [r.employee_id]: { ...(a[r.employee_id] || {}), deduction: e.target.value } }))}
                            style={{ width: '100%', boxSizing: 'border-box', ...INP, padding: '4px 6px', fontSize: 12, color: 'var(--error)', textAlign: 'right' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--error)' }}>−{fmt(it)}</div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--error)' }}>−{fmt(pfr)}</div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--error)' }}>−{fmt(gnpfr)}</div>
                        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: net >= 0 ? 'var(--success)' : 'var(--error)' }}>{fmt(net)}</div>
                      </div>
                    )
                  })}
                  {/* Итого */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px 80px 80px 70px 70px 70px 85px', padding: '8px 16px', background: 'var(--surface2)', borderTop: '2px solid var(--border)', fontWeight: 800, fontSize: 11 }}>
                    <div style={{ color: 'var(--text3)' }}>ИТОГО</div>
                    <div style={{ textAlign: 'right' }}>{fmt(preview.totals.gross)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt(Object.values(adjustments).reduce((s,a) => s + (parseFloat(a.bonus)||0), 0))}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>{fmt(Object.values(adjustments).reduce((s,a) => s + (parseFloat(a.deduction)||0), 0))}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(preview.totals.income_tax)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(preview.totals.sf_employee)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(preview.totals.gnpfr_employee || 0)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt(preview.totals.net)}</div>
                  </div>
                  <div style={{ padding: '6px 16px', fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)' }}>
                    Премии и удержания войдут в расчёт при нажатии «Провести»
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
                        <div style={{ display: 'flex', gap: 4 }}>
                          {run.is_paid
                            ? <span style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>✓ Выплачено</span>
                            : <span style={{ background: 'var(--warn-light)', color: 'var(--warn)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Не выплачено</span>
                          }
                          {run.is_tax_paid
                            ? <span style={{ background: '#e8f0fe', color: '#1a56db', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>✓ Налоги</span>
                            : <span style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Налоги</span>
                          }
                        </div>
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
        {/* ════════════════ ТАБ: ОТПУСКА/БОЛЬНИЧНЫЕ ════════════════ */}
        {tab === 'leaves' && (
          <div>
            {/* Шапка */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>🌴 Отпуска и больничные</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                  Дни 1–3 больничного — работодатель · с 4-го дня — ФОМС · отпускные = оклад ÷ 25 × дни
                </div>
              </div>
              <button onClick={() => setShowLeaveForm(v => !v)}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {showLeaveForm ? '✕ Закрыть' : '+ Добавить'}
              </button>
            </div>

            {/* Форма добавления */}
            {showLeaveForm && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Новая запись</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={LBL}>Сотрудник *</label>
                    <select value={leaveForm.employee_id}
                      onChange={e => setLeaveForm(f => ({ ...f, employee_id: e.target.value }))}
                      style={{ ...SEL, width: '100%' }}>
                      <option value="">— выберите —</option>
                      {employees.filter(e => e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={LBL}>Тип *</label>
                    <select value={leaveForm.leave_type}
                      onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}
                      style={{ ...SEL, width: '100%' }}>
                      <option value="vacation">🌴 Отпуск</option>
                      <option value="sick">🤒 Больничный</option>
                    </select>
                  </div>
                  <div>
                    <label style={LBL}>Дата начала *</label>
                    <input type="date" value={leaveForm.start_date}
                      onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                      style={{ ...SEL, width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={LBL}>Дата окончания *</label>
                    <input type="date" value={leaveForm.end_date}
                      onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                      style={{ ...SEL, width: '100%', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={LBL}>Примечание</label>
                  <input value={leaveForm.notes}
                    onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Необязательно"
                    style={{ ...INP, width: '100%', boxSizing: 'border-box' }} />
                </div>

                {/* Предпросмотр расчёта */}
                {(() => {
                  if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) return null
                  const emp  = employees.find(e => String(e.id) === String(leaveForm.employee_id))
                  const days = Math.max(0, Math.floor((new Date(leaveForm.end_date) - new Date(leaveForm.start_date)) / 86400000) + 1)
                  if (!emp || days <= 0) return null
                  const daily = Math.round(emp.salary / 25 * 100) / 100
                  const eDays = leaveForm.leave_type === 'sick' ? Math.min(3, days) : days
                  const pay   = Math.round(daily * eDays * 100) / 100
                  const fDays = leaveForm.leave_type === 'sick' ? Math.max(0, days - 3) : 0
                  return (
                    <div style={{ background: 'var(--ai-light)', border: '1px solid var(--ai)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
                      📊 <strong>{days} дн.</strong> · среднедн. {fmt(daily)} KGS ·{' '}
                      {leaveForm.leave_type === 'vacation' ? 'отпускные' : `работодатель (${eDays} дн.)`} =&nbsp;
                      <strong style={{ color: 'var(--success)' }}>{fmt(pay)} KGS</strong>
                      {fDays > 0 && (
                        <span style={{ color: 'var(--text3)' }}>
                          {' '}· ФОМС ({fDays} дн.) = {fmt(Math.round(daily * fDays * 100) / 100)} KGS
                        </span>
                      )}
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAddLeave}
                    disabled={!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date || savingLeave}
                    style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !leaveForm.employee_id ? 0.5 : 1 }}>
                    {savingLeave ? 'Сохранение...' : 'Сохранить и создать проводку'}
                  </button>
                  <button onClick={() => { setShowLeaveForm(false); setLeaveForm(EMPTY_LEAVE) }}
                    style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {/* Таблица отпусков */}
            {leaves.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Записей об отпусках и больничных нет — нажмите «Добавить»
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 110px 160px 50px', padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div>Сотрудник</div>
                  <div style={{ textAlign: 'center' }}>Тип</div>
                  <div style={{ textAlign: 'center' }}>Дней</div>
                  <div style={{ textAlign: 'right' }}>Начислено (KGS)</div>
                  <div style={{ textAlign: 'center' }}>Период</div>
                  <div></div>
                </div>
                {leaves.map(l => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 110px 160px 50px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.employee_name}</div>
                      {l.notes && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {l.leave_type === 'vacation'
                        ? <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>🌴 Отпуск</span>
                        : <span style={{ background: '#fff8e1', color: '#b45309', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>🤒 Больничный</span>
                      }
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{l.days}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--success)' }}>{fmt(l.pay_amount)}</div>
                    <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
                      {fmtDate(l.start_date)} – {fmtDate(l.end_date)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleDeleteLeave(l)} title="Удалить"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--error)', fontFamily: 'inherit' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════ МОДАЛ: Добавить сотрудника ════════ */}
      {showAddEmp && (
        <div onClick={() => { setShowAddEmp(false); setEditEmp(null); setEmpForm(EMPTY_EMP) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{editEmp ? 'Редактировать сотрудника' : 'Новый сотрудник'}</div>
              <button onClick={() => { setShowAddEmp(false); setEditEmp(null); setEmpForm(EMPTY_EMP) }} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
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
              <button onClick={handleSaveEmployee}
                disabled={!empForm.full_name || !empForm.salary || (!editEmp && !empForm.hire_date) || saving}
                style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!empForm.full_name || !empForm.salary) ? 0.5 : 1 }}>
                {saving ? 'Сохранение...' : editEmp ? 'Сохранить изменения' : 'Добавить'}
              </button>
              <button onClick={() => { setShowAddEmp(false); setEditEmp(null); setEmpForm(EMPTY_EMP) }}
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
              {(() => {
                const advance   = selectedRun.advance_total || 0
                const remaining = Math.max(0, (selectedRun.net_total || 0) - advance)
                return (
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Расчёт за {MONTHS[selectedRun.month]} {selectedRun.year}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {selectedRun.entries?.length || 0} сотрудников
                      {' · '}к выдаче <strong style={{ color: 'var(--text2)' }}>{fmt(selectedRun.net_total)} KGS</strong>
                      {advance > 0 && (
                        <>
                          {' · '}аванс <span style={{ color: 'var(--warn)' }}>{fmt(advance)}</span>
                          {' · '}к доплате <strong style={{ color: 'var(--success)' }}>{fmt(remaining)} KGS</strong>
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}
              <button onClick={() => setSelectedRun(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>

            {/* Таблица */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Заголовок */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 85px 72px 72px 72px 85px 80px', padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <div>Сотрудник</div>
                <div style={{ textAlign: 'right' }}>Оклад</div>
                <div style={{ textAlign: 'right' }}>ПН 10%</div>
                <div style={{ textAlign: 'right' }}>ПФР 8%</div>
                <div style={{ textAlign: 'right' }}>ГНПФР 2%</div>
                <div style={{ textAlign: 'right' }}>К выдаче</div>
                <div style={{ textAlign: 'right' }}>СФ р-ль</div>
              </div>
              {(selectedRun.entries || []).map((e, i) => (
                <div key={i}
                  onClick={() => setSlipEntry({ ...e, run: selectedRun })}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 85px 72px 72px 72px 85px 80px', padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.employee_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {e.position || ''}
                      {e.bonus > 0 && <span style={{ marginLeft: 6, color: 'var(--success)', fontWeight: 700 }}>+{fmt(e.bonus)}</span>}
                      {e.deduction > 0 && <span style={{ marginLeft: 6, color: 'var(--error)', fontWeight: 700 }}>−{fmt(e.deduction)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(e.gross)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(e.income_tax)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(e.sf_employee)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--error)' }}>−{fmt(e.gnpfr_employee || 0)}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>{fmt(e.net)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--warn)' }}>{fmt(e.sf_employer)}</div>
                </div>
              ))}
              {/* Итого */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 85px 72px 72px 72px 85px 80px', padding: '10px 16px', background: 'var(--surface2)', fontWeight: 800, fontSize: 12 }}>
                <div style={{ color: 'var(--text3)' }}>ИТОГО</div>
                <div style={{ textAlign: 'right' }}>{fmt(selectedRun.gross_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(selectedRun.income_tax_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(selectedRun.sf_employee_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--error)' }}>−{fmt(selectedRun.gnpfr_total || 0)}</div>
                <div style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt(selectedRun.net_total)}</div>
                <div style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(selectedRun.sf_employer_total)}</div>
              </div>

              {/* Легенда проводок */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--ai-light)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ai)', marginBottom: 6 }}>📒 Проводки начисления</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text2)' }}>
                  <div>Дт 8010 / Кт 3520 — {fmt(selectedRun.gross_total)} (начисление зарплаты)</div>
                  <div>Дт 3520 / Кт 3410 — {fmt(selectedRun.income_tax_total)} (ПН 10%)</div>
                  {selectedRun.sf_employee_total > 0 && <div>Дт 3520 / Кт 3531 — {fmt(selectedRun.sf_employee_total)} (ПФР 8%)</div>}
                  {(selectedRun.gnpfr_total || 0) > 0 && <div>Дт 3520 / Кт 3534 — {fmt(selectedRun.gnpfr_total)} (ГНПФР 2%)</div>}
                  {selectedRun.sf_employer_total > 0 && <div>Дт 8020 / Кт 3530 — {fmt(selectedRun.sf_employer_total)} (СФ работодателя 17.5%)</div>}
                </div>
              </div>

              {/* Блок выплат */}
              <div style={{ padding: '14px 16px', borderTop: '2px solid var(--border)' }}>
                {/* Дата и счёт — общие для обеих кнопок */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>Дата операции</label>
                    <input type="date" value={payForm.pay_date}
                      onChange={e => setPayForm(f => ({ ...f, pay_date: e.target.value }))}
                      style={{ ...SEL, width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>Счёт списания</label>
                    <select value={payForm.account_type}
                      onChange={e => setPayForm(f => ({ ...f, account_type: e.target.value }))}
                      style={{ ...SEL, width: '100%' }}>
                      <option value="bank">🏦 Банк (1210)</option>
                      <option value="cash">💵 Касса (1110)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Выплатить зарплату */}
                  {(() => {
                    const advance   = selectedRun.advance_total || 0
                    const remaining = Math.max(0, (selectedRun.net_total || 0) - advance)
                    return (
                      <button
                        onClick={handlePaySalary}
                        disabled={paying || selectedRun.is_paid}
                        style={{
                          flex: 1, border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 0',
                          fontSize: 12, fontWeight: 700, cursor: selectedRun.is_paid ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          background: selectedRun.is_paid ? 'var(--success-light)' : 'var(--success)',
                          color: selectedRun.is_paid ? 'var(--success)' : '#fff',
                        }}>
                        {selectedRun.is_paid
                          ? `✓ Выплачено ${selectedRun.paid_at ? fmtDate(selectedRun.paid_at.slice(0,10)) : ''}`
                          : advance > 0
                            ? `💸 Выплатить ${fmt(remaining)} KGS (за вычетом аванса ${fmt(advance)})`
                            : `💸 Выплатить ${fmt(selectedRun.net_total)} KGS`}
                      </button>
                    )
                  })()}

                  {/* Оплатить налоги */}
                  <button
                    onClick={handlePayTaxes}
                    disabled={paying || selectedRun.is_tax_paid}
                    style={{
                      flex: 1, border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 0',
                      fontSize: 12, fontWeight: 700, cursor: selectedRun.is_tax_paid ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      background: selectedRun.is_tax_paid ? '#e8f0fe' : 'var(--accent)',
                      color: selectedRun.is_tax_paid ? '#1a56db' : '#fff',
                    }}>
                    {selectedRun.is_tax_paid
                      ? `✓ Налоги оплачены`
                      : `🏛 Оплатить налоги`}
                  </button>
                </div>

                {paying && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>Создаём проводку...</div>}
              </div>

              {/* Аванс */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>💰 Аванс</div>
                {selectedRun.is_advance_paid ? (
                  <div style={{ fontSize: 12, color: 'var(--success)' }}>
                    ✓ Аванс {fmt(selectedRun.advance_total)} KGS выплачен {fmtDate(selectedRun.advance_paid_at)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...LBL, marginBottom: 3 }}>Сумма аванса</label>
                      <input type="number" min="0" placeholder="0"
                        value={advForm.amount}
                        onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))}
                        style={{ ...INP, padding: '6px 8px', fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...LBL, marginBottom: 3 }}>Дата</label>
                      <input type="date" value={advForm.pay_date}
                        onChange={e => setAdvForm(f => ({ ...f, pay_date: e.target.value }))}
                        style={{ ...SEL, width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12 }} />
                    </div>
                    <button onClick={handlePayAdvance}
                      disabled={paying || !advForm.amount}
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      Записать
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Футер */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => navigate(`/company/${companyId}/journal`)}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                📒 Перейти в журнал
              </button>
              <button onClick={handleExportRun}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                📊 Excel
              </button>
              <button onClick={() => handleDeleteRun(selectedRun)}
                style={{ background: 'none', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--error)' }}>
                Удалить расчёт
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ РАСЧЁТНЫЙ ЛИСТОК ════════ */}
      {slipEntry && (
        <div onClick={() => setSlipEntry(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>

            {/* Шапка */}
            <div style={{ background: 'var(--accent)', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Расчётный листок</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {MONTHS[slipEntry.run.month]} {slipEntry.run.year}
                </div>
              </div>
              <button onClick={() => setSlipEntry(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: 0.8 }}>×</button>
            </div>

            {/* Сотрудник */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{slipEntry.employee_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{slipEntry.position || '—'}</div>
            </div>

            {/* Начисления */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Начислено</div>
              {[
                ['Оклад',   slipEntry.gross,      'var(--text)'],
                slipEntry.bonus > 0     ? ['Премия',     slipEntry.bonus,      'var(--success)'] : null,
              ].filter(Boolean).map(([label, val, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color }}>{fmt(val)} KGS</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', borderTop: '1px dashed var(--border)', paddingTop: 6, marginTop: 4 }}>
                <span>Налоговая база</span>
                <span>{fmt(slipEntry.taxable || slipEntry.gross)} KGS</span>
              </div>
            </div>

            {/* Удержания */}
            <div style={{ padding: '0 20px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Удержано</div>
              {[
                ['Подоходный налог (ПН 10%)',  slipEntry.income_tax],
                ['ПФР 8% (сч. 3531)',          slipEntry.sf_employee],
                (slipEntry.gnpfr_employee || 0) > 0
                  ? ['ГНПФР 2% (сч. 3534)', slipEntry.gnpfr_employee]
                  : null,
                slipEntry.deduction > 0 ? ['Удержание', slipEntry.deduction] : null,
              ].filter(Boolean).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--error)' }}>−{fmt(val)} KGS</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                СФ работодателя 17.5%: {fmt(slipEntry.sf_employer)} KGS (за счёт компании)
              </div>
            </div>

            {/* Итого */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              {slipEntry.run?.advance_total > 0 && !slipEntry.run?.is_paid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--text3)' }}>
                  <span>Выплачено авансом</span>
                  <span style={{ fontWeight: 600, color: 'var(--warn)' }}>−{fmt(slipEntry.run.advance_total)} KGS</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>К выдаче</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)' }}>{fmt(slipEntry.net)} KGS</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  )
}
