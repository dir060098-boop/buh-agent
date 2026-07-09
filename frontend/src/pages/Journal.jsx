import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { posting, documents as docsApi, scanner as scannerApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import Toast from '../components/Toast'

const MONTHS_RU = ["","Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
import NavBar from '../components/NavBar'

const S_LABEL = { posted:'Проведено', needs_review:'На проверке', rejected:'Отклонено' }
const S_COLOR = { posted:'var(--success)', needs_review:'var(--warn)', rejected:'var(--error)' }
const S_BG    = { posted:'var(--success-light)', needs_review:'var(--warn-light)', rejected:'var(--error-light)' }
const DOC_TYPE_LABEL = {
  invoice:'Счёт', act:'Акт', esf:'ЭСФ', ttn:'Накладная',
  contract:'Договор', receipt:'Квитанция', payment_order:'Платёжка',
  bank_statement:'Выписка', payroll:'Зарплата', other:'Прочее'
}
function fmt(n,cur){if(n==null)return'—';const s=Number(n).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});return cur?`${s} ${cur}`:s}

// ── КНОПКА КОНТЕКСТНОГО ДЕЙСТВИЯ ──────────────────────────
function CtxBtn({icon,label,onClick,muted}){
  const [hover,setHover]=useState(false)
  return(
    <button onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{display:'flex',alignItems:'center',gap:5,
        background:muted?'none':hover?'var(--accent-light)':'var(--surface)',
        border:`1px solid ${muted?'var(--border)':hover?'var(--accent)':'var(--border2)'}`,
        borderRadius:'var(--radius-sm)',padding:'5px 10px',fontSize:12,fontWeight:600,
        color:muted?'var(--text4)':hover?'var(--accent)':'var(--text2)',
        cursor:'pointer',fontFamily:'Manrope,sans-serif',transition:'all 0.1s'}}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )
}

