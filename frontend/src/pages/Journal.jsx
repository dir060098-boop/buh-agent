import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { posting } from '../api/client'

const S_LABEL = { posted: 'Проведено', needs_review: 'На проверке', rejected: 'Отклонено' }
const S_COLOR = { posted: '#10B981', needs_review: '#F59E0B', rejected: '#EF4444' }
const S_BG    = { posted: '#D1FAE522', needs_review: '#FEF3C722', rejected: '#FEE2E222' }

const DOC_TYPE_LABEL = {
  invoice:'Счёт', act:'Акт', esf:'ЭСФ', ttn:'Накладная',
  contract:'Договор', receipt:'Квитанция', payment_order:'Платёжка',
  bank_statement:'Выписка', payroll:'Зарплата', other:'Прочее'
}

function fmt(n, cur) {
  if (n == null) return '—'
  const s = Number(n).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})
  return cur ? `${s} ${cur}` : s
}

// ── МОДАЛЬНОЕ ОКНО ПРОВЕРКИ ──────────────────────────────
function ReviewModal({ entry, onClose, onDone }) {
  const [mode, setMode] = useState('view')   // view | correct | reject
  const [debit, setDebit] = useState(entry.debit_account || '')
  const [credit, setCredit] = useState(entry.credit_account || '')
  const [description, setDescription] = useState(entry.description || '')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState([])
  const [acctSearch, setAcctSearch] = useState('')

  useEffect(() => {
    posting.chartOfAccounts(3).then(r => setAccounts(r.data)).catch(() => {})
  }, [])

  async function act(action) {
    setSaving(true); setError('')
    try {
      const payload = { action }
      if (action === 'correct') {
        payload.debit_account = debit
        payload.credit_account = credit
        payload.description = description
      }
      if (action === 'reject') payload.comment = comment
      await posting.review(entry.id, payload)
      onDone()
    } catch(e) {
      setError(e.response?.data?.detail || 'Ошибка')
    } finally { setSaving(false) }
  }

  const filteredAccounts = accounts.filter(a =>
    !acctSearch || a.code.includes(acctSearch) || a.name.toLowerCase().includes(acctSearch.toLowerCase())
  ).slice(0, 30)

  return (
    <div style={{ position:'fixed', inset:0, background:'#000c', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#181c27', border:'1px solid #2a3050', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>

        {/* Шапка */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #2a3050', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#e8eaf6' }}>
              {entry.doc_number ? `№${entry.doc_number}` : 'Документ'} — Проверка проводки
            </div>
            <div style={{ fontSize:12, color:'#8892b0', marginTop:3 }}>
              {entry.counterparty || '—'} · {entry.entry_date}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8892b0', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>

        <div style={{ padding:'16px 20px' }}>

          {/* AI объяснение */}
          {entry.ai_reasoning && (
            <div style={{ background:'#1e2640', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#8892b0' }}>
              🤖 <strong style={{ color:'#818CF8' }}>AI говорит:</strong> {entry.ai_reasoning}
              <div style={{ marginTop:4, color: entry.ai_confidence >= 80 ? '#10B981' : '#F59E0B', fontWeight:700 }}>
                Уверенность: {entry.ai_confidence}%
              </div>
            </div>
          )}

          {/* Текущая проводка */}
          <div style={{ background:'#0f1117', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
            <div style={{ fontSize:11, color:'#4a5580', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
              Предложенная проводка
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ background:'#4F46E511', border:'1px solid #4F46E533', borderRadius:8, padding:'8px 14px' }}>
                <div style={{ fontSize:10, color:'#818CF8', fontWeight:700, marginBottom:2 }}>ДЕБЕТ</div>
                <div style={{ fontSize:15, fontWeight:800, color:'#818CF8' }}>{entry.debit_account}</div>
                <div style={{ fontSize:11, color:'#8892b0', marginTop:2 }}>{entry.debit_account_name}</div>
              </div>
              <div style={{ fontSize:20, color:'#4a5580' }}>→</div>
              <div style={{ background:'#10B98111', border:'1px solid #10B98133', borderRadius:8, padding:'8px 14px' }}>
                <div style={{ fontSize:10, color:'#34D399', fontWeight:700, marginBottom:2 }}>КРЕДИТ</div>
                <div style={{ fontSize:15, fontWeight:800, color:'#34D399' }}>{entry.credit_account}</div>
                <div style={{ fontSize:11, color:'#8892b0', marginTop:2 }}>{entry.credit_account_name}</div>
              </div>
              <div style={{ marginLeft:'auto', textAlign:'right' }}>
                <div style={{ fontSize:15, fontWeight:800, color:'#e8eaf6' }}>{fmt(entry.amount, entry.currency)}</div>
                {entry.currency !== 'KGS' && entry.amount_kgs && (
                  <div style={{ fontSize:11, color:'#818CF8' }}>≈{fmt(entry.amount_kgs)} KGS</div>
                )}
              </div>
            </div>
            <div style={{ fontSize:12, color:'#8892b0', marginTop:10 }}>{entry.description}</div>
          </div>

          {/* Режим исправления */}
          {mode === 'correct' && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#F59E0B', fontWeight:700, marginBottom:12 }}>✏️ Исправление проводки</div>

              {/* Поиск по счетам */}
              <div style={{ marginBottom:10 }}>
                <label style={lbl}>Поиск счёта</label>
                <input value={acctSearch} onChange={e => setAcctSearch(e.target.value)}
                  placeholder="Код или название..."
                  style={inp} />
                {acctSearch && filteredAccounts.length > 0 && (
                  <div style={{ background:'#0f1117', border:'1px solid #2a3050', borderRadius:8, marginTop:4, maxHeight:160, overflowY:'auto' }}>
                    {filteredAccounts.map(a => (
                      <div key={a.code} style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #1e2640', fontSize:12 }}
                        onMouseEnter={e => e.currentTarget.style.background='#1e2640'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <span style={{ color:'#818CF8', fontWeight:700, marginRight:8 }}>{a.code}</span>
                        <span style={{ color:'#8892b0', flex:1 }}>{a.name}</span>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => { setDebit(a.code); setAcctSearch('') }}
                            style={{ background:'#4F46E522', border:'1px solid #4F46E544', color:'#818CF8', fontSize:10, padding:'2px 6px', borderRadius:4, cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>
                            Дт
                          </button>
                          <button onClick={() => { setCredit(a.code); setAcctSearch('') }}
                            style={{ background:'#10B98122', border:'1px solid #10B98144', color:'#34D399', fontSize:10, padding:'2px 6px', borderRadius:4, cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>
                            Кт
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={lbl}>Дебет *</label>
                  <input value={debit} onChange={e => setDebit(e.target.value)}
                    placeholder="напр. 7220" style={{ ...inp, color:'#818CF8', fontWeight:700 }} />
                </div>
                <div>
                  <label style={lbl}>Кредит *</label>
                  <input value={credit} onChange={e => setCredit(e.target.value)}
                    placeholder="напр. 3210" style={{ ...inp, color:'#34D399', fontWeight:700 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Содержание операции</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  style={inp} />
              </div>
            </div>
          )}

          {/* Режим отклонения */}
          {mode === 'reject' && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#EF4444', fontWeight:700, marginBottom:10 }}>❌ Причина отклонения</div>
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Укажите причину..."
                style={inp} />
            </div>
          )}

          {error && (
            <div style={{ background:'#3A0808', color:'#FCA5A5', fontSize:13, padding:'10px 12px', borderRadius:8, marginBottom:14 }}>
              {error}
            </div>
          )}

          {/* Кнопки действий */}
          {mode === 'view' && (
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => act('confirm')} disabled={saving}
                style={{ flex:1, background:'#10B981', color:'#fff', border:'none', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                ✅ Подтвердить
              </button>
              <button onClick={() => setMode('correct')}
                style={{ flex:1, background:'#F59E0B22', color:'#F59E0B', border:'1px solid #F59E0B44', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                ✏️ Исправить
              </button>
              <button onClick={() => setMode('reject')}
                style={{ flex:1, background:'#EF444422', color:'#EF4444', border:'1px solid #EF444444', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                ❌ Отклонить
              </button>
            </div>
          )}
          {mode === 'correct' && (
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => act('correct')} disabled={saving || !debit || !credit}
                style={{ flex:2, background: (!debit || !credit) ? '#374151' : '#F59E0B', color: (!debit || !credit) ? '#6B7280' : '#000', border:'none', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor: (!debit || !credit) ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                {saving ? 'Сохраняю...' : '✏️ Сохранить исправление'}
              </button>
              <button onClick={() => setMode('view')}
                style={{ flex:1, background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:12, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Назад
              </button>
            </div>
          )}
          {mode === 'reject' && (
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => act('reject')} disabled={saving}
                style={{ flex:2, background:'#EF4444', color:'#fff', border:'none', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                {saving ? 'Отклоняю...' : '❌ Подтвердить отклонение'}
              </button>
              <button onClick={() => setMode('view')}
                style={{ flex:1, background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:12, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Назад
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ОСНОВНАЯ СТРАНИЦА ЖУРНАЛА ─────────────────────────────
export default function Journal() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState('journal')
  const [entries, setEntries] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [postingAll, setPostingAll] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCounterparty, setFilterCounterparty] = useState('')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [expanded, setExpanded] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [reviewEntry, setReviewEntry] = useState(null)
  const [deleteEntry, setDeleteEntry] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  async function handleDelete(entryId) {
    setDeleting(true)
    try {
      await posting.deleteEntry(entryId)
      setDeleteEntry(null)
      await loadJournal()
    } catch(e) { alert(e.response?.data?.detail || e.message) }
    finally { setDeleting(false) }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await posting.bulkDelete([...selected])
      setSelected(new Set())
      setSelectMode(false)
      await loadJournal()
    } catch(e) { alert(e.response?.data?.detail || e.message) }
    finally { setDeleting(false) }
  }

  const loadJournal = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterDateFrom) params.date_from = filterDateFrom
      if (filterDateTo) params.date_to = filterDateTo
      if (filterCounterparty) params.counterparty = filterCounterparty
      const res = await posting.journal(companyId, params)
      setEntries(res.data)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [companyId, filterStatus, filterDateFrom, filterDateTo, filterCounterparty])

  useEffect(() => { loadJournal() }, [loadJournal])
  useEffect(() => { if (tab === 'report') loadReport() }, [tab, reportDate])

  async function loadReport() {
    setLoading(true)
    try {
      const res = await posting.dailyReport(companyId, reportDate)
      setReport(res.data)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function runAutoAll() {
    setPostingAll(true)
    try { await posting.autoAll(companyId); await loadJournal() }
    catch(e) { alert(e.response?.data?.detail || e.message) }
    finally { setPostingAll(false) }
  }

  const needsReview = entries.filter(e => e.status === 'needs_review').length
  const totalPosted = entries.filter(e => e.status === 'posted').length
  const totalKgs = entries.filter(e => e.status === 'posted')
    .reduce((s, e) => s + (e.amount_kgs || (e.currency === 'KGS' ? e.amount : 0)), 0)

  return (
    <div style={{ background:'#0f1117', minHeight:'100vh', fontFamily:'Manrope, sans-serif', color:'#e8eaf6' }}>

      {/* Шапка */}
      <div style={{ background:'#181c27', borderBottom:'1px solid #2a3050', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => navigate(`/company/${companyId}`)}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#8892b0' }}>←</button>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>Журнал хозяйственных операций</div>
            <div style={{ fontSize:11, color:'#4a5580' }}>План счетов КР · МСФО 2026</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => navigate(`/company/${companyId}/scanner`)}
            style={{ background:'#181c27', color:'#8892b0', border:'1px solid #2a3050', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            📷 Сканер
          </button>
          {selectMode ? (
            <>
              <button onClick={handleBulkDelete} disabled={deleting || selected.size === 0}
                style={{ background: selected.size > 0 ? '#EF4444' : '#374151', color:'#fff', border:'none', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
                {deleting ? '...' : `🗑 Удалить (${selected.size})`}
              </button>
              <button onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                style={{ background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                Отмена
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setSelectMode(true)}
                style={{ background:'#181c27', color:'#8892b0', border:'1px solid #2a3050', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                ☑ Выбрать
              </button>
              <button onClick={runAutoAll} disabled={postingAll}
                style={{ background:postingAll?'#374151':'#4F46E5', color:'#fff', border:'none', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor:postingAll?'not-allowed':'pointer', fontFamily:'inherit' }}>
                {postingAll ? '⏳ Разношу...' : '⚡ Разнести все'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, padding:'16px 20px 0' }}>
        {[
          { label:'Всего записей', value:entries.length, color:'#e8eaf6' },
          { label:'Проведено', value:totalPosted, color:'#10B981' },
          { label:'На проверке', value:needsReview, color:'#F59E0B',
            action: needsReview > 0 ? () => setFilterStatus('needs_review') : null },
          { label:'Итого KGS', value:totalKgs > 0 ? fmt(totalKgs) : '—', color:'#818CF8', small:true },
        ].map(s => (
          <div key={s.label} onClick={s.action || undefined}
            style={{ background:'#181c27', borderRadius:10, padding:'12px 14px', border:`1px solid ${s.action ? '#F59E0B44' : '#2a3050'}`, cursor:s.action ? 'pointer' : 'default', transition:'border-color 0.15s' }}>
            <div style={{ fontSize:10, color:'#4a5580', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</div>
            <div style={{ fontSize:s.small?16:24, fontWeight:800, color:s.color, marginTop:4 }}>{s.value}</div>
            {s.label === 'На проверке' && needsReview > 0 && (
              <div style={{ fontSize:10, color:'#F59E0B', marginTop:2 }}>↑ нажми для фильтра</div>
            )}
          </div>
        ))}
      </div>

      {/* Табы */}
      <div style={{ display:'flex', gap:4, padding:'14px 20px 0' }}>
        {[['journal','📋 Журнал'],['report','📊 Отчёт за день']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:'7px 16px', borderRadius:8, border: tab===key ? 'none' : '1px solid #2a3050', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer', background:tab===key?'#4F46E5':'#181c27', color:tab===key?'#fff':'#8892b0' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 20px 40px' }}>

        {/* ── ЖУРНАЛ ── */}
        {tab === 'journal' && (
          <>
            {/* Фильтры */}
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                {[['','Все'],['posted','Проведено'],['needs_review','На проверке'],['rejected','Отклонено']].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterStatus(val)}
                    style={{ padding:'5px 12px', borderRadius:20, border:`1.5px solid ${filterStatus===val?S_COLOR[val]||'#4F46E5':'#2a3050'}`, background:filterStatus===val?(S_BG[val]||'#4F46E522'):'none', color:filterStatus===val?(S_COLOR[val]||'#818CF8'):'#8892b0', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setShowFilters(!showFilters)}
                  style={{ padding:'5px 12px', borderRadius:20, border:'1px solid #2a3050', background:'none', color:'#8892b0', fontSize:12, cursor:'pointer', fontFamily:'inherit', marginLeft:'auto' }}>
                  {showFilters ? '▲ Свернуть' : '▼ Фильтры'}
                </button>
              </div>
              {showFilters && (
                <div style={{ display:'flex', gap:10, marginTop:10, flexWrap:'wrap' }}>
                  <div><div style={lbl}>С даты</div><input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} style={inp2}/></div>
                  <div><div style={lbl}>По дату</div><input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} style={inp2}/></div>
                  <div><div style={lbl}>Контрагент</div><input placeholder="Поиск..." value={filterCounterparty} onChange={e=>setFilterCounterparty(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadJournal()} style={{...inp2, width:180}}/></div>
                  <button onClick={loadJournal} style={{ alignSelf:'flex-end', background:'#4F46E5', color:'#fff', border:'none', padding:'7px 14px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Применить</button>
                  <button onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterCounterparty('');setFilterStatus('')}} style={{ alignSelf:'flex-end', background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:'7px 14px', borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Сброс</button>
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign:'center', padding:40, color:'#4a5580' }}>Загрузка...</div>
            ) : entries.length === 0 ? (
              <div style={{ textAlign:'center', padding:48, background:'#181c27', borderRadius:14, border:'1px solid #2a3050' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
                <p style={{ fontWeight:700, margin:'0 0 8px' }}>Проводок пока нет</p>
                <p style={{ fontSize:13, color:'#8892b0', margin:'0 0 20px' }}>Отсканируйте документы — AI создаст проводки автоматически</p>
                <button onClick={() => navigate(`/company/${companyId}/scanner`)}
                  style={{ background:'#4F46E5', color:'#fff', border:'none', padding:'10px 20px', borderRadius:8, fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>
                  📷 Сканировать документ
                </button>
              </div>
            ) : (
              <div style={{ background:'#181c27', borderRadius:12, border:'1px solid #2a3050', overflow:'hidden' }}>
                {/* Шапка таблицы */}
                <div style={{ display:'grid', gridTemplateColumns: selectMode ? '28px 36px 70px 100px 130px 1fr 90px 90px 110px 90px' : '36px 70px 100px 130px 1fr 90px 90px 110px 90px', gap:6, padding:'10px 14px', background:'#0f1117', fontSize:10, fontWeight:700, color:'#4a5580', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  {selectMode && <div><input type='checkbox' onChange={e => { if(e.target.checked) setSelected(new Set(entries.map(x=>x.id))); else setSelected(new Set()) }} /></div>}
                  <div>№</div><div>Дата</div><div>Документ</div><div>Контрагент</div>
                  <div>Содержание</div><div>Дт</div><div>Кт</div><div style={{textAlign:'right'}}>Сумма</div><div>Статус</div>
                </div>

                {entries.map(e => (
                  <div key={e.id}>
                    <div
                      onClick={() => !selectMode && setExpanded(expanded===e.id ? null : e.id)}
                      style={{ display:'grid', gridTemplateColumns: selectMode ? '28px 36px 70px 100px 130px 1fr 90px 90px 110px 90px' : '36px 70px 100px 130px 1fr 90px 90px 110px 90px', gap:6, padding:'11px 14px', borderTop:'1px solid #1e2640', alignItems:'center', cursor: selectMode ? 'default' : 'pointer', background: selected.has(e.id) ? '#1e0a0a' : e.status==='needs_review' ? '#1A1200' : expanded===e.id ? '#1e2640' : 'transparent' }}
                      onMouseEnter={ev => { if(!selectMode) ev.currentTarget.style.background = e.status==='needs_review' ? '#201600' : '#1a1f35' }}
                      onMouseLeave={ev => { if(!selectMode) ev.currentTarget.style.background = selected.has(e.id) ? '#1e0a0a' : e.status==='needs_review' ? '#1A1200' : expanded===e.id ? '#1e2640' : 'transparent' }}>

                      {selectMode && (
                        <div onClick={ev => ev.stopPropagation()} style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <input type='checkbox' checked={selected.has(e.id)}
                            onChange={() => setSelected(prev => { const s = new Set(prev); s.has(e.id) ? s.delete(e.id) : s.add(e.id); return s })} />
                        </div>
                      )}

                      <div style={{ fontSize:11, color:'#4a5580', fontWeight:600 }}>{e.row_num}</div>
                      <div style={{ fontSize:11, color:'#8892b0' }}>{e.entry_date?.slice(2)}</div>
                      <div>
                        {e.doc_number && <div style={{ fontSize:11, fontWeight:700, color:'#e8eaf6' }}>№{e.doc_number}</div>}
                        {e.doc_type && <div style={{ fontSize:10, color:'#4a5580' }}>{DOC_TYPE_LABEL[e.doc_type]||e.doc_type}</div>}
                      </div>
                      <div style={{ fontSize:11, color:'#8892b0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.counterparty||'—'}</div>
                      <div style={{ fontSize:12, color:'#c0c8e0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description||'—'}</div>
                      <div><span style={{ fontSize:12, fontWeight:800, color:'#818CF8', background:'#4F46E511', padding:'2px 6px', borderRadius:4 }}>{e.debit_account}</span></div>
                      <div><span style={{ fontSize:12, fontWeight:800, color:'#34D399', background:'#10B98111', padding:'2px 6px', borderRadius:4 }}>{e.credit_account}</span></div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#e8eaf6', fontVariantNumeric:'tabular-nums' }}>{Number(e.amount).toLocaleString('ru-RU')}</div>
                        <div style={{ fontSize:10, color:'#4a5580' }}>{e.currency}</div>
                        {e.currency!=='KGS' && e.amount_kgs && <div style={{ fontSize:10, color:'#818CF8' }}>≈{Number(e.amount_kgs).toLocaleString('ru-RU')} ₸</div>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start' }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:S_BG[e.status]||'#F3F4F622', color:S_COLOR[e.status]||'#6B7280' }}>
                          {S_LABEL[e.status]||e.status}
                        </span>
                        {e.status === 'needs_review' && (
                          <button onClick={ev => { ev.stopPropagation(); setReviewEntry(e) }}
                            style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'#F59E0B', color:'#000', border:'none', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                            Проверить →
                          </button>
                        )}
                        <button onClick={ev => { ev.stopPropagation(); setDeleteEntry(e) }}
                          style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'none', color:'#EF4444', border:'1px solid #EF444433', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          🗑
                        </button>
                        <div style={{ fontSize:10, color:e.ai_confidence>=85?'#10B981':e.ai_confidence>=60?'#F59E0B':'#EF4444' }}>
                          {e.ai_confidence}% AI
                        </div>
                      </div>

                    {/* Раскрытая детализация */}
                    {expanded === e.id && (
                      <div style={{ padding:'12px 14px 14px', background:'#141929', borderTop:'1px solid #2a3050' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:10 }}>
                          <div><div style={lbl}>Дт счёт</div><div style={{ fontSize:13, color:'#818CF8', fontWeight:700 }}>{e.debit_account} — {e.debit_account_name}</div></div>
                          <div><div style={lbl}>Кт счёт</div><div style={{ fontSize:13, color:'#34D399', fontWeight:700 }}>{e.credit_account} — {e.credit_account_name}</div></div>
                          {e.counterparty_inn && <div><div style={lbl}>ИНН</div><div style={{ fontSize:13, color:'#8892b0' }}>{e.counterparty_inn}</div></div>}
                        </div>
                        {e.reviewed_by && (
                          <div style={{ fontSize:11, color:'#10B981', marginBottom:6 }}>
                            ✅ Проверено: {e.reviewed_by}
                          </div>
                        )}
                        {e.ai_reasoning && (
                          <div style={{ background:'#1e2640', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#8892b0' }}>
                            🤖 <strong style={{ color:'#818CF8' }}>AI:</strong> {e.ai_reasoning}
                          </div>
                        )}
                        {e.status === 'needs_review' && (
                          <button onClick={() => setReviewEntry(e)}
                            style={{ marginTop:10, background:'#F59E0B', color:'#000', border:'none', padding:'9px 20px', borderRadius:8, fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                            ✏️ Открыть на проверку
                          </button>
                        )}
                        <button onClick={() => setDeleteEntry(e)}
                          style={{ marginTop:8, background:'none', color:'#EF4444', border:'1px solid #EF444433', padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                          🗑 Удалить проводку
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ОТЧЁТ ЗА ДЕНЬ ── */}
        {tab === 'report' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} style={inp2}/>
              <button onClick={loadReport} style={{ background:'#4F46E5', color:'#fff', border:'none', padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Показать</button>
            </div>
            {loading ? <div style={{ textAlign:'center', padding:40, color:'#4a5580' }}>Загрузка...</div> : report && (
              <div>
                <div style={{ background:'#181c27', borderRadius:12, border:'1px solid #2a3050', padding:'16px 18px', marginBottom:12 }}>
                  <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>📊 {report.report_date} · {report.company}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
                    {[['Всего',report.summary?.total_entries,'#e8eaf6'],['Проведено',report.summary?.posted,'#10B981'],['На проверке',report.summary?.needs_review,'#F59E0B'],['Итого KGS',fmt(report.summary?.total_amount_kgs),'#818CF8']].map(([l,v,c])=>(
                      <div key={l} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:20, fontWeight:800, color:c }}>{v??0}</div>
                        <div style={{ fontSize:10, color:'#4a5580', fontWeight:600, textTransform:'uppercase', marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {report.needs_review?.length > 0 && (
                  <div style={{ background:'#1A1200', border:'1px solid #F59E0B44', borderRadius:12, overflow:'hidden', marginBottom:12 }}>
                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #F59E0B22', fontWeight:700, fontSize:13, color:'#F59E0B' }}>
                      ⚠️ Требуют проверки ({report.needs_review.length})
                    </div>
                    {report.needs_review.map(e => (
                      <div key={e.id} style={{ padding:'12px 16px', borderBottom:'1px solid #2a1a00', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#e8eaf6', marginBottom:2 }}>
                            {e.doc_number ? `№${e.doc_number}` : '—'} · {e.counterparty||'—'}
                          </div>
                          <div style={{ fontSize:11, color:'#8892b0' }}>{e.description}</div>
                          <div style={{ fontSize:11, color:'#4a5580', marginTop:2 }}>Дт {e.debit?.split(' ')[0]} → Кт {e.credit?.split(' ')[0]} · AI {e.confidence}%</div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#e8eaf6' }}>{fmt(e.amount, e.currency)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(report.totals_by_debit_account||{}).length > 0 && (
                  <div style={{ background:'#181c27', borderRadius:12, border:'1px solid #2a3050', overflow:'hidden', marginBottom:12 }}>
                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #2a3050', fontWeight:700, fontSize:13 }}>Обороты по дебетовым счетам</div>
                    {Object.entries(report.totals_by_debit_account).map(([acc,amt])=>(
                      <div key={acc} style={{ display:'flex', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #1e2640', fontSize:13 }}>
                        <span style={{ color:'#8892b0' }}>{acc}</span>
                        <span style={{ fontWeight:700, color:'#e8eaf6', fontVariantNumeric:'tabular-nums' }}>{fmt(amt)} KGS</span>
                      </div>
                    ))}
                  </div>
                )}

                {report.posted_entries?.length > 0 && (
                  <div style={{ background:'#181c27', borderRadius:12, border:'1px solid #2a3050', overflow:'hidden' }}>
                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #2a3050', fontWeight:700, fontSize:13 }}>✅ Проведённые операции ({report.posted_entries.length})</div>
                    {report.posted_entries.map(e=>(
                      <div key={e.id} style={{ padding:'11px 16px', borderBottom:'1px solid #1e2640', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                            {e.doc_number && <span style={{ fontSize:11, fontWeight:700, color:'#818CF8' }}>№{e.doc_number}</span>}
                            {e.counterparty && <span style={{ fontSize:11, color:'#8892b0' }}>{e.counterparty}</span>}
                          </div>
                          <div style={{ fontSize:12, color:'#c0c8e0', marginBottom:4 }}>{e.description}</div>
                          <div style={{ fontSize:11 }}>
                            <span style={{ color:'#818CF8', background:'#4F46E511', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>Дт {e.debit?.split(' ')[0]}</span>
                            <span style={{ color:'#4a5580', margin:'0 5px' }}>→</span>
                            <span style={{ color:'#34D399', background:'#10B98111', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>Кт {e.credit?.split(' ')[0]}</span>
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#e8eaf6', fontVariantNumeric:'tabular-nums' }}>{fmt(e.amount, e.currency)}</div>
                          {e.currency!=='KGS'&&e.amount_kgs&&<div style={{ fontSize:11, color:'#818CF8' }}>≈{fmt(e.amount_kgs)} KGS</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {report.summary?.total_entries === 0 && (
                  <div style={{ textAlign:'center', padding:40, background:'#181c27', borderRadius:12, border:'1px solid #2a3050', color:'#4a5580' }}>За этот день операций нет</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно удаления */}
      {deleteEntry && (
        <div style={{ position:'fixed', inset:0, background:'#000c', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#181c27', border:'1px solid #EF444466', borderRadius:16, padding:24, maxWidth:420, width:'100%' }}>
            <div style={{ fontSize:28, marginBottom:12 }}>🗑</div>
            <div style={{ fontWeight:800, fontSize:15, color:'#e8eaf6', marginBottom:8 }}>Удалить проводку?</div>
            <div style={{ fontSize:13, color:'#8892b0', marginBottom:6 }}>
              {deleteEntry.doc_number ? `№${deleteEntry.doc_number}` : 'Без номера'} · {deleteEntry.counterparty || '—'}
            </div>
            <div style={{ fontSize:13, color:'#8892b0', marginBottom:16 }}>
              Дт <strong style={{color:'#818CF8'}}>{deleteEntry.debit_account}</strong> → Кт <strong style={{color:'#34D399'}}>{deleteEntry.credit_account}</strong> · {Number(deleteEntry.amount).toLocaleString('ru-RU')} {deleteEntry.currency}
            </div>
            <div style={{ background:'#1e0a0a', border:'1px solid #EF444433', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#FCA5A5' }}>
              ⚠️ Документ вернётся в статус «Ожидает разноски»
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => handleDelete(deleteEntry.id)} disabled={deleting}
                style={{ flex:1, background:'#EF4444', color:'#fff', border:'none', padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
                {deleting ? 'Удаляю...' : 'Да, удалить'}
              </button>
              <button onClick={() => setDeleteEntry(null)}
                style={{ flex:1, background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:12, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно проверки */}
      {reviewEntry && (
        <ReviewModal
          entry={reviewEntry}
          onClose={() => setReviewEntry(null)}
          onDone={() => { setReviewEntry(null); loadJournal() }}
        />
      )}
    </div>
  )
}

const lbl = { fontSize:10, color:'#4a5580', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4, display:'block' }
const inp = { width:'100%', background:'#0f1117', border:'1px solid #2a3050', borderRadius:8, padding:'10px 12px', color:'#e8eaf6', fontSize:13, fontFamily:'Manrope, sans-serif', boxSizing:'border-box' }
const inp2 = { background:'#0f1117', border:'1px solid #2a3050', borderRadius:6, padding:'7px 10px', color:'#e8eaf6', fontSize:12, fontFamily:'Manrope, sans-serif' }
