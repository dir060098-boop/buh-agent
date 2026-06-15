import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { deadlines as deadlinesApi, api } from '../api/client'
import NavBar from '../components/NavBar'
import { useToast } from '../hooks/useToast'
import Toast from '../components/Toast'

// ── Статусы ───────────────────────────────────────────────
const STATUS = {
  scheduled: { label:'Запланирован', color:'var(--text4)',    bg:'var(--surface2)',      border:'var(--border)',  icon:'📅' },
  remind:    { label:'Напоминание',  color:'var(--warn)',     bg:'var(--warn-light)',    border:'var(--warn)',    icon:'⚠️' },
  due_today: { label:'Сегодня!',     color:'var(--error)',    bg:'var(--error-light)',   border:'var(--error)',   icon:'🔴' },
  overdue:   { label:'Просрочен',    color:'var(--error)',    bg:'var(--error-light)',   border:'var(--error)',   icon:'🔴' },
  done:      { label:'Сдан',         color:'var(--success)',  bg:'var(--success-light)', border:'var(--success)', icon:'✅' },
}

const TAX_LABELS = {
  nds:'НДС', sales_tax:'Налог с продаж', income_tax:'Подоходный налог',
  social_fund:'Социальный фонд', unified_tax:'Единый налог',
  patent:'Патент', annual:'Годовая декларация', other:'Прочее'
}

const FILTER_TABS = [
  ['all','Все'],['overdue','Просрочены'],['remind','Напоминания'],
  ['due_today','Сегодня'],['scheduled','Запланированы'],['done','Сданы']
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  return diff
}

function daysLabel(days) {
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  if (days < 0) return `${Math.abs(days)} дн. назад`
  return `через ${days} дн.`
}

