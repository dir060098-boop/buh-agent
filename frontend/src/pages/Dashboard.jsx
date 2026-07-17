import { useEffect, useState, useCallback } from 'react'
import { companies, posting, auth, deadlines as deadlinesApi } from '../api/client'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast'
import Toast from '../components/Toast'

const EMPTY = { name:'', inn:'', tax_regime:'ОРН (общий режим)' }

const PRIORITY_ICON = { error:'🔴', warn:'⚠️', info:'📅', ok:'✅' }
const PRIORITY_COLOR = {
  error: 'var(--error)',
  warn:  'var(--warn)',
  info:  'var(--accent)',
  ok:    'var(--success)'
}
const PRIORITY_BG = {
  error: 'var(--error-light)',
  warn:  'var(--warn-light)',
  info:  'var(--accent-light)',
  ok:    'var(--success-light)'
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)
  const [innConfirm, setInnConfirm] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [postingCompany, setPostingCompany] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')
  const navigate = useNavigate()
  const { toasts, showToast, removeToast } = useToast()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const [calendar, setCalendar] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      companies.summary().then(r => setSummary(r.data)).catch(() => {}),
      auth.me().then(r => setUser(r.data)).catch(() => {}),
      deadlinesApi.calendarAll(30).then(r => setCalendar(r.data)).catch(() => {})
    ])
    setLoading(false)
  }, [])

  async function handleCalendarDone(id) {
    try {
      await deadlinesApi.done(id)
      const r = await deadlinesApi.calendarAll(30)
      setCalendar(r.data)
    } catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
  }

  useEffect(() => { load() }, [load])

  // Быстрая разноска прямо с дашборда
  async function handlePostAll(companyId) {
    setPostingCompany(companyId)
    try {
      await posting.autoAll(companyId)
      await load()
    } catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
    finally { setPostingCompany(null) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.name.trim()) { setCreateError('Введите название'); return }
    setCreating(true); setCreateError('')
    try {
      await companies.create({ name: createForm.name.trim(), inn: createForm.inn.trim() || null, tax_regime: createForm.tax_regime })
      await load(); setShowCreate(false); setCreateForm(EMPTY)
    } catch(e) { setCreateError(e.response?.data?.detail || 'Ошибка') }
    finally { setCreating(false) }
  }

  function openEdit(c) {
    setEditId(c.id)
    setEditForm({ name: c.name, inn: c.inn || '', tax_regime: c.tax_regime || 'ОРН (общий режим)' })
    setEditError(''); setInnConfirm(false)
  }

  async function handleEdit(e, confirmed = false) {
    e?.preventDefault()
    setEditing(true); setEditError('')
    try {
      const orig = summary?.companies?.find(c => c.id === editId)
      const innChanged = editForm.inn.trim() !== (orig?.inn || '')
      await companies.update(editId, {
        name: editForm.name.trim(), inn: editForm.inn.trim() || null,
        tax_regime: editForm.tax_regime, inn_confirmed: confirmed || !innChanged
      })
      await load(); setEditId(null)
    } catch(e) {
      const d = e.response?.data?.detail || ''
      if (d === 'INN_CONFIRM_REQUIRED') { setInnConfirm(true); setEditError('ИНН изменён — подтвердите') }
      else setEditError(d || 'Ошибка')
    } finally { setEditing(false) }
  }

  async function handleDelete() {
    setDeleting(true); setDeleteError('')
    try { await companies.delete(deleteId); await load(); setDeleteId(null) }
    catch(e) { setDeleteError(e.response?.data?.detail || 'Ошибка') }
    finally { setDeleting(false) }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер'
  const list = summary?.companies || []
  const feed = summary?.feed || []
  const canDelete = list.find(x => x.id === deleteId)

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* Шапка */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'var(--shadow-sm)' }}>
        <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', letterSpacing:'-0.3px' }}>
          Бух<span style={{ color:'var(--accent)' }}>Агент</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => navigate('/help')}
            title="Справка: как работать с приложением"
            style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 12px', fontSize:13, fontWeight:700, color:'var(--accent)', cursor:'pointer', fontFamily:'inherit' }}>
            ❓ Справка
          </button>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 10px', fontSize:16, color:'var(--text2)', cursor:'pointer' }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {user && <span style={{ fontSize:13, color:'var(--text2)' }}>{user.full_name || user.email}</span>}
          <button onClick={() => { localStorage.removeItem('token'); navigate('/login') }}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 12px', color:'var(--text2)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Выйти
          </button>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'24px 20px' }}>

        {/* Приветствие + глобальные счётчики */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:'var(--text)', margin:'0 0 4px' }}>{greeting} 👋</h1>
            <p style={{ margin:0, color:'var(--text3)', fontSize:13 }}>{user?.full_name || 'Бухгалтер'} · {list.length} {list.length === 1 ? 'компания' : list.length < 5 ? 'компании' : 'компаний'}</p>
          </div>

          {/* Глобальные счётчики */}
          {summary && (summary.total_pending > 0 || summary.total_review > 0 || summary.total_overdue > 0) && (
            <div style={{ display:'flex', gap:10 }}>
              {summary.total_pending > 0 && (
                <div style={{ background:'var(--warn-light)', border:'1px solid var(--warn)', borderRadius:'var(--radius)', padding:'8px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--warn)' }}>{summary.total_pending}</div>
                  <div style={{ fontSize:10, color:'var(--warn-text)', fontWeight:700, textTransform:'uppercase' }}>Ожидают</div>
                </div>
              )}
              {summary.total_review > 0 && (
                <div style={{ background:'var(--warn-light)', border:'1px solid var(--warn)', borderRadius:'var(--radius)', padding:'8px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--warn)' }}>{summary.total_review}</div>
                  <div style={{ fontSize:10, color:'var(--warn-text)', fontWeight:700, textTransform:'uppercase' }}>Проверка</div>
                </div>
              )}
              {summary.total_overdue > 0 && (
                <div style={{ background:'var(--error-light)', border:'1px solid var(--error)', borderRadius:'var(--radius)', padding:'8px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--error)' }}>{summary.total_overdue}</div>
                  <div style={{ fontSize:10, color:'var(--error-text)', fontWeight:700, textTransform:'uppercase' }}>Просрочено</div>
                </div>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Загрузка...</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start' }}>

            {/* Левая колонка — компании */}
            <div>
              {list.length === 0 && !showCreate && (
                <div style={{ textAlign:'center', padding:'48px 24px', background:'var(--surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)', marginBottom:12 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
                  <p style={{ fontWeight:700, margin:'0 0 6px', color:'var(--text)' }}>Компаний пока нет</p>
                  <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 20px' }}>Добавьте первую компанию чтобы начать работу</p>
                  <button onClick={() => setShowCreate(true)}
                    style={{ background:'var(--accent)', color:'#fff', border:'none', padding:'11px 24px', borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'var(--shadow)' }}>
                    + Добавить компанию
                  </button>
                </div>
              )}

              {list.map(c => (
                <div key={c.id} style={{ background:'var(--surface)', border:`1.5px solid ${c.status === 'error' ? 'var(--error)' : c.status === 'warn' ? 'var(--warn)' : 'var(--border)'}`, borderRadius:'var(--radius-lg)', padding:'14px 16px', marginBottom:10, boxShadow:'var(--shadow-sm)' }}>

                  {/* Строка 1: название + статус + кнопки правки/удаления */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div onClick={() => navigate('/company/' + c.id)} style={{ flex:1, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:36, height:36, borderRadius:'var(--radius-sm)', background:'var(--accent-light)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🏢</div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{c.name}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>
                          {c.inn && `ИНН ${c.inn}`}{c.inn && c.tax_regime && ' · '}{c.tax_regime}
                        </div>
                      </div>
                    </div>

                    {/* Статус */}
                    <div style={{ fontSize:11, fontWeight:700, color:PRIORITY_COLOR[c.status], background:PRIORITY_BG[c.status], padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap', border:`1px solid ${PRIORITY_COLOR[c.status]}33` }}>
                      {PRIORITY_ICON[c.status]} {c.status_text}
                    </div>

                    {/* Правка/удаление */}
                    <button onClick={() => openEdit(c)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 9px', color:'var(--text2)', fontSize:13, cursor:'pointer' }}>✏️</button>
                    <button onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 9px', color:c.can_delete?'var(--error)':'var(--text4)', fontSize:13, cursor:c.can_delete?'pointer':'not-allowed', opacity:c.can_delete?1:0.4 }}>🗑️</button>
                  </div>

                  {/* Строка 2: счётчики */}
                  <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                    <Chip label="Документов" value={c.doc_count} color="var(--text3)" />
                    {c.pending_docs > 0 && <Chip label="Ожидают разноски" value={c.pending_docs} color="var(--warn)" bg="var(--warn-light)" />}
                    {c.needs_review > 0 && <Chip label="На проверке" value={c.needs_review} color="var(--warn)" bg="var(--warn-light)" />}
                    <Chip label="Проводок" value={c.journal_count} color="var(--text3)" />
                    {c.overdue_deadlines > 0 && <Chip label="Просрочено" value={c.overdue_deadlines} color="var(--error)" bg="var(--error-light)" />}
                    {c.upcoming_deadlines > 0 && <Chip label="Скоро дедлайн" value={c.upcoming_deadlines} color="var(--accent)" bg="var(--accent-light)" />}
                  </div>

                  {/* Строка 3: быстрые действия */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <QuickBtn onClick={() => navigate(`/company/${c.id}/scanner`)} label="📷 Сканировать" />
                    {c.pending_docs > 0 && (
                      <QuickBtn
                        onClick={() => handlePostAll(c.id)}
                        label={postingCompany === c.id ? '⏳ Разношу...' : `⚡ Разнести (${c.pending_docs})`}
                        primary
                        disabled={postingCompany === c.id}
                      />
                    )}
                    <QuickBtn onClick={() => navigate(`/company/${c.id}/journal`)} label="📒 Журнал" />
                    <QuickBtn onClick={() => navigate(`/company/${c.id}`)} label="→ Открыть" />
                  </div>
                </div>
              ))}

              {!showCreate && (
                <button onClick={() => { setShowCreate(true); setCreateError('') }}
                  style={{ width:'100%', background:'none', border:'1.5px dashed var(--border2)', borderRadius:'var(--radius-lg)', padding:'13px', color:'var(--text3)', cursor:'pointer', fontSize:13, fontWeight:600, marginTop:4, fontFamily:'Manrope, sans-serif' }}>
                  + Добавить компанию
                </button>
              )}

              {showCreate && (
                <CompanyForm title="Новая компания" form={createForm} setForm={setCreateForm}
                  error={createError} saving={creating} onSubmit={handleCreate}
                  onCancel={() => { setShowCreate(false); setCreateError('') }}/>
              )}

              {editId && (
                <CompanyForm title="Редактировать компанию" form={editForm} setForm={setEditForm}
                  error={editError} saving={editing} isEdit innConfirmPending={innConfirm}
                  onSubmit={handleEdit} onConfirmInn={() => handleEdit(null, true)}
                  onCancel={() => { setEditId(null); setInnConfirm(false) }}/>
              )}
            </div>

            {/* Правая колонка — лента событий */}
            <div style={{ position:'sticky', top:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
                🔔 Лента событий
              </div>

              {feed.length === 0 ? (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'24px 16px', textAlign:'center', boxShadow:'var(--shadow-sm)' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:4 }}>Всё в порядке</div>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>Нет срочных задач</div>
                </div>
              ) : (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
                  {feed.map((item, i) => (
                    <div key={i}
                      style={{ padding:'12px 14px', borderBottom: i < feed.length - 1 ? '1px solid var(--border)' : 'none', background:'var(--surface)', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                      onClick={() => {
                        if (item.action === 'journal') navigate(`/company/${item.company_id}/journal`)
                        else if (item.action === 'post_all') handlePostAll(item.company_id)
                        else if (item.action === 'deadlines') navigate(`/company/${item.company_id}/deadlines`)
                      }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{PRIORITY_ICON[item.priority]}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:PRIORITY_COLOR[item.priority], marginBottom:2 }}>
                            {item.company_name}
                          </div>
                          <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.4 }}>
                            {item.message}
                          </div>
                        </div>
                        <span style={{ fontSize:11, color:'var(--accent)', fontWeight:700, flexShrink:0, marginTop:1 }}>
                          {item.action_label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Сквозной календарь по всем компаниям */}
              {calendar && calendar.items.length > 0 && (
                <>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', margin:'18px 0 10px', display:'flex', alignItems:'center', gap:8 }}>
                    📅 Сроки — все компании
                    {calendar.overdue_count > 0 && (
                      <span style={{ background:'var(--error-light)', color:'var(--error)', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:800, textTransform:'none', letterSpacing:0 }}>
                        {calendar.overdue_count} просрочено
                      </span>
                    )}
                  </div>
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow-sm)', maxHeight:380, overflowY:'auto' }}>
                    {calendar.items.map((d, i) => {
                      const dateColor = d.status === 'overdue' || d.status === 'due_today' ? 'var(--error)'
                        : d.status === 'remind' ? 'var(--warn)' : 'var(--text3)'
                      const [y, m, day] = (d.deadline_date || '').split('-')
                      return (
                        <div key={d.id}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom: i < calendar.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ flexShrink:0, width:44, textAlign:'center', fontWeight:800, fontSize:13, color:dateColor, fontVariantNumeric:'tabular-nums' }}>
                            {day}.{m}
                          </div>
                          <div style={{ flex:1, minWidth:0, cursor:'pointer' }}
                            onClick={() => navigate(`/company/${d.company_id}/deadlines`)}>
                            <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {d.company_name}
                            </div>
                            <div style={{ fontSize:12, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {d.icon} {d.title}
                            </div>
                          </div>
                          <button onClick={() => handleCalendarDone(d.id)}
                            title="Отметить сданным"
                            style={{ flexShrink:0, background:'var(--success-light)', color:'var(--success)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 9px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                            ✓
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Подсказка */}
              <div style={{ fontSize:11, color:'var(--text4)', textAlign:'center', marginTop:10, lineHeight:1.5 }}>
                Нажмите на событие для быстрого перехода
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Диалог удаления */}
      {deleteId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(30,42,62,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:24 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:24, maxWidth:400, width:'100%', boxShadow:'var(--shadow-lg)' }}>
            {canDelete?.can_delete ? (
              <>
                <div style={{ fontSize:28, marginBottom:12 }}>⚠️</div>
                <h3 style={{ margin:'0 0 8px', color:'var(--text)' }}>Удалить компанию?</h3>
                <p style={{ margin:'0 0 20px', fontSize:13, color:'var(--text2)' }}>«{canDelete?.name}» будет удалена без возможности восстановления.</p>
                {deleteError && <div style={{ background:'var(--error-light)', color:'var(--error)', fontSize:13, padding:'10px 12px', borderRadius:'var(--radius-sm)', marginBottom:14 }}>{deleteError}</div>}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={handleDelete} disabled={deleting}
                    style={{ flex:1, background:'var(--error)', color:'#fff', border:'none', padding:11, borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Manrope, sans-serif' }}>
                    {deleting ? 'Удаляю...' : 'Удалить'}
                  </button>
                  <button onClick={() => setDeleteId(null)}
                    style={{ flex:1, background:'none', border:'1px solid var(--border)', color:'var(--text2)', padding:11, borderRadius:'var(--radius)', fontSize:14, cursor:'pointer', fontFamily:'Manrope, sans-serif' }}>
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:28, marginBottom:12 }}>🚫</div>
                <h3 style={{ margin:'0 0 8px', color:'var(--text)' }}>Нельзя удалить</h3>
                <p style={{ margin:'0 0 6px', fontSize:13, color:'var(--text2)' }}>У «{canDelete?.name}» есть данные:</p>
                <ul style={{ margin:'0 0 20px', paddingLeft:20, fontSize:13, color:'var(--text2)' }}>
                  {canDelete?.doc_count > 0 && <li>{canDelete.doc_count} документов</li>}
                  {canDelete?.journal_count > 0 && <li>{canDelete.journal_count} проводок</li>}
                </ul>
                <button onClick={() => setDeleteId(null)}
                  style={{ width:'100%', background:'var(--accent)', color:'#fff', border:'none', padding:11, borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Manrope, sans-serif' }}>
                  Понятно
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Маленькие компоненты ──────────────────────────────────

function Chip({ label, value, color, bg }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, background: bg || 'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 10px', fontSize:11 }}>
      <span style={{ fontWeight:800, color: color || 'var(--text)', fontVariantNumeric:'tabular-nums' }}>{value}</span>
      <span style={{ color:'var(--text3)' }}>{label}</span>
    </div>
  )
}

function QuickBtn({ onClick, label, primary, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: primary ? 'var(--accent)' : 'var(--surface2)', color: primary ? '#fff' : 'var(--text2)', border: primary ? 'none' : '1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily:'Manrope, sans-serif', boxShadow: primary ? 'var(--shadow-sm)' : 'none', opacity: disabled ? 0.6 : 1 }}>
      {label}
    </button>
  )
}

function CompanyForm({ title, form, setForm, error, saving, onSubmit, onCancel, isEdit, innConfirmPending, onConfirmInn }) {
  const LBL = { display:'block', fontSize:11, fontWeight:700, color:'var(--text2)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }
  const INP = { width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'Manrope, sans-serif', boxSizing:'border-box', outline:'none' }
  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid var(--accent)', borderRadius:'var(--radius-lg)', padding:20, marginTop:12, boxShadow:'var(--shadow)' }}>
      <h3 style={{ margin:'0 0 18px', fontSize:15, fontWeight:800, color:'var(--text)' }}>{title}</h3>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom:14 }}>
          <label style={LBL}>Название *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ОсОО Ромашка" autoFocus style={INP}/>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={LBL}>{isEdit ? 'ИНН (изменение требует подтверждения)' : 'ИНН'}</label>
          <input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} placeholder="12345678901234" style={INP}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={LBL}>Налоговый режим</label>
          <select value={form.tax_regime} onChange={e => setForm(f => ({ ...f, tax_regime: e.target.value }))} style={INP}>
            {['ОРН (общий режим)', 'Упрощённая система', 'Патент', 'Плательщик НДС'].map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {error && <div style={{ background:'var(--error-light)', color:'var(--error)', fontSize:13, padding:'10px 12px', borderRadius:'var(--radius-sm)', marginBottom:14 }}>{error}</div>}
        {innConfirmPending && (
          <div style={{ background:'var(--warn-light)', border:'1px solid var(--warn)', borderRadius:'var(--radius-sm)', padding:'12px 14px', marginBottom:14 }}>
            <p style={{ margin:'0 0 10px', fontSize:13, color:'var(--warn-text)' }}>⚠️ Вы меняете ИНН. Подтвердите изменение.</p>
            <button type="button" onClick={onConfirmInn}
              style={{ background:'var(--warn)', color:'#fff', border:'none', padding:'8px 16px', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Manrope, sans-serif' }}>
              Да, изменить ИНН
            </button>
          </div>
        )}
        <div style={{ display:'flex', gap:10 }}>
          <button type="submit" disabled={saving}
            style={{ flex:1, background: saving ? 'var(--text3)' : 'var(--accent)', color:'#fff', border:'none', padding:11, borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'Manrope, sans-serif', boxShadow:'var(--shadow)' }}>
            {saving ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Добавить'}
          </button>
          <button type="button" onClick={onCancel}
            style={{ flex:1, background:'none', color:'var(--text2)', border:'1px solid var(--border)', padding:11, borderRadius:'var(--radius)', fontSize:14, cursor:'pointer', fontFamily:'Manrope, sans-serif' }}>
            Отмена
          </button>
        </div>
      </form>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