// ── МОДАЛ ПРОСМОТРА ДОКУМЕНТА ─────────────────────────────
function DocViewModal({entry,onClose}){
  const [docFileUrl,setDocFileUrl]=useState(null)
  const [docInfo,setDocInfo]=useState(null)
  useEffect(()=>{
    if(!entry.document_id)return
    docsApi.getById(entry.document_id).then(r=>{
      const doc=r.data;setDocInfo(doc)
      if(doc.file_path)setDocFileUrl(scannerApi.fileUrl(doc.file_path))
    }).catch(()=>{})
  },[entry.document_id])
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(30,42,62,0.6)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',width:'100%',maxWidth:700,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'var(--shadow-lg)'}}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--surface2)',flexShrink:0}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:'var(--text)'}}>{entry.doc_number?`Документ №${entry.doc_number}`:'Документ'} — оригинал</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{entry.counterparty||'—'} · {entry.doc_date||entry.entry_date}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {docFileUrl&&<a href={docFileUrl} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--accent)',fontWeight:700,textDecoration:'none',background:'var(--accent-light)',padding:'5px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>🔗 Открыть в новой вкладке</a>}
            <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:22}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',padding:16}}>
          {docFileUrl?(
            <object data={docFileUrl} type="application/pdf" style={{width:'100%',height:500,border:'none'}}>
              <img src={docFileUrl} alt="document" style={{width:'100%',borderRadius:'var(--radius-sm)'}}/>
            </object>
          ):(
            <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>{entry.document_id?'Загрузка...':'Файл недоступен'}</div>
          )}
          {docInfo&&(
            <div style={{marginTop:14,background:'var(--surface2)',borderRadius:'var(--radius)',padding:'12px 16px',border:'1px solid var(--border)'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,fontSize:12}}>
                {[['Тип',docInfo.doc_type],['Номер',docInfo.doc_number],['Дата',docInfo.doc_date?.slice(0,10)],
                  ['Контрагент',docInfo.counterparty],['ИНН',docInfo.counterparty_inn],
                  ['Сумма',docInfo.amount?`${docInfo.amount} ${docInfo.currency}`:null]
                ].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l}><div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{l}</div><div style={{color:'var(--text)',fontWeight:600}}>{v}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── МОДАЛ ПРОВЕРКИ ────────────────────────────────────────
function ReviewModal({entry,onClose,onDone}){
  const [mode,setMode]=useState('view')
  const [debit,setDebit]=useState(entry.debit_account||'')
  const [credit,setCredit]=useState(entry.credit_account||'')
  const [description,setDescription]=useState(entry.description||'')
  const [comment,setComment]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [accounts,setAccounts]=useState([])
  const [acctSearch,setAcctSearch]=useState('')
  useEffect(()=>{posting.chartOfAccounts(3).then(r=>setAccounts(r.data)).catch(()=>{})},[])
  async function act(action){
    setSaving(true);setError('')
    try{
      const p={action}
      if(action==='correct'){p.debit_account=debit;p.credit_account=credit;p.description=description}
      if(action==='reject')p.comment=comment
      await posting.review(entry.id,p);onDone()
    }catch(e){setError(e.response?.data?.detail||'Ошибка')}
    finally{setSaving(false)}
  }
  const filtered=accounts.filter(a=>!acctSearch||a.code.includes(acctSearch)||a.name.toLowerCase().includes(acctSearch.toLowerCase())).slice(0,30)
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(30,42,62,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:'var(--text)'}}>{entry.doc_number?`№${entry.doc_number}`:'Документ'} — Проверка</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:3}}>{entry.counterparty||'—'} · {entry.entry_date}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:20}}>×</button>
        </div>
        <div style={{padding:'16px 20px'}}>
          {entry.ai_reasoning&&<div style={{background:'var(--ai-light)',borderRadius:'var(--radius)',padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--ai-text)',border:'1px solid var(--border)'}}>🤖 <strong style={{color:'var(--ai)'}}>AI:</strong> {entry.ai_reasoning}<div style={{marginTop:4,color:entry.ai_confidence>=80?'var(--success)':'var(--warn)',fontWeight:700}}>Уверенность: {entry.ai_confidence}%</div></div>}
          <div style={{background:'var(--surface2)',borderRadius:'var(--radius)',padding:'12px 16px',marginBottom:16}}>
            <div style={{fontSize:11,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Предложенная проводка</div>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{background:'var(--accent-light)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'8px 14px'}}>
                <div style={{fontSize:10,color:'var(--accent)',fontWeight:700,marginBottom:2}}>ДЕБЕТ</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--accent)'}}>{entry.debit_account}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{entry.debit_account_name}</div>
              </div>
              <div style={{fontSize:20,color:'var(--text4)'}}>→</div>
              <div style={{background:'var(--success-light)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'8px 14px'}}>
                <div style={{fontSize:10,color:'var(--success)',fontWeight:700,marginBottom:2}}>КРЕДИТ</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--success)'}}>{entry.credit_account}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{entry.credit_account_name}</div>
              </div>
              <div style={{marginLeft:'auto',textAlign:'right'}}><div style={{fontSize:15,fontWeight:800,color:'var(--text)'}}>{fmt(entry.amount,entry.currency)}</div></div>
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:10}}>{entry.description}</div>
          </div>
          {mode==='correct'&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--warn)',fontWeight:700,marginBottom:12}}>✏️ Исправление</div>
              <div style={{marginBottom:10}}>
                <label style={LBL}>Поиск счёта</label>
                <input value={acctSearch} onChange={e=>setAcctSearch(e.target.value)} placeholder="Код или название..." style={{...INP,marginBottom:0}}/>
                {acctSearch&&filtered.length>0&&(
                  <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginTop:4,maxHeight:160,overflowY:'auto',boxShadow:'var(--shadow)'}}>
                    {filtered.map(a=>(
                      <div key={a.code} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderBottom:'1px solid var(--border)',fontSize:12,cursor:'pointer'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <span style={{color:'var(--accent)',fontWeight:700,marginRight:8}}>{a.code}</span>
                        <span style={{color:'var(--text2)',flex:1}}>{a.name}</span>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>{setDebit(a.code);setAcctSearch('')}} style={{background:'var(--accent-light)',border:'1px solid var(--border)',color:'var(--accent)',fontSize:10,padding:'2px 6px',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:700}}>Дт</button>
                          <button onClick={()=>{setCredit(a.code);setAcctSearch('')}} style={{background:'var(--success-light)',border:'1px solid var(--border)',color:'var(--success)',fontSize:10,padding:'2px 6px',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:700}}>Кт</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div><label style={LBL}>Дебет *</label><input value={debit} onChange={e=>setDebit(e.target.value)} placeholder="7220" style={{...INP,color:'var(--accent)',fontWeight:700}}/></div>
                <div><label style={LBL}>Кредит *</label><input value={credit} onChange={e=>setCredit(e.target.value)} placeholder="3110" style={{...INP,color:'var(--success)',fontWeight:700}}/></div>
              </div>
              <div><label style={LBL}>Содержание</label><input value={description} onChange={e=>setDescription(e.target.value)} style={INP}/></div>
            </div>
          )}
          {mode==='reject'&&<div style={{marginBottom:16}}><div style={{fontSize:12,color:'var(--error)',fontWeight:700,marginBottom:10}}>❌ Причина отклонения</div><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Укажите причину..." style={INP}/></div>}
          {error&&<div style={{background:'var(--error-light)',color:'var(--error)',fontSize:13,padding:'10px 12px',borderRadius:'var(--radius-sm)',marginBottom:14,border:'1px solid var(--error)'}}>{error}</div>}
          {mode==='view'&&(
            <div style={{display:'flex',gap:10}}>
              {entry.status!=='posted'&&<button onClick={()=>act('confirm')} disabled={saving} style={{flex:1,background:'var(--success)',color:'#fff',border:'none',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit',boxShadow:'var(--shadow)'}}>✅ Подтвердить</button>}
              <button onClick={()=>setMode('correct')} style={{flex:entry.status!=='posted'?1:2,background:'var(--warn-light)',color:'var(--warn)',border:'1px solid var(--warn)',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>✏️ Исправить счета</button>
              {entry.status!=='posted'&&<button onClick={()=>setMode('reject')} style={{flex:1,background:'var(--error-light)',color:'var(--error)',border:'1px solid var(--error)',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>❌ Отклонить</button>}
            </div>
          )}
          {mode==='correct'&&<div style={{display:'flex',gap:10}}><button onClick={()=>act('correct')} disabled={saving||!debit||!credit} style={{flex:2,background:(!debit||!credit)?'var(--text4)':'var(--warn)',color:'#fff',border:'none',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:(!debit||!credit)?'not-allowed':'pointer',fontFamily:'inherit'}}>{saving?'Сохраняю...':'✏️ Сохранить'}</button><button onClick={()=>setMode('view')} style={{flex:1,background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:12,borderRadius:'var(--radius)',cursor:'pointer',fontFamily:'inherit'}}>Назад</button></div>}
          {mode==='reject'&&<div style={{display:'flex',gap:10}}><button onClick={()=>act('reject')} disabled={saving} style={{flex:2,background:'var(--error)',color:'#fff',border:'none',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Отклоняю...':'❌ Подтвердить'}</button><button onClick={()=>setMode('view')} style={{flex:1,background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:12,borderRadius:'var(--radius)',cursor:'pointer',fontFamily:'inherit'}}>Назад</button></div>}
        </div>
      </div>
    </div>
  )
}

// ── ОСНОВНАЯ СТРАНИЦА ─────────────────────────────────────
export default function Journal(){
  const {companyId}=useParams()
  const navigate=useNavigate()
  const [tab,setTab]=useState('journal')
  const [entries,setEntries]=useState([])
  const [report,setReport]=useState(null)
  // ОСВ
  const [osv,setOsv]=useState(null)
  const [osvLoading,setOsvLoading]=useState(false)
  const [osvFrom,setOsvFrom]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`})
  const [osvTo,setOsvTo]=useState(()=>new Date().toISOString().slice(0,10))
  const [osvScope,setOsvScope]=useState('')   // '' = всё | official | internal
  const [loading,setLoading]=useState(true)
  const [postingAll,setPostingAll]=useState(false)
  const [filterStatus,setFilterStatus]=useState('')
  const [filterDateFrom,setFilterDateFrom]=useState('')
  const [filterDateTo,setFilterDateTo]=useState('')
  const [filterCounterparty,setFilterCounterparty]=useState('')
  const [reportDate,setReportDate]=useState(new Date().toISOString().slice(0,10))
  const [expanded,setExpanded]=useState(null)
  const [showFilters,setShowFilters]=useState(false)
  const [reviewEntry,setReviewEntry]=useState(null)
  const [deleteEntry,setDeleteEntry]=useState(null)
  const [deleting,setDeleting]=useState(false)
  const [selectMode,setSelectMode]=useState(false)
  const [selected,setSelected]=useState(new Set())
  const [docViewEntry,setDocViewEntry]=useState(null)
  const { toasts, showToast, removeToast } = useToast()
  const [totalEntries,setTotalEntries]=useState(0)
  const [hasMore,setHasMore]=useState(false)
  const [loadingMore,setLoadingMore]=useState(false)
  const [serverStats,setServerStats]=useState(null)
  const PAGE=100
  // Закрытие периода
  const [showArchived,setShowArchived]=useState(false)
  const [showClosePeriod,setShowClosePeriod]=useState(false)
  const [cpYear,setCpYear]=useState(new Date().getFullYear())
  const [cpMonth,setCpMonth]=useState(new Date().getMonth()||12) // прошлый месяц
  const [cpPreview,setCpPreview]=useState(null)   // {count, period_label}
  const [cpClosing,setCpClosing]=useState(false)
  const [closedPeriods,setClosedPeriods]=useState([])

  function copyToClipboard(text,label){
    navigator.clipboard.writeText(text).then(()=>showToast(label,'info',2000))
  }

  const loadJournal=useCallback(async()=>{
    setLoading(true)
    try{
      const params={}
      if(filterStatus)params.status=filterStatus
      if(filterDateFrom)params.date_from=filterDateFrom
      if(filterDateTo)params.date_to=filterDateTo
      if(filterCounterparty)params.counterparty=filterCounterparty
      if(showArchived)params.include_archived=true
      params.limit=PAGE; params.offset=0
      const res=await posting.journal(companyId,params)
      setEntries(res.data.items)
      setTotalEntries(res.data.total)
      setHasMore(res.data.has_more)
      // Серверная статистика — параллельно, не блокирует список
      const statsParams={}
      if(filterDateFrom)statsParams.date_from=filterDateFrom
      if(filterDateTo)statsParams.date_to=filterDateTo
      if(showArchived)statsParams.include_archived=true
      posting.journalStats(companyId,statsParams).then(r=>setServerStats(r.data)).catch(()=>{})
    }catch(e){console.error(e)}
    finally{setLoading(false)}
  },[companyId,filterStatus,filterDateFrom,filterDateTo,filterCounterparty,showArchived])

  // Загружаем список закрытых периодов
  useEffect(()=>{
    posting.closedPeriods(companyId).then(r=>setClosedPeriods(r.data)).catch(()=>{})
  },[companyId])

  useEffect(()=>{loadJournal()},[loadJournal])
  useEffect(()=>{if(tab==='report')loadReport()},[tab,reportDate])

  async function loadOsv(){
    setOsvLoading(true)
    try{
      const params={}
      if(osvFrom)params.date_from=osvFrom
      if(osvTo)params.date_to=osvTo
      if(osvScope)params.scope=osvScope
      const r=await posting.trialBalance(companyId,params)
      setOsv(r.data)
    }catch(e){setOsv(null)}
    finally{setOsvLoading(false)}
  }
  useEffect(()=>{if(tab==='osv')loadOsv()},[tab,osvScope])

  async function loadReport(){
    setLoading(true)
    try{const res=await posting.dailyReport(companyId,reportDate);setReport(res.data)}
    catch(e){console.error(e)}finally{setLoading(false)}
  }
  // Предпросмотр: сколько проводок будет закрыто
  async function loadCpPreview(year,month){
    setCpPreview(null)
    try{
      const r=await posting.periodPreview(companyId,year,month)
      setCpPreview(r.data)
    }catch(e){}
  }
  // При открытии модала — сразу грузим предпросмотр
  useEffect(()=>{
    if(showClosePeriod)loadCpPreview(cpYear,cpMonth)
  },[showClosePeriod,cpYear,cpMonth])

  async function handleClosePeriod(){
    setCpClosing(true)
    try{
      const r=await posting.closePeriod(companyId,cpYear,cpMonth)
      setShowClosePeriod(false)
      setCpPreview(null)
      await loadJournal()
      posting.closedPeriods(companyId).then(r=>setClosedPeriods(r.data)).catch(()=>{})
      showToast(`Период ${r.data.period_label} закрыт — ${r.data.archived} проводок`)
    }catch(e){showToast(e.response?.data?.detail||'Ошибка закрытия периода','error')}
    finally{setCpClosing(false)}
  }

  async function handleReopenPeriod(year,month){
    if(!window.confirm('Переоткрыть период? Проводки вернутся в основной журнал.'))return
    try{
      const r=await posting.reopenPeriod(companyId,year,month)
      await loadJournal()
      posting.closedPeriods(companyId).then(r=>setClosedPeriods(r.data)).catch(()=>{})
      showToast(`Период ${r.data.period_label} переоткрыт — ${r.data.reopened} проводок`)
    }catch(e){showToast(e.response?.data?.detail||'Ошибка переоткрытия','error')}
  }

  async function loadMore(){
    setLoadingMore(true)
    try{
      const params={limit:PAGE, offset:entries.length}
      if(filterStatus)params.status=filterStatus
      if(filterDateFrom)params.date_from=filterDateFrom
      if(filterDateTo)params.date_to=filterDateTo
      if(filterCounterparty)params.counterparty=filterCounterparty
      if(showArchived)params.include_archived=true
      const res=await posting.journal(companyId,params)
      setEntries(prev=>[...prev,...res.data.items])
      setHasMore(res.data.has_more)
    }catch(e){}
    finally{setLoadingMore(false)}
  }

  async function runAutoAll(){
    setPostingAll(true)
    try{await posting.autoAll(companyId);await loadJournal()}
    catch(e){showToast(e.response?.data?.detail||e.message,'error')}
    finally{setPostingAll(false)}
  }
  async function handleDelete(entryId){
    setDeleting(true)
    try{await posting.deleteEntry(entryId);setDeleteEntry(null);await loadJournal()}
    catch(e){showToast(e.response?.data?.detail||e.message,'error')}
    finally{setDeleting(false)}
  }
  async function handleBulkDelete(){
    if(selected.size===0)return
    setDeleting(true)
    try{await posting.bulkDelete([...selected]);setSelected(new Set());setSelectMode(false);await loadJournal()}
    catch(e){showToast(e.response?.data?.detail||e.message,'error')}
    finally{setDeleting(false)}
  }
  function toggleSelect(id){setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s})}

  // Серверная статистика (вся выборка, не зависит от пагинации)
  const needsReview = serverStats?.needs_review ?? entries.filter(e=>e.status==='needs_review').length
  const totalPosted = serverStats?.posted ?? entries.filter(e=>e.status==='posted').length
  const totalKgs    = serverStats?.total_kgs ?? entries.filter(e=>e.status==='posted').reduce((s,e)=>s+(e.amount_kgs||(e.currency==='KGS'?e.amount:0)),0)
  const totalCount  = serverStats?.total ?? entries.length
  const cols=selectMode?'28px 36px 70px 100px 130px 1fr 90px 90px 110px 110px':'36px 70px 100px 130px 1fr 90px 90px 110px 110px'

  return(
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'Manrope, sans-serif'}}>

      <NavBar companyId={companyId} current="journal" />

      {/* Шапка модуля */}
      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,boxShadow:'var(--shadow-sm)'}}>
        <div>
          <div style={{fontWeight:800,fontSize:15,color:'var(--text)'}}>📋 Журнал хозяйственных операций</div>
          <div style={{fontSize:11,color:'var(--text3)'}}>План счетов КР · МСФО 2026</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {selectMode?(
            <>
              <button onClick={handleBulkDelete} disabled={deleting||selected.size===0} style={{background:selected.size>0?'var(--error)':'var(--text4)',color:'#fff',border:'none',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:selected.size>0?'pointer':'not-allowed',fontFamily:'inherit'}}>{deleting?'...': `🗑 Удалить (${selected.size})`}</button>
              <button onClick={()=>{setSelectMode(false);setSelected(new Set())}} style={{background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
            </>
          ):(
            <>
              <button onClick={()=>setSelectMode(true)} style={{background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>☑ Выбрать</button>
              <button
                onClick={()=>{setShowArchived(v=>!v)}}
                style={{background:showArchived?'var(--warn-light)':'var(--surface2)',color:showArchived?'var(--warn)':'var(--text2)',border:`1px solid ${showArchived?'var(--warn)':'var(--border)'}`,padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {showArchived?'📂 Скрыть архив':'📦 Архив'}
                {!showArchived&&closedPeriods.length>0&&<span style={{marginLeft:5,background:'var(--warn)',color:'#fff',borderRadius:10,padding:'0 5px',fontSize:10}}>{closedPeriods.length}</span>}
              </button>
              <button onClick={()=>setShowClosePeriod(true)} style={{background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🔒 Закрыть период</button>
              <button onClick={runAutoAll} disabled={postingAll} style={{background:postingAll?'var(--text3)':'var(--accent)',color:'#fff',border:'none',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:postingAll?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:'var(--shadow-sm)'}}>{postingAll?'⏳ Разношу...':'⚡ Разнести все'}</button>
            </>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,padding:'16px 20px 0'}}>
        {[
          {label:'Всего записей',value:totalCount,color:'var(--text)'},
          {label:'Проведено',value:totalPosted,color:'var(--success)'},
          {label:'На проверке',value:needsReview,color:'var(--warn)',action:needsReview>0?()=>setFilterStatus('needs_review'):null},
          {label:'Итого KGS',value:totalKgs>0?fmt(totalKgs):'—',color:'var(--accent)',small:true},
        ].map(s=>(
          <div key={s.label} onClick={s.action||undefined} style={{background:'var(--surface)',borderRadius:'var(--radius)',padding:'14px 16px',border:`1px solid ${s.action?'var(--warn)':'var(--border)'}`,cursor:s.action?'pointer':'default',boxShadow:'var(--shadow-sm)'}}>
            <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{s.label}</div>
            <div style={{fontSize:s.small?16:24,fontWeight:800,color:s.color,marginTop:4,fontVariantNumeric:'tabular-nums'}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Табы */}
      <div style={{display:'flex',gap:4,padding:'14px 20px 0'}}>
        {[['journal','📋 Журнал'],['osv','📊 ОСВ']].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{padding:'7px 16px',borderRadius:'var(--radius-sm)',border:tab===key?'none':'1px solid var(--border)',fontFamily:'inherit',fontSize:13,fontWeight:700,cursor:'pointer',background:tab===key?'var(--accent)':'var(--surface)',color:tab===key?'#fff':'var(--text2)',boxShadow:tab===key?'var(--shadow-sm)':'none'}}>{label}</button>
        ))}
      </div>

      <div style={{padding:'14px 20px 40px'}}>

        {/* ── ЖУРНАЛ ── */}
        {tab==='journal'&&(
          <>
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                {[['','Все'],['posted','Проведено'],['needs_review','На проверке'],['rejected','Отклонено']].map(([val,label])=>(
                  <button key={val} onClick={()=>setFilterStatus(val)} style={{padding:'5px 12px',borderRadius:20,border:`1.5px solid ${filterStatus===val?'var(--accent)':'var(--border)'}`,background:filterStatus===val?'var(--accent-light)':'var(--surface)',color:filterStatus===val?'var(--accent-text)':'var(--text2)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{label}</button>
                ))}
                <button onClick={()=>setShowFilters(!showFilters)} style={{padding:'5px 12px',borderRadius:20,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text3)',fontSize:12,cursor:'pointer',fontFamily:'inherit',marginLeft:'auto'}}>{showFilters?'▲ Свернуть':'▼ Фильтры'}</button>
              </div>
              {showFilters&&(
                <div style={{display:'flex',gap:10,marginTop:8,flexWrap:'wrap',padding:'12px 14px',background:'var(--surface)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
                  <div><div style={LBL}>С даты</div><input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} style={INP2}/></div>
                  <div><div style={LBL}>По дату</div><input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} style={INP2}/></div>
                  <div><div style={LBL}>Контрагент</div><input placeholder="Поиск..." value={filterCounterparty} onChange={e=>setFilterCounterparty(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadJournal()} style={{...INP2,width:180}}/></div>
                  <button onClick={loadJournal} style={{alignSelf:'flex-end',background:'var(--accent)',color:'#fff',border:'none',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Применить</button>
                  <button onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterCounterparty('');setFilterStatus('')}} style={{alignSelf:'flex-end',background:'none',color:'var(--text3)',border:'1px solid var(--border)',padding:'7px 14px',borderRadius:'var(--radius-sm)',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Сброс</button>
                </div>
              )}
            </div>

            {loading?(
              <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>Загрузка...</div>
            ):entries.length===0?(
              <div style={{textAlign:'center',padding:48,background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)'}}>
                <div style={{fontSize:36,marginBottom:12}}>📭</div>
                <p style={{fontWeight:700,margin:'0 0 8px',color:'var(--text)'}}>Проводок пока нет</p>
                <p style={{fontSize:13,color:'var(--text3)',margin:'0 0 20px'}}>Отсканируйте документы — AI создаст проводки автоматически</p>
                <button onClick={()=>navigate(`/company/${companyId}/scanner`)} style={{background:'var(--accent)',color:'#fff',border:'none',padding:'10px 20px',borderRadius:'var(--radius)',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13,boxShadow:'var(--shadow)'}}>📷 Сканировать</button>
              </div>
            ):(
              <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
                <div style={{display:'grid',gridTemplateColumns:cols,gap:6,padding:'10px 14px',background:'var(--surface2)',fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',borderBottom:'1px solid var(--border)'}}>
                  {selectMode&&<div style={{display:'flex',alignItems:'center',justifyContent:'center'}}><input type="checkbox" onChange={e=>e.target.checked?setSelected(new Set(entries.map(x=>x.id))):setSelected(new Set())} checked={selected.size===entries.length&&entries.length>0}/></div>}
                  <div>№</div><div>Дата</div><div>Документ</div><div>Контрагент</div><div>Содержание</div><div>Дт</div><div>Кт</div><div style={{textAlign:'right'}}>Сумма</div><div>Статус</div>
                </div>

                {entries.map(e=>(
                  <div key={e.id}>
                    {/* Строка */}
                    <div onClick={()=>!selectMode&&setExpanded(expanded===e.id?null:e.id)}
                      style={{display:'grid',gridTemplateColumns:cols,gap:6,padding:'11px 14px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer',
                        opacity: e.is_archived ? 0.55 : 1,
                        background:selected.has(e.id)?'var(--accent-light)':e.is_archived?'var(--surface2)':e.status==='needs_review'?'var(--warn-light)':expanded===e.id?'var(--surface2)':'var(--surface)',transition:'background 0.1s'}}
                      onMouseEnter={ev=>{if(!selectMode&&!selected.has(e.id)&&e.status!=='needs_review')ev.currentTarget.style.background='var(--surface2)'}}
                      onMouseLeave={ev=>{if(!selectMode)ev.currentTarget.style.background=selected.has(e.id)?'var(--accent-light)':e.is_archived?'var(--surface2)':e.status==='needs_review'?'var(--warn-light)':expanded===e.id?'var(--surface2)':'var(--surface)'}}>

                      {selectMode&&<div style={{display:'flex',alignItems:'center',justifyContent:'center'}} onClick={ev=>ev.stopPropagation()}><input type="checkbox" checked={selected.has(e.id)} onChange={()=>toggleSelect(e.id)}/></div>}

                      <div style={{fontSize:11,color:'var(--text3)',fontWeight:600}}>{e.row_num}</div>
                      <div style={{fontSize:11,color:'var(--text2)'}}>{e.entry_date?.slice(2)}</div>
                      <div>{e.doc_number&&<div style={{fontSize:11,fontWeight:700,color:'var(--text)'}}>№{e.doc_number}</div>}{e.doc_type&&<div style={{fontSize:10,color:'var(--text3)'}}>{DOC_TYPE_LABEL[e.doc_type]||e.doc_type}</div>}</div>
                      <div style={{fontSize:11,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.counterparty||'—'}</div>
                      <div style={{fontSize:12,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description||'—'}</div>
                      <div><span style={{fontSize:12,fontWeight:800,color:'var(--accent)',background:'var(--accent-light)',padding:'2px 6px',borderRadius:'var(--radius-sm)'}}>{e.debit_account}</span></div>
                      <div><span style={{fontSize:12,fontWeight:800,color:'var(--success)',background:'var(--success-light)',padding:'2px 6px',borderRadius:'var(--radius-sm)'}}>{e.credit_account}</span></div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:12,fontWeight:700,color:'var(--text)',fontVariantNumeric:'tabular-nums'}}>{Number(e.amount).toLocaleString('ru-RU')}</div>
                        <div style={{fontSize:10,color:'var(--text3)'}}>{e.currency}</div>
                        {e.currency!=='KGS'&&e.amount_kgs&&<div style={{fontSize:10,color:'var(--accent)'}}>≈{Number(e.amount_kgs).toLocaleString('ru-RU')} KGS</div>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'flex-start'}}>
                        {e.is_archived
                          ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:'var(--surface2)',color:'var(--text3)',whiteSpace:'nowrap',border:'1px solid var(--border)'}}>📦 Архив</span>
                          : <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:S_BG[e.status]||'var(--surface2)',color:S_COLOR[e.status]||'var(--text3)',whiteSpace:'nowrap',border:`1px solid ${S_COLOR[e.status]||'var(--border)'}33`}}>{S_LABEL[e.status]||e.status}</span>
                        }
                        {!e.is_archived&&e.status==='needs_review'&&<button onClick={ev=>{ev.stopPropagation();setReviewEntry(e)}} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:'var(--radius-sm)',background:'var(--warn)',color:'#fff',border:'none',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>Проверить</button>}
                        {!e.is_archived&&<button onClick={ev=>{ev.stopPropagation();setReviewEntry(e)}} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:'var(--radius-sm)',background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>✏️ Исправить</button>}
                        {!e.is_archived&&<button onClick={ev=>{ev.stopPropagation();setDeleteEntry(e)}} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:'var(--radius-sm)',background:'none',color:'var(--error)',border:`1px solid var(--error)44`,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>🗑 Удалить</button>}
                        <div style={{fontSize:10,color:e.ai_confidence>=85?'var(--success)':e.ai_confidence>=60?'var(--warn)':'var(--error)'}}>{e.ai_confidence}% AI</div>
                      </div>
                    </div>

                    {/* ── РАСКРЫТАЯ ПАНЕЛЬ ── */}
                    {expanded===e.id&&(
                      <div style={{background:'var(--surface2)',borderBottom:'2px solid var(--accent)'}}>

                        {/* Реквизиты */}
                        <div style={{padding:'12px 14px 10px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                          <div><div style={LBL}>Дт счёт</div><div style={{fontSize:13,color:'var(--accent)',fontWeight:700}}>{e.debit_account} — {e.debit_account_name}</div></div>
                          <div><div style={LBL}>Кт счёт</div><div style={{fontSize:13,color:'var(--success)',fontWeight:700}}>{e.credit_account} — {e.credit_account_name}</div></div>
                          <div>
                            <div style={LBL}>ИНН контрагента</div>
                            <div style={{fontSize:13,color:'var(--text2)',display:'flex',alignItems:'center',gap:6}}>
                              {e.counterparty_inn||'—'}
                              {e.counterparty_inn&&<button onClick={ev=>{ev.stopPropagation();copyToClipboard(e.counterparty_inn,'ИНН скопирован')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:0}}>📋</button>}
                            </div>
                          </div>
                        </div>

                        {/* AI */}
                        {e.ai_reasoning&&<div style={{margin:'0 14px 10px',background:'var(--ai-light)',borderRadius:'var(--radius-sm)',padding:'8px 12px',fontSize:12,color:'var(--ai-text)',border:'1px solid var(--border)'}}>🤖 <strong style={{color:'var(--ai)'}}>AI ({e.ai_confidence}%):</strong> {e.ai_reasoning}</div>}
                        {e.reviewed_by&&<div style={{margin:'0 14px 6px',fontSize:11,color:'var(--success)'}}>✅ Проверено: {e.reviewed_by}</div>}

                        {/* ── КОНТЕКСТНЫЕ ДЕЙСТВИЯ ── */}
                        <div style={{padding:'10px 14px 14px',borderTop:'1px solid var(--border)',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',marginRight:4}}>Действия:</div>
                          {e.document_id&&<CtxBtn icon="📄" label="Оригинал документа" onClick={ev=>{ev.stopPropagation();setDocViewEntry(e)}}/>}
                          {e.counterparty&&<CtxBtn icon="📋" label="Копировать контрагента" onClick={ev=>{ev.stopPropagation();copyToClipboard(e.counterparty,'Контрагент скопирован')}}/>}
                          {e.counterparty_inn&&<CtxBtn icon="🔢" label="Копировать ИНН" onClick={ev=>{ev.stopPropagation();copyToClipboard(e.counterparty_inn,'ИНН скопирован')}}/>}
                          <CtxBtn icon="🏦" label="Перейти в банк" onClick={ev=>{ev.stopPropagation();navigate(`/company/${companyId}/bank`)}}/>
                          {e.counterparty&&<CtxBtn icon="🔍" label={`Все записи: ${e.counterparty.split(' ').slice(0,2).join(' ')}`} onClick={ev=>{ev.stopPropagation();setFilterCounterparty(e.counterparty);setShowFilters(true);setExpanded(null)}}/>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Счётчик + кнопка «Загрузить ещё» */}
            {entries.length>0&&(
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderTop:'1px solid var(--border)',background:'var(--surface2)',borderRadius:'0 0 var(--radius-lg) var(--radius-lg)'}}>
                <div style={{fontSize:12,color:'var(--text3)'}}>
                  Показано <strong style={{color:'var(--text)'}}>{entries.length}</strong> из <strong style={{color:'var(--text)'}}>{totalEntries}</strong> проводок
                </div>
                {hasMore&&(
                  <button onClick={loadMore} disabled={loadingMore}
                    style={{fontSize:12,fontWeight:700,padding:'6px 16px',borderRadius:'var(--radius-sm)',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--accent)',cursor:loadingMore?'not-allowed':'pointer',fontFamily:'inherit',opacity:loadingMore?0.6:1}}>
                    {loadingMore?'⏳ Загружаю...':'Загрузить ещё →'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── ОСВ: Оборотно-сальдовая ведомость ── */}
        {tab==='osv'&&(
          <div>
            {/* Период */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
              <input type="date" value={osvFrom} onChange={e=>setOsvFrom(e.target.value)} style={INP2}/>
              <span style={{color:'var(--text3)'}}>—</span>
              <input type="date" value={osvTo} onChange={e=>setOsvTo(e.target.value)} style={INP2}/>
              <div style={{display:'flex',background:'var(--surface2)',borderRadius:'var(--radius-sm)',padding:2,border:'1px solid var(--border)'}}>
                {[['','Всё'],['official','Официально'],['internal','Внутренне']].map(([val,label])=>(
                  <button key={val} onClick={()=>setOsvScope(val)}
                    style={{background:osvScope===val?'var(--accent)':'transparent',color:osvScope===val?'#fff':'var(--text3)',border:'none',padding:'6px 12px',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={loadOsv} style={{background:'var(--accent)',color:'#fff',border:'none',padding:'8px 16px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'var(--shadow-sm)'}}>
                Сформировать
              </button>
              {osv&&!osv.balanced&&(
                <span style={{fontSize:12,color:'var(--error)',fontWeight:700,background:'var(--error-light)',padding:'4px 10px',borderRadius:'var(--radius-sm)'}}>
                  ⚠️ Обороты Дт ≠ Кт — проверьте проводки
                </span>
              )}
            </div>

            {osvLoading?(
              <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>⏳ Формирую ведомость...</div>
            ):!osv||osv.rows.length===0?(
              <div style={{textAlign:'center',padding:40,background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',color:'var(--text3)'}}>
                Нет проведённых операций за период
              </div>
            ):(
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'auto',boxShadow:'var(--shadow-sm)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:820}}>
                  <thead>
                    <tr style={{background:'var(--surface2)'}}>
                      <th rowSpan={2} style={{padding:'8px 10px',textAlign:'left',borderBottom:'2px solid var(--border)',borderRight:'1px solid var(--border)',fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',minWidth:200}}>Счёт</th>
                      <th colSpan={2} style={{padding:'6px 10px',textAlign:'center',borderBottom:'1px solid var(--border)',borderRight:'1px solid var(--border)',fontSize:10,color:'var(--text3)',textTransform:'uppercase'}}>Сальдо начальное</th>
                      <th colSpan={2} style={{padding:'6px 10px',textAlign:'center',borderBottom:'1px solid var(--border)',borderRight:'1px solid var(--border)',fontSize:10,color:'var(--text3)',textTransform:'uppercase'}}>Обороты за период</th>
                      <th colSpan={2} style={{padding:'6px 10px',textAlign:'center',borderBottom:'1px solid var(--border)',fontSize:10,color:'var(--text3)',textTransform:'uppercase'}}>Сальдо конечное</th>
                    </tr>
                    <tr style={{background:'var(--surface2)'}}>
                      {['Дебет','Кредит','Дебет','Кредит','Дебет','Кредит'].map((h,i)=>(
                        <th key={i} style={{padding:'5px 10px',textAlign:'right',borderBottom:'2px solid var(--border)',borderRight:i%2===1?'1px solid var(--border)':'none',fontSize:10,color:'var(--text3)',minWidth:90}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {osv.rows.map(r=>(
                      <tr key={r.account}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid var(--border)',borderRight:'1px solid var(--border)'}}>
                          <span style={{fontWeight:700,color:'var(--accent)',marginRight:6}}>{r.account}</span>
                          <span style={{color:'var(--text2)',fontSize:11}}>{r.account_name}</span>
                        </td>
                        {[r.opening_debit,r.opening_credit,r.period_debit,r.period_credit,r.closing_debit,r.closing_credit].map((v,i)=>(
                          <td key={i} style={{padding:'7px 10px',textAlign:'right',borderBottom:'1px solid var(--border)',borderRight:i%2===1?'1px solid var(--border)':'none',fontVariantNumeric:'tabular-nums',color:v?'var(--text)':'var(--text4)',fontWeight:v?600:400}}>
                            {v?v.toLocaleString('ru-RU',{minimumFractionDigits:2}):'—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'var(--surface2)'}}>
                      <td style={{padding:'9px 10px',fontWeight:800,borderTop:'2px solid var(--border)',borderRight:'1px solid var(--border)',color:'var(--text)'}}>ИТОГО</td>
                      {[osv.totals.opening_debit,osv.totals.opening_credit,osv.totals.period_debit,osv.totals.period_credit,osv.totals.closing_debit,osv.totals.closing_credit].map((v,i)=>(
                        <td key={i} style={{padding:'9px 10px',textAlign:'right',fontWeight:800,borderTop:'2px solid var(--border)',borderRight:i%2===1?'1px solid var(--border)':'none',fontVariantNumeric:'tabular-nums',color:'var(--text)'}}>
                          {v?v.toLocaleString('ru-RU',{minimumFractionDigits:2}):'—'}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ОТЧЁТ ЗА ДЕНЬ (legacy, вкладка скрыта) ── */}
        {tab==='report'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} style={INP2}/>
              <button onClick={loadReport} style={{background:'var(--accent)',color:'#fff',border:'none',padding:'8px 16px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'var(--shadow-sm)'}}>Показать</button>
            </div>
            {loading?<div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>Загрузка...</div>:report&&(
              <div>
                <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',padding:'16px 18px',marginBottom:12,boxShadow:'var(--shadow-sm)'}}>
                  <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:'var(--text)'}}>📊 {report.report_date} · {report.company}</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                    {[['Всего',report.summary?.total_entries,'var(--text)'],['Проведено',report.summary?.posted,'var(--success)'],['На проверке',report.summary?.needs_review,'var(--warn)'],['Итого KGS',fmt(report.summary?.total_amount_kgs),'var(--accent)']].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:'center'}}><div style={{fontSize:20,fontWeight:800,color:c,fontVariantNumeric:'tabular-nums'}}>{v??0}</div><div style={{fontSize:10,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',marginTop:2}}>{l}</div></div>
                    ))}
                  </div>
                </div>
                {report.needs_review?.length>0&&(
                  <div style={{background:'var(--warn-light)',border:'1px solid var(--warn)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:12}}>
                    <div style={{padding:'10px 16px',borderBottom:'1px solid var(--warn)',fontWeight:700,fontSize:13,color:'var(--warn)'}}>⚠️ Требуют проверки ({report.needs_review.length})</div>
                    {report.needs_review.map(e=>(
                      <div key={e.id} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div><div style={{fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:2}}>{e.doc_number?`№${e.doc_number}`:'—'} · {e.counterparty||'—'}</div><div style={{fontSize:11,color:'var(--text2)'}}>{e.description}</div></div>
                        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',flexShrink:0,marginLeft:12,fontVariantNumeric:'tabular-nums'}}>{fmt(e.amount,e.currency)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {Object.keys(report.totals_by_debit_account||{}).length>0&&(
                  <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',overflow:'hidden',marginBottom:12,boxShadow:'var(--shadow-sm)'}}>
                    <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13,color:'var(--text)'}}>Обороты по дебетовым счетам</div>
                    {Object.entries(report.totals_by_debit_account).map(([acc,amt])=>(
                      <div key={acc} style={{display:'flex',justifyContent:'space-between',padding:'9px 16px',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text2)'}}>{acc}</span><span style={{fontWeight:700,color:'var(--text)',fontVariantNumeric:'tabular-nums'}}>{fmt(amt)} KGS</span></div>
                    ))}
                  </div>
                )}
                {report.posted_entries?.length>0&&(
                  <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
                    <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13,color:'var(--text)'}}>✅ Проведённые операции ({report.posted_entries.length})</div>
                    {report.posted_entries.map(e=>(
                      <div key={e.id} style={{padding:'11px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',gap:8,marginBottom:3,flexWrap:'wrap'}}>
                            {e.doc_number&&<span style={{fontSize:11,fontWeight:700,color:'var(--accent)'}}>№{e.doc_number}</span>}
                            {e.counterparty&&<span style={{fontSize:11,color:'var(--text2)'}}>{e.counterparty}</span>}
                          </div>
                          <div style={{fontSize:12,color:'var(--text)',marginBottom:4}}>{e.description}</div>
                          <div style={{fontSize:11}}>
                            <span style={{color:'var(--accent)',background:'var(--accent-light)',padding:'1px 6px',borderRadius:'var(--radius-sm)',fontWeight:700}}>Дт {e.debit?.split(' ')[0]}</span>
                            <span style={{color:'var(--text3)',margin:'0 5px'}}>→</span>
                            <span style={{color:'var(--success)',background:'var(--success-light)',padding:'1px 6px',borderRadius:'var(--radius-sm)',fontWeight:700}}>Кт {e.credit?.split(' ')[0]}</span>
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',fontVariantNumeric:'tabular-nums'}}>{fmt(e.amount,e.currency)}</div>
                          {e.currency!=='KGS'&&e.amount_kgs&&<div style={{fontSize:11,color:'var(--accent)'}}>≈{fmt(e.amount_kgs)} KGS</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {report.summary?.total_entries===0&&<div style={{textAlign:'center',padding:40,background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',color:'var(--text3)'}}>За этот день операций нет</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модал удаления */}
      {deleteEntry&&(
        <div style={{position:'fixed',inset:0,background:'rgba(30,42,62,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--error)',borderRadius:'var(--radius-lg)',padding:24,maxWidth:420,width:'100%',boxShadow:'var(--shadow-lg)'}}>
            <div style={{fontSize:28,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:800,fontSize:15,color:'var(--text)',marginBottom:8}}>Удалить проводку?</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>{deleteEntry.doc_number?`№${deleteEntry.doc_number}`:'Без номера'} · {deleteEntry.counterparty||'—'}<br/>Дт <strong style={{color:'var(--accent)'}}>{deleteEntry.debit_account}</strong> → Кт <strong style={{color:'var(--success)'}}>{deleteEntry.credit_account}</strong> · {Number(deleteEntry.amount).toLocaleString('ru-RU')} {deleteEntry.currency}</div>
            <div style={{background:'var(--error-light)',border:'1px solid var(--error)',borderRadius:'var(--radius-sm)',padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--error)'}}>⚠️ Документ вернётся в статус «Ожидает разноски»</div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>handleDelete(deleteEntry.id)} disabled={deleting} style={{flex:1,background:'var(--error)',color:'#fff',border:'none',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>{deleting?'Удаляю...':'Да, удалить'}</button>
              <button onClick={()=>setDeleteEntry(null)} style={{flex:1,background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:12,borderRadius:'var(--radius)',cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {reviewEntry&&<ReviewModal entry={reviewEntry} onClose={()=>setReviewEntry(null)} onDone={()=>{setReviewEntry(null);loadJournal()}}/>}
      {docViewEntry&&<DocViewModal entry={docViewEntry} onClose={()=>setDocViewEntry(null)}/>}

      {/* ── Модал: Закрыть период ─────────────────────────────────── */}
      {showClosePeriod&&(
        <div onClick={()=>!cpClosing&&setShowClosePeriod(false)}
          style={{position:'fixed',inset:0,background:'rgba(30,42,62,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',width:'100%',maxWidth:460,boxShadow:'var(--shadow-lg)',overflow:'hidden'}}>

            {/* Шапка */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:800,fontSize:15,color:'var(--text)'}}>🔒 Закрыть отчётный период</div>
              <button onClick={()=>setShowClosePeriod(false)} style={{background:'none',border:'none',fontSize:20,color:'var(--text3)',cursor:'pointer',lineHeight:1}}>×</button>
            </div>

            <div style={{padding:'20px'}}>
              {/* Выбор периода */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Выберите период</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 100px',gap:10}}>
                  <select value={cpMonth} onChange={e=>{setCpMonth(+e.target.value)}}
                    style={{...INP2,width:'100%'}}>
                    {MONTHS_RU.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <select value={cpYear} onChange={e=>{setCpYear(+e.target.value)}}
                    style={{...INP2,width:'100%'}}>
                    {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Предпросмотр */}
              <div style={{background:'var(--surface2)',borderRadius:'var(--radius)',padding:'14px 16px',marginBottom:16,border:'1px solid var(--border)'}}>
                {cpPreview===null
                  ? <div style={{fontSize:13,color:'var(--text3)'}}>⏳ Считаю...</div>
                  : cpPreview.count===0
                    ? <div style={{fontSize:13,color:'var(--text3)'}}>
                        За <strong>{cpPreview.period_label}</strong> нет проводок для закрытия
                      </div>
                    : <>
                        <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:8}}>
                          За <span style={{color:'var(--accent)'}}>{cpPreview.period_label}</span> будет заархивировано:
                        </div>
                        <div style={{fontSize:22,fontWeight:800,color:'var(--accent)',marginBottom:8}}>{cpPreview.count} проводок</div>
                        <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.6}}>
                          ✅ Только статус «Проведено»<br/>
                          ⚠️ «На проверке» — <strong>не архивируются</strong><br/>
                          📦 После закрытия скрываются в основном журнале
                        </div>
                      </>
                }
              </div>

              {/* Список уже закрытых периодов — клик = переоткрыть */}
              {closedPeriods.length>0&&(
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
                    Уже закрытые периоды <span style={{fontWeight:400,textTransform:'none'}}>(нажмите чтобы переоткрыть)</span>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {closedPeriods.map(p=>(
                      <button key={`${p.year}-${p.month}`}
                        onClick={()=>handleReopenPeriod(p.year,p.month)}
                        title={`Переоткрыть ${p.period_label}`}
                        style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text3)',cursor:'pointer',fontFamily:'inherit',transition:'all 0.12s'}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--warn)';e.currentTarget.style.color='var(--warn)'}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text3)'}}>
                        📦 {p.period_label} ({p.count}) ↩
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Кнопки */}
              <div style={{display:'flex',gap:10}}>
                <button
                  onClick={handleClosePeriod}
                  disabled={cpClosing||!cpPreview||cpPreview.count===0}
                  style={{flex:2,background:(!cpPreview||cpPreview.count===0)?'var(--text4)':'var(--accent)',color:'#fff',border:'none',padding:12,borderRadius:'var(--radius)',fontSize:14,fontWeight:800,cursor:(!cpPreview||cpPreview.count===0)?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:cpPreview?.count>0?'var(--shadow)':'none'}}>
                  {cpClosing?'⏳ Закрываю...':'🔒 Закрыть период'}
                </button>
                <button onClick={()=>setShowClosePeriod(false)}
                  style={{flex:1,background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:12,borderRadius:'var(--radius)',cursor:'pointer',fontFamily:'inherit'}}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

const LBL={fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,display:'block'}
const INP={width:'100%',background:'var(--surface)',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 12px',color:'var(--text)',fontSize:13,fontFamily:'Manrope,sans-serif',boxSizing:'border-box',outline:'none'}
const INP2={background:'var(--surface)',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'7px 10px',color:'var(--text)',fontSize:12,fontFamily:'Manrope,sans-serif',outline:'none'}