export default function Deadlines() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const [deadlines, setDeadlines] = useState([])
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [doneModal, setDoneModal] = useState(null) // deadline объект
  const [doneNote, setDoneNote] = useState('')
  const [createForm, setCreateForm] = useState({
    title:'', tax_type:'other', deadline_date:'', remind_date:'', notes:''
  })
  const [creating, setCreating] = useState(false)
  const { toasts, showToast, removeToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dlRes, coRes] = await Promise.all([
        deadlinesApi.list(companyId),
        api.get(`/api/companies/${companyId}`)
      ])
      setDeadlines(dlRes.data)
      setCompany(coRes.data)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    setGenerating(true)
    try {
      await api.post(`/api/deadlines/generate/${companyId}`)
      await load()
    } catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
    finally { setGenerating(false) }
  }

  async function handleDone(d) {
    try {
      await api.patch(`/api/deadlines/${d.id}/done`, { notes: doneNote })
      setDoneModal(null); setDoneNote('')
      await load()
    } catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
  }

  async function handleReopen(id) {
    try { await api.patch(`/api/deadlines/${id}/reopen`); await load() }
    catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить дедлайн?')) return
    try { await api.delete(`/api/deadlines/${id}`); await load() }
    catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.title || !createForm.deadline_date) return
    setCreating(true)
    try {
      await deadlinesApi.create(companyId, createForm)
      setShowCreate(false)
      setCreateForm({ title:'', tax_type:'other', deadline_date:'', remind_date:'', notes:'' })
      await load()
    } catch(e) { showToast(e.response?.data?.detail || e.message, 'error') }
    finally { setCreating(false) }
  }

  // Счётчики для табов
  const counts = deadlines.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1
    return acc
  }, {})

  // Фильтрация
  const filtered = filter === 'all' ? deadlines : deadlines.filter(d => d.status === filter)

  // Группировка по месяцам для удобного отображения
  const grouped = filtered.reduce((acc, d) => {
    const key = d.deadline_date?.slice(0, 7) || 'без даты'
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  // Активные напоминания для баннера
  const activeAlerts = deadlines.filter(d => ['remind','due_today','overdue'].includes(d.status))

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', fontFamily:'Manrope, sans-serif'}}>

      <NavBar companyId={companyId} current="deadlines" />

      {/* Шапка модуля */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, boxShadow:'var(--shadow-sm)'}}>
        <div style={{fontWeight:800, fontSize:15, color:'var(--text)'}}>📅 Дедлайны и налоги</div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>setShowCreate(true)}
            style={{background:'var(--surface2)', color:'var(--text2)', border:'1px solid var(--border)', padding:'7px 14px', borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
            + Добавить
          </button>
          <button onClick={handleGenerate} disabled={generating}
            style={{background:generating?'var(--text3)':'var(--accent)', color:'#fff', border:'none', padding:'7px 14px', borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:700, cursor:generating?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:'var(--shadow-sm)'}}>
            {generating ? '⏳ Генерирую...' : '⚡ Авто-генерация'}
          </button>
        </div>
      </div>

      <div style={{maxWidth:860, margin:'0 auto', padding:'16px 20px 40px'}}>

        {/* Баннер активных напоминаний */}
        {activeAlerts.length > 0 && (
          <div style={{background:'var(--error-light)', border:'1px solid var(--error)', borderRadius:'var(--radius-lg)', padding:'14px 18px', marginBottom:16}}>
            <div style={{fontWeight:800, fontSize:14, color:'var(--error)', marginBottom:8}}>
              🔔 {activeAlerts.length} {activeAlerts.length===1?'дедлайн требует':'дедлайнов требуют'} внимания
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {activeAlerts.slice(0, 4).map(d => (
                <div key={d.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{fontSize:13, color:'var(--text)'}}>
                    {STATUS[d.status]?.icon} <strong>{d.title}</strong>
                    <span style={{fontSize:11, color:'var(--text3)', marginLeft:8}}>
                      {d.status==='overdue' ? `просрочен ${daysLabel(daysUntil(d.deadline_date))}` : `срок ${d.deadline_date}`}
                    </span>
                  </div>
                  <button onClick={()=>{setDoneModal(d);setDoneNote('')}}
                    style={{background:'var(--success)', color:'#fff', border:'none', padding:'4px 12px', borderRadius:'var(--radius-sm)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0}}>
                    ✅ Отчёт сдан
                  </button>
                </div>
              ))}
              {activeAlerts.length > 4 && (
                <div style={{fontSize:12, color:'var(--text3)'}}>...ещё {activeAlerts.length - 4}</div>
              )}
            </div>
          </div>
        )}

        {/* Счётчики */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16}}>
          {[
            {key:'overdue',  label:'Просрочены',   color:'var(--error)'},
            {key:'due_today',label:'Сегодня',       color:'var(--error)'},
            {key:'remind',   label:'Напоминания',   color:'var(--warn)'},
            {key:'scheduled',label:'Запланированы', color:'var(--text3)'},
            {key:'done',     label:'Сданы',         color:'var(--success)'},
          ].map(s => (
            <div key={s.key} onClick={()=>setFilter(s.key)} style={{background:'var(--surface)', borderRadius:'var(--radius)', padding:'12px', border:`1px solid ${filter===s.key?s.color:'var(--border)'}`, cursor:'pointer', textAlign:'center', boxShadow:'var(--shadow-sm)'}}>
              <div style={{fontSize:20, fontWeight:800, color:s.color, fontVariantNumeric:'tabular-nums'}}>{counts[s.key]||0}</div>
              <div style={{fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Фильтр табы */}
        <div style={{display:'flex', gap:6, marginBottom:16, flexWrap:'wrap'}}>
          {FILTER_TABS.map(([key,label]) => (
            <button key={key} onClick={()=>setFilter(key)}
              style={{padding:'5px 14px', borderRadius:20, border:`1.5px solid ${filter===key?'var(--accent)':'var(--border)'}`, background:filter===key?'var(--accent-light)':'var(--surface)', color:filter===key?'var(--accent-text)':'var(--text2)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
              {label} {key!=='all'&&counts[key]?`(${counts[key]})`:''}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{textAlign:'center', padding:40, color:'var(--text3)'}}>Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:'center', padding:48, background:'var(--surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)'}}>
            <div style={{fontSize:36, marginBottom:12}}>📭</div>
            <p style={{fontWeight:700, margin:'0 0 8px', color:'var(--text)'}}>
              {filter==='all' ? 'Дедлайнов пока нет' : `Нет дедлайнов со статусом "${FILTER_TABS.find(t=>t[0]===filter)?.[1]}"`}
            </p>
            {filter==='all' && (
              <p style={{fontSize:13, color:'var(--text3)', margin:'0 0 20px'}}>
                Нажмите «Авто-генерация» чтобы создать календарь отчётности на год
              </p>
            )}
            {filter==='all' && (
              <button onClick={handleGenerate} disabled={generating}
                style={{background:'var(--accent)', color:'#fff', border:'none', padding:'10px 24px', borderRadius:'var(--radius)', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:13, boxShadow:'var(--shadow)'}}>
                ⚡ Авто-генерация
              </button>
            )}
          </div>
        ) : (
          // Сгруппированный список
          Object.keys(grouped).sort().map(monthKey => (
            <div key={monthKey} style={{marginBottom:20}}>
              {/* Заголовок месяца */}
              <div style={{fontSize:12, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, paddingLeft:4}}>
                {monthKey === 'без даты' ? 'Без даты' : new Date(monthKey + '-01').toLocaleDateString('ru-RU', {month:'long', year:'numeric'})}
              </div>

              <div style={{background:'var(--surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
                {grouped[monthKey].map((d, i) => {
                  const s = STATUS[d.status] || STATUS.scheduled
                  const days = daysUntil(d.deadline_date)
                  return (
                    <div key={d.id} style={{
                      display:'grid', gridTemplateColumns:'auto 1fr auto',
                      gap:12, padding:'12px 16px',
                      borderBottom: i < grouped[monthKey].length-1 ? '1px solid var(--border)' : 'none',
                      background: d.status==='done' ? 'transparent' : d.status==='overdue'||d.status==='due_today' ? 'var(--error-light)' : d.status==='remind' ? 'var(--warn-light)' : 'transparent',
                      alignItems:'center'
                    }}>

                      {/* Иконка и статус */}
                      <div style={{textAlign:'center', minWidth:32}}>
                        <div style={{fontSize:18}}>{d.icon}</div>
                        <div style={{fontSize:9, color:s.color, fontWeight:700, marginTop:2}}>{s.icon}</div>
                      </div>

                      {/* Основная информация */}
                      <div>
                        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                          <span style={{fontWeight:700, fontSize:14, color: d.is_done ? 'var(--text3)' : 'var(--text)', textDecoration: d.is_done ? 'line-through' : 'none'}}>
                            {d.title}
                          </span>
                          <span style={{fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:s.bg, color:s.color, border:`1px solid ${s.border}33`}}>
                            {s.label}
                          </span>
                        </div>
                        <div style={{display:'flex', gap:12, marginTop:4, flexWrap:'wrap'}}>
                          {d.remind_date && !d.is_done && (
                            <span style={{fontSize:11, color:'var(--text3)'}}>
                              🔔 Напоминание: {d.remind_date}
                            </span>
                          )}
                          <span style={{fontSize:11, color: d.status==='overdue'?'var(--error)': d.status==='due_today'?'var(--error)': d.status==='remind'?'var(--warn)':'var(--text3)', fontWeight: ['overdue','due_today'].includes(d.status)?700:400}}>
                            📅 Срок: {d.deadline_date} {days !== null && !d.is_done && `(${daysLabel(days)})`}
                          </span>
                          {d.is_done && d.done_at && (
                            <span style={{fontSize:11, color:'var(--success)'}}>✅ Сдано {d.done_at} · {d.done_by}</span>
                          )}
                        </div>
                        {d.notes && (
                          <div style={{fontSize:11, color:'var(--ai-text)', marginTop:3, fontStyle:'italic'}}>{d.notes}</div>
                        )}
                      </div>

                      {/* Действия */}
                      <div style={{display:'flex', gap:6, flexShrink:0}}>
                        {/* Кнопка "Отчёт сдан" — только когда пришло время сдавать */}
                        {d.status === 'done' ? (
                          <button onClick={()=>handleReopen(d.id)}
                            style={{background:'none', color:'var(--text3)', border:'1px solid var(--border)', padding:'5px 10px', borderRadius:'var(--radius-sm)', fontSize:11, cursor:'pointer', fontFamily:'inherit'}}>
                            ↩ Переоткрыть
                          </button>
                        ) : ['remind','due_today','overdue'].includes(d.status) ? (
                          <button onClick={()=>{setDoneModal(d);setDoneNote('')}}
                            style={{background:'var(--success)', color:'#fff', border:'none', padding:'6px 12px', borderRadius:'var(--radius-sm)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', boxShadow:'var(--shadow-sm)'}}>
                            ✅ Отчёт сдан
                          </button>
                        ) : null}
                        {!d.auto_generated && (
                          <button onClick={()=>handleDelete(d.id)}
                            style={{background:'none', color:'var(--error)', border:'1px solid var(--error)33', padding:'5px 8px', borderRadius:'var(--radius-sm)', fontSize:11, cursor:'pointer', fontFamily:'inherit'}}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Модал "Отметить сданным" */}
      {doneModal && (
        <div style={{position:'fixed', inset:0, background:'rgba(30,42,62,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:24, maxWidth:420, width:'100%', boxShadow:'var(--shadow-lg)'}}>
            <div style={{fontSize:28, marginBottom:8}}>✅</div>
            <div style={{fontWeight:800, fontSize:15, color:'var(--text)', marginBottom:4}}>{doneModal.title}</div>
            <div style={{fontSize:13, color:'var(--text3)', marginBottom:16}}>Срок: {doneModal.deadline_date}</div>
            <div style={{marginBottom:16}}>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--text2)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em'}}>
                Комментарий (необязательно)
              </label>
              <input value={doneNote} onChange={e=>setDoneNote(e.target.value)}
                placeholder="Например: отправлено через кабинет ГНС"
                style={{width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box'}}/>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>handleDone(doneModal)}
                style={{flex:1, background:'var(--success)', color:'#fff', border:'none', padding:12, borderRadius:'var(--radius)', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                ✅ Подтвердить — отчёт сдан
              </button>
              <button onClick={()=>setDoneModal(null)}
                style={{flex:1, background:'none', color:'var(--text2)', border:'1px solid var(--border)', padding:12, borderRadius:'var(--radius)', cursor:'pointer', fontFamily:'inherit'}}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал создания вручную */}
      {showCreate && (
        <div style={{position:'fixed', inset:0, background:'rgba(30,42,62,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
          <div style={{background:'var(--surface)', border:'1.5px solid var(--accent)', borderRadius:'var(--radius-lg)', padding:24, maxWidth:480, width:'100%', boxShadow:'var(--shadow-lg)'}}>
            <div style={{fontWeight:800, fontSize:15, color:'var(--text)', marginBottom:18}}>+ Новый дедлайн</div>
            <form onSubmit={handleCreate}>
              {[
                {label:'Название *', key:'title', type:'text', placeholder:'НДС за июнь 2026'},
                {label:'Тип налога', key:'tax_type', type:'select'},
                {label:'Дата напоминания (15-е число)', key:'remind_date', type:'date'},
                {label:'Срок сдачи * (20-е число)', key:'deadline_date', type:'date'},
                {label:'Комментарий', key:'notes', type:'text', placeholder:''},
              ].map(f => (
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--text2)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em'}}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={createForm[f.key]} onChange={e=>setCreateForm(p=>({...p,[f.key]:e.target.value}))}
                      style={{width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none'}}>
                      {Object.entries(TAX_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} value={createForm[f.key]} onChange={e=>setCreateForm(p=>({...p,[f.key]:e.target.value}))}
                      placeholder={f.placeholder}
                      style={{width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box'}}/>
                  )}
                </div>
              ))}
              <div style={{display:'flex', gap:10, marginTop:4}}>
                <button type="submit" disabled={creating}
                  style={{flex:1, background:creating?'var(--text3)':'var(--accent)', color:'#fff', border:'none', padding:11, borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:creating?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                  {creating ? 'Сохраняю...' : 'Добавить'}
                </button>
                <button type="button" onClick={()=>setShowCreate(false)}
                  style={{flex:1, background:'none', color:'var(--text2)', border:'1px solid var(--border)', padding:11, borderRadius:'var(--radius)', cursor:'pointer', fontFamily:'inherit'}}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
