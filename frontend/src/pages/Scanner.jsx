import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { scanner, posting } from '../api/client'
import NavBar from '../components/NavBar'
import { useToast } from '../hooks/useToast'
import Toast from '../components/Toast'

const DOC_TYPES = [
  ['invoice','Счёт на оплату'],['act','Акт'],['esf','ЭСФ'],
  ['ttn','Накладная (ТТН)'],['contract','Договор'],['receipt','Квитанция'],
  ['payment_order','Платёжное поручение'],['bank_statement','Выписка банка'],
  ['payroll','Зарплатная ведомость'],['other','Прочее']
]
const CURRENCIES = ['KGS','RUB','USD','EUR','TRY']

function confColor(n) {
  if (n >= 85) return 'var(--success)'
  if (n >= 60) return 'var(--warn)'
  return 'var(--error)'
}

const LBL = {display:'block', fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5}
const INP = {width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'Manrope, sans-serif', boxSizing:'border-box', outline:'none'}

export default function Scanner() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [state, setState] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [recognized, setRecognized] = useState(null)
  const [filePath, setFilePath] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [sourceType, setSourceType] = useState(null)
  const [aiRawJson, setAiRawJson] = useState(null)
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [form, setForm] = useState({})
  const [savedResult, setSavedResult] = useState(null)
  const [previewPosting, setPreviewPosting] = useState(null)
  const [postingLoading, setPostingLoading] = useState(false)
  // Редактируемые счета
  const [editDebit, setEditDebit] = useState('')
  const [editCredit, setEditCredit] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [accounts, setAccounts] = useState([])

  // Пакетный режим
  const [batchQueue, setBatchQueue] = useState([])
  const [batchDone, setBatchDone] = useState(false)

  const { toasts, showToast, removeToast } = useToast()

  // Загружаем план счетов при открытии страницы, не ждём распознавания
  useEffect(() => {
    posting.chartOfAccounts().then(res => setAccounts(res.data)).catch(() => {})
  }, [])

  function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setError('')
    setRecognized(null)
    setDuplicateWarning(null)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
    recognizeFile(file)
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList).filter(Boolean)
    if (files.length === 0) return
    if (files.length === 1) { handleFile(files[0]); return }
    const items = files.map(f => ({ file: f, name: f.name, status: 'waiting', result: null, error: null }))
    setBatchQueue(items)
    setBatchDone(false)
    setState('batch')
    processBatch(items)
  }

  async function processBatch(items) {
    for (let i = 0; i < items.length; i++) {
      setBatchQueue(q => q.map((it, idx) => idx === i ? { ...it, status: 'scanning' } : it))
      try {
        const fd = new FormData()
        fd.append('file', items[i].file)
        const res = await scanner.recognize(companyId, fd)
        const data = res.data
        const r = data.recognition
        const payload = {
          file_path: data.file_path,
          doc_type: r.doc_type || 'other',
          doc_number: r.doc_number || null,
          doc_date: r.doc_date || null,
          counterparty: r.counterparty || null,
          counterparty_inn: r.counterparty_inn || null,
          amount: r.amount ? parseFloat(r.amount) : null,
          vat_amount: parseFloat(r.vat_amount) || 0,
          currency: r.currency || 'KGS',
          operation_type: r.operation_type || null,
          summary: r.summary || null,
          ai_raw_json: data.ai_raw_json,
          auto_post: true
        }
        const confirmRes = await scanner.confirm(companyId, payload)
        setBatchQueue(q => q.map((it, idx) => idx === i
          ? { ...it, status: 'done', result: confirmRes.data, recognition: r }
          : it))
      } catch(e) {
        setBatchQueue(q => q.map((it, idx) => idx === i
          ? { ...it, status: 'error', error: e.response?.data?.detail || e.message }
          : it))
      }
    }
    setBatchDone(true)
  }

  function resetBatch() {
    setBatchQueue([])
    setBatchDone(false)
    reset()
  }

  async function recognizeFile(file) {
    setState('scanning')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await scanner.recognize(companyId, fd)
      const data = res.data
      setFilePath(data.file_path)
      setFileUrl(scanner.fileUrl(data.file_path))
      setSourceType(data.source_type)
      setAiRawJson(data.ai_raw_json)
      setDuplicateWarning(data.duplicate_warning)
      const r = data.recognition
      setForm({
        doc_type: r.doc_type || 'other',
        doc_number: r.doc_number || '',
        doc_date: r.doc_date || '',
        counterparty: r.counterparty || '',
        counterparty_inn: r.counterparty_inn || '',
        amount: r.amount || '',
        vat_amount: r.vat_amount || 0,
        currency: r.currency || 'KGS',
        operation_type: r.operation_type || '',
        summary: r.summary || '',
        auto_post: true,
        scope: 'official'
      })
      setRecognized(r)
      setState('preview')
      // Запрашиваем предварительную разноску
      setPostingLoading(true)
      scanner.previewPosting(companyId, {
        doc_type: r.doc_type,
        counterparty: r.counterparty,
        amount: r.amount,
        currency: r.currency,
        operation_type: r.operation_type,
        summary: r.summary
      }).then(res => {
        setPreviewPosting(res.data)
        setEditDebit(res.data.debit_account || '')
        setEditCredit(res.data.credit_account || '')
        setEditDesc(res.data.description || '')
      }).catch(() => {}).finally(() => setPostingLoading(false))
    } catch(e) {
      setError(e.response?.data?.detail || 'Ошибка при распознавании')
      setState('error')
    }
  }

  async function handleConfirm() {
    setState('saving')
    try {
      const payload = {
        file_path: filePath,
        doc_type: form.doc_type,
        doc_number: form.doc_number || null,
        doc_date: form.doc_date || null,
        counterparty: form.counterparty || null,
        counterparty_inn: form.counterparty_inn || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        vat_amount: parseFloat(form.vat_amount) || 0,
        currency: form.currency,
        operation_type: form.operation_type || null,
        summary: form.summary || null,
        ai_raw_json: aiRawJson,
        auto_post: form.auto_post,
        scope: form.scope || 'official'
      }
      const res = await scanner.confirm(companyId, payload)
      setSavedResult(res.data)
      setState('done')
    } catch(e) {
      setError(e.response?.data?.detail || 'Ошибка при сохранении')
      setState('error')
    }
  }

  function reset() {
    setState('idle')
    setPreview(null)
    setFileName('')
    setError('')
    setRecognized(null)
    setFilePath(null)
    setFileUrl(null)
    setSourceType(null)
    setAiRawJson(null)
    setDuplicateWarning(null)
    setForm({})
    setSavedResult(null)
    setPreviewPosting(null)
    setEditDebit('')
    setEditCredit('')
    setEditDesc('')
    setAccountSearch('')
  }

  function handleDrop(e) {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  const canConfirm = form.amount && (form.counterparty || form.counterparty_inn) && state !== 'saving'

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', fontFamily:'Manrope, sans-serif'}}>

      <NavBar companyId={companyId} current="scanner" />

      {/* Шапка модуля */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)'}}>
        <div>
          <div style={{fontWeight:800, fontSize:15, color:'var(--text)'}}>📷 Сканер документов</div>
          <div style={{fontSize:11, color:'var(--text3)'}}>Загрузите фото или PDF — AI распознаёт, вы проверяете</div>
        </div>
      </div>

      <div style={{maxWidth: state === 'preview' || state === 'saving' ? 1100 : 640, margin:'0 auto', padding:'20px 16px'}}>

        {/* ── IDLE ── */}
        {state === 'idle' && (
          <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
            style={{border:'2px dashed var(--border2)', borderRadius:'var(--radius-lg)', padding:'40px 24px', textAlign:'center', background:'var(--surface)', cursor:'pointer', boxShadow:'var(--shadow-sm)'}}>
            <div style={{fontSize:48, marginBottom:12}}>📄</div>
            <p style={{margin:'0 0 6px', fontSize:15, fontWeight:700, color:'var(--text)'}}>Перетащите файлы или выберите способ</p>
            <p style={{margin:'0 0 24px', fontSize:12, color:'var(--text3)'}}>PDF, JPEG, PNG, WEBP, HEIC · Можно выбрать несколько файлов сразу</p>
            <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
              <button onClick={()=>cameraInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:8, background:'var(--accent)', color:'#fff', border:'none', padding:'12px 20px', borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                📷 Снять камерой
              </button>
              <button onClick={()=>fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:8, background:'var(--surface2)', color:'var(--text)', border:'1px solid var(--border)', padding:'12px 20px', borderRadius:'var(--radius)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📁 Загрузить файл
              </button>
            </div>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.heic,.heif" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>
          </div>
        )}

        {/* ── SCANNING ── */}
        {state === 'scanning' && (
          <div style={{textAlign:'center', padding:'48px 24px', background:'var(--surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)'}}>
            {preview && <img src={preview} alt="preview" style={{maxWidth:'100%', maxHeight:180, borderRadius:'var(--radius)', marginBottom:20, objectFit:'contain'}}/>}
            <div style={{fontSize:36, marginBottom:16}}>🔍</div>
            <p style={{fontSize:16, fontWeight:700, margin:'0 0 8px', color:'var(--text)'}}>AI читает документ...</p>
            <p style={{fontSize:13, color:'var(--text3)', margin:'0 0 20px'}}>{fileName}</p>
            <div style={{height:4, background:'var(--border)', borderRadius:2, overflow:'hidden'}}>
              <div style={{height:'100%', background:'var(--accent)', borderRadius:2, animation:'progress 2s ease-in-out infinite', width:'60%'}}/>
            </div>
          </div>
        )}

        {/* ── BATCH ── */}
        {state === 'batch' && (
          <div style={{background:'var(--surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
            {/* Шапка */}
            <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <div style={{fontWeight:800, fontSize:15, color:'var(--text)'}}>📦 Пакетная обработка</div>
                <div style={{fontSize:12, color:'var(--text3)', marginTop:2}}>
                  {batchQueue.filter(i=>i.status==='done').length} из {batchQueue.length} обработано
                </div>
              </div>
              {batchDone && (
                <div style={{background:'var(--success-light)', color:'var(--success)', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, border:'1px solid var(--success)'}}>
                  ✅ Готово
                </div>
              )}
            </div>

            {/* Прогресс-бар */}
            {!batchDone && (
              <div style={{height:3, background:'var(--border)'}}>
                <div style={{
                  height:'100%', background:'var(--accent)', borderRadius:2,
                  width: `${(batchQueue.filter(i=>i.status==='done'||i.status==='error').length / batchQueue.length) * 100}%`,
                  transition:'width 0.3s ease'
                }}/>
              </div>
            )}

            {/* Список файлов */}
            <div style={{maxHeight:420, overflowY:'auto'}}>
              {batchQueue.map((item, idx) => (
                <div key={idx} style={{
                  display:'flex', alignItems:'flex-start', gap:12, padding:'12px 18px',
                  borderBottom:'1px solid var(--border)',
                  background: item.status==='scanning' ? 'var(--accent-light)' : 'transparent'
                }}>
                  {/* Статус-иконка */}
                  <div style={{fontSize:18, flexShrink:0, marginTop:1}}>
                    {item.status==='waiting'  && <span style={{color:'var(--text4)'}}>⏳</span>}
                    {item.status==='scanning' && <span style={{color:'var(--accent)'}} className="spin">⚙</span>}
                    {item.status==='done'     && <span style={{color:'var(--success)'}}>✅</span>}
                    {item.status==='error'    && <span style={{color:'var(--error)'}}>❌</span>}
                  </div>
                  {/* Контент */}
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</div>
                    {item.status==='scanning' && <div style={{fontSize:12, color:'var(--accent)', marginTop:2}}>AI читает документ...</div>}
                    {item.status==='done' && item.recognition && (
                      <div style={{fontSize:12, color:'var(--text2)', marginTop:3, display:'flex', gap:8, flexWrap:'wrap'}}>
                        {item.recognition.counterparty && <span>{item.recognition.counterparty}</span>}
                        {item.recognition.amount && <span style={{fontWeight:700, color:'var(--success)'}}>{Number(item.recognition.amount).toLocaleString('ru-RU')} {item.recognition.currency||'KGS'}</span>}
                        {item.result?.posting?.debit && <span style={{color:'var(--text3)'}}>Дт{item.result.posting.debit}/Кт{item.result.posting.credit}</span>}
                        {item.result?.esf_id && <span style={{color:'var(--accent)', fontWeight:700}}>⚡ЭСФ</span>}
                      </div>
                    )}
                    {item.status==='error' && <div style={{fontSize:12, color:'var(--error)', marginTop:2}}>{item.error}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Итог и кнопки */}
            {batchDone && (
              <div style={{padding:'16px 18px', borderTop:'1px solid var(--border)', background:'var(--surface2)'}}>
                <div style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
                  <span style={{background:'var(--success-light)', color:'var(--success)', padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700}}>
                    ✅ {batchQueue.filter(i=>i.status==='done').length} сохранено
                  </span>
                  {batchQueue.filter(i=>i.status==='error').length > 0 && (
                    <span style={{background:'var(--error-light)', color:'var(--error)', padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700}}>
                      ❌ {batchQueue.filter(i=>i.status==='error').length} ошибок
                    </span>
                  )}
                  {batchQueue.filter(i=>i.result?.esf_id).length > 0 && (
                    <span style={{background:'var(--accent-light)', color:'var(--accent)', padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700}}>
                      ⚡ {batchQueue.filter(i=>i.result?.esf_id).length} ЭСФ
                    </span>
                  )}
                </div>
                <div style={{display:'flex', gap:10}}>
                  <button onClick={resetBatch}
                    style={{flex:1, background:'var(--accent)', color:'#fff', border:'none', padding:12, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                    📷 Загрузить ещё
                  </button>
                  <button onClick={()=>navigate(`/company/${companyId}/journal`)}
                    style={{flex:1, background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', padding:12, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                    📒 В журнал
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {state === 'error' && (
          <div style={{background:'var(--error-light)', border:'1px solid var(--error)', borderRadius:'var(--radius-lg)', padding:20, textAlign:'center'}}>
            <div style={{fontSize:36, marginBottom:8}}>⚠️</div>
            <p style={{color:'var(--error)', fontWeight:600, margin:'0 0 16px'}}>{error}</p>
            <button onClick={reset} style={{background:'var(--accent)', color:'#fff', border:'none', padding:'10px 24px', borderRadius:'var(--radius)', fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:13, boxShadow:'var(--shadow)'}}>
              Попробовать снова
            </button>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {(state === 'preview' || state === 'saving') && recognized && (
          <div style={{display:'grid', gridTemplateColumns: (fileUrl && sourceType !== 'pdf') ? '1fr 1fr' : '1fr', gap:20, alignItems:'start'}}>

            {/* Левая колонка — только для изображений */}
            {fileUrl && sourceType !== 'pdf' && (
              <div style={{position:'sticky', top:20}}>
                <div style={{fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>📄 Оригинал документа</div>
                <img src={fileUrl || preview} alt="document"
                  style={{width:'100%', borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)'}}/>
              </div>
            )}

            {/* Правая колонка — форма */}
            <div>
              {/* Имя файла + кнопка просмотра PDF */}
              {fileName && (
                <div style={{fontSize:11, color:'var(--text3)', marginBottom:8, padding:'6px 10px', background:'var(--surface2)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                  <span>📎 {fileName}</span>
                  {fileUrl && sourceType === 'pdf' && (
                    <a href={fileUrl} target="_blank" rel="noreferrer"
                      style={{fontSize:11, color:'var(--accent)', fontWeight:700, textDecoration:'none', whiteSpace:'nowrap', flexShrink:0}}>
                      Открыть →
                    </a>
                  )}
                </div>
              )}

              {/* Предупреждение о дубле */}
              {duplicateWarning && (
                <div style={{background:'var(--warn-light)', border:'1px solid var(--warn)', borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:14}}>
                  <div style={{fontWeight:700, color:'var(--warn)', marginBottom:6}}>
                    ⚠️ Похожий документ уже {duplicateWarning.already_posted ? 'разнесён в журнал' : 'загружен'}
                  </div>
                  <div style={{fontSize:12, color:'var(--text2)'}}>
                    {duplicateWarning.counterparty} · {duplicateWarning.amount} {duplicateWarning.currency}
                    {duplicateWarning.doc_number && ` · №${duplicateWarning.doc_number}`}
                  </div>
                  <div style={{fontSize:12, color:'var(--warn)', marginTop:6}}>
                    Если документ другой — исправьте данные и нажмите «Подтвердить»
                  </div>
                </div>
              )}

              {/* Карточка предпросмотра */}
              <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', marginBottom:14, boxShadow:'var(--shadow-sm)'}}>
                <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface2)'}}>
                  <div style={{fontWeight:800, fontSize:14, color:'var(--text)'}}>Предпросмотр — проверьте и исправьте</div>
                  <div style={{background:confColor(recognized.confidence)+'22', color:confColor(recognized.confidence), padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, border:`1px solid ${confColor(recognized.confidence)}44`}}>
                    {recognized.confidence}% AI
                  </div>
                </div>

                {/* Поставщик / Покупатель */}
                {(recognized.supplier_name || recognized.buyer_name) && (
                  <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <div>
                      <div style={LBL}>Поставщик</div>
                      <div style={{fontSize:13, color:'var(--success)', fontWeight:700}}>{recognized.supplier_name||'—'}</div>
                      {recognized.supplier_inn&&<div style={{fontSize:11, color:'var(--text3)'}}>ИНН {recognized.supplier_inn}</div>}
                    </div>
                    <div>
                      <div style={LBL}>Покупатель</div>
                      <div style={{fontSize:13, color:'var(--accent)', fontWeight:700}}>{recognized.buyer_name||'—'}</div>
                      {recognized.buyer_inn&&<div style={{fontSize:11, color:'var(--text3)'}}>ИНН {recognized.buyer_inn}</div>}
                    </div>
                  </div>
                )}

                <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', gap:12}}>
                  <div>
                    <label style={LBL}>Тип документа</label>
                    <select value={form.doc_type} onChange={e=>setForm(f=>({...f,doc_type:e.target.value}))} style={INP}>
                      {DOC_TYPES.map(([val,label])=><option key={val} value={val}>{label}</option>)}
                    </select>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <div><label style={LBL}>Номер документа</label><input value={form.doc_number} onChange={e=>setForm(f=>({...f,doc_number:e.target.value}))} placeholder="000006049" style={INP}/></div>
                    <div><label style={LBL}>Дата</label><input type="date" value={form.doc_date} onChange={e=>setForm(f=>({...f,doc_date:e.target.value}))} style={INP}/></div>
                  </div>
                  <div>
                    <label style={LBL}>Контрагент (поставщик) *</label>
                    <input value={form.counterparty} onChange={e=>setForm(f=>({...f,counterparty:e.target.value}))} placeholder="ОсОО Ярос Групп" style={INP}/>
                  </div>
                  <div>
                    <label style={LBL}>ИНН контрагента</label>
                    <input value={form.counterparty_inn} onChange={e=>setForm(f=>({...f,counterparty_inn:e.target.value}))} placeholder="01011200510144" style={INP}/>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 120px', gap:12}}>
                    <div><label style={LBL}>Сумма *</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="9350.00" style={INP}/></div>
                    <div>
                      <label style={LBL}>Валюта</label>
                      <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={INP}>
                        {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Сумма НДС</label>
                    <input type="number" value={form.vat_amount} onChange={e=>setForm(f=>({...f,vat_amount:e.target.value}))} placeholder="0" style={INP}/>
                  </div>
                  <div>
                    <label style={LBL}>Тип операции</label>
                    <input value={form.operation_type} onChange={e=>setForm(f=>({...f,operation_type:e.target.value}))} placeholder="аренда, транспортные услуги..." style={INP}/>
                  </div>

                  {recognized.summary && (
                    <div style={{background:'var(--ai-light)', borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:12, color:'var(--ai-text)', border:'1px solid var(--border)'}}>
                      🤖 {recognized.summary}
                    </div>
                  )}

                  {recognized.issues?.length > 0 && (
                    <div style={{background:'var(--warn-light)', borderRadius:'var(--radius-sm)', padding:'10px 14px', border:'1px solid var(--warn)'}}>
                      {recognized.issues.map((issue,i)=>(
                        <div key={i} style={{fontSize:12, color:'var(--warn-text)'}}>⚠️ {issue}</div>
                      ))}
                    </div>
                  )}

                  {/* ── БЛОК ДТ/КТ ── */}
                  <div style={{background:'var(--surface2)', borderRadius:'var(--radius)', padding:'14px 16px', border:'1px solid var(--border)'}}>
                    <div style={{fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>
                      Предложенная проводка AI
                      {postingLoading && <span style={{marginLeft:8, color:'var(--ai)', fontWeight:400}}>⏳ определяю счета...</span>}
                      {previewPosting && !postingLoading && (
                        <span style={{marginLeft:8, color:previewPosting.confidence>=80?'var(--success)':previewPosting.confidence>=60?'var(--warn)':'var(--error)', fontWeight:700}}>
                          {previewPosting.confidence}% AI
                        </span>
                      )}
                    </div>

                    {/* Счета */}
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10}}>
                      <div>
                        <label style={LBL}>Дебет (Дт) *</label>
                        <input value={editDebit} onChange={e=>setEditDebit(e.target.value)}
                          placeholder="7350" style={{...INP, color:'var(--accent)', fontWeight:700, fontVariantNumeric:'tabular-nums'}}/>
                        {previewPosting?.debit_account_name && (
                          <div style={{fontSize:11, color:'var(--text3)', marginTop:3}}>{previewPosting.debit_account_name}</div>
                        )}
                      </div>
                      <div>
                        <label style={LBL}>Кредит (Кт) *</label>
                        <input value={editCredit} onChange={e=>setEditCredit(e.target.value)}
                          placeholder="3110" style={{...INP, color:'var(--success)', fontWeight:700, fontVariantNumeric:'tabular-nums'}}/>
                        {previewPosting?.credit_account_name && (
                          <div style={{fontSize:11, color:'var(--text3)', marginTop:3}}>{previewPosting.credit_account_name}</div>
                        )}
                      </div>
                    </div>

                    {/* Содержание операции */}
                    <div style={{marginBottom:10}}>
                      <label style={LBL}>Содержание операции</label>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                        placeholder="Описание проводки..." style={INP}/>
                    </div>

                    {/* Поиск по плану счетов */}
                    <div>
                      <label style={LBL}>Поиск по плану счетов</label>
                      <input value={accountSearch} onChange={e=>setAccountSearch(e.target.value)}
                        placeholder="Введите код или название счёта..."
                        style={{...INP, marginBottom: accountSearch && accounts.filter(a=>a.code.includes(accountSearch)||a.name.toLowerCase().includes(accountSearch.toLowerCase())).length > 0 ? 0 : undefined}}/>
                      {accountSearch && (() => {
                        const filtered = accounts.filter(a =>
                          a.code.includes(accountSearch) || a.name.toLowerCase().includes(accountSearch.toLowerCase())
                        ).slice(0, 8)
                        return filtered.length > 0 ? (
                          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', marginTop:4, maxHeight:200, overflowY:'auto', boxShadow:'var(--shadow)'}}>
                            {filtered.map(a => (
                              <div key={a.code} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid var(--border)', fontSize:12}}>
                                <div>
                                  <span style={{color:'var(--accent)', fontWeight:700, marginRight:8}}>{a.code}</span>
                                  <span style={{color:'var(--text2)'}}>{a.name}</span>
                                </div>
                                <div style={{display:'flex', gap:6, flexShrink:0}}>
                                  <button onClick={()=>{setEditDebit(a.code);setAccountSearch('')}}
                                    style={{background:'var(--accent-light)', border:'1px solid var(--border)', color:'var(--accent)', fontSize:10, padding:'3px 8px', borderRadius:'var(--radius-sm)', cursor:'pointer', fontWeight:700, fontFamily:'inherit'}}>
                                    → Дт
                                  </button>
                                  <button onClick={()=>{setEditCredit(a.code);setAccountSearch('')}}
                                    style={{background:'var(--success-light)', border:'1px solid var(--border)', color:'var(--success)', fontSize:10, padding:'3px 8px', borderRadius:'var(--radius-sm)', cursor:'pointer', fontWeight:700, fontFamily:'inherit'}}>
                                    → Кт
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null
                      })()}
                    </div>

                    {/* AI обоснование */}
                    {previewPosting?.reasoning && !postingLoading && (
                      <div style={{marginTop:10, fontSize:11, color:'var(--ai-text)', background:'var(--ai-light)', padding:'8px 12px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)'}}>
                        🤖 {previewPosting.reasoning}
                      </div>
                    )}
                  </div>

                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <input type="checkbox" id="auto_post" checked={form.auto_post}
                      onChange={e=>setForm(f=>({...f,auto_post:e.target.checked}))}
                      style={{width:16, height:16, cursor:'pointer', accentColor:'var(--accent)'}}/>
                    <label htmlFor="auto_post" style={{fontSize:13, color:'var(--text2)', cursor:'pointer'}}>
                      Автоматически разнести по счетам КР после сохранения
                    </label>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <input type="checkbox" id="scope_internal" checked={form.scope==='internal'}
                      onChange={e=>setForm(f=>({...f,scope:e.target.checked?'internal':'official'}))}
                      style={{width:16, height:16, cursor:'pointer', accentColor:'var(--warn)'}}/>
                    <label htmlFor="scope_internal" style={{fontSize:13, color:form.scope==='internal'?'var(--warn)':'var(--text2)', cursor:'pointer', fontWeight:form.scope==='internal'?700:400}}>
                      🔒 Внутренний учёт — не попадёт в выгрузки для 1С
                    </label>
                  </div>
                </div>
              </div>

              {/* Кнопки */}
              <div style={{display:'flex', gap:10}}>
                <button onClick={handleConfirm} disabled={!canConfirm}
                  style={{flex:2, background:!canConfirm?'var(--text4)':'var(--success)', color:'#fff', border:'none', padding:14, borderRadius:'var(--radius)', fontSize:14, fontWeight:800, cursor:!canConfirm?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:canConfirm?'var(--shadow)':'none'}}>
                  {state === 'saving' ? '⏳ Сохраняю...' : '✅ Подтвердить и сохранить'}
                </button>
                <button onClick={reset}
                  style={{flex:1, background:'none', color:'var(--text2)', border:'1px solid var(--border)', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
                  ✕ Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {state === 'done' && savedResult && (
          <div>
            <div style={{background:'var(--success-light)', border:'1px solid var(--success)', borderRadius:'var(--radius-lg)', padding:'20px 18px', marginBottom:16, boxShadow:'var(--shadow-sm)'}}>
              <div style={{fontWeight:800, fontSize:16, color:'var(--success)', marginBottom:12}}>✅ Документ сохранён</div>
              {savedResult.posting && !savedResult.posting.error && (
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>AI-проводка создана</div>
                  <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                    <div style={{background:'var(--accent-light)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, color:'var(--accent)'}}>
                      Дт {savedResult.posting.debit}
                    </div>
                    <span style={{color:'var(--text4)'}}>→</span>
                    <div style={{background:'var(--success-light)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, color:'var(--success)'}}>
                      Кт {savedResult.posting.credit}
                    </div>
                  </div>
                  <div style={{fontSize:13, color:'var(--text)', marginTop:8, fontWeight:700, fontVariantNumeric:'tabular-nums'}}>
                    {Number(savedResult.posting.amount).toLocaleString('ru-RU')} {savedResult.posting.currency}
                  </div>
                  {savedResult.posting.status === 'needs_review' && (
                    <div style={{fontSize:12, color:'var(--warn)', marginTop:6, background:'var(--warn-light)', padding:'4px 8px', borderRadius:'var(--radius-sm)', display:'inline-block'}}>
                      ⚠️ Требует проверки бухгалтером ({savedResult.posting.confidence}%)
                    </div>
                  )}
                </div>
              )}
              {savedResult.posting?.error && (
                <div style={{fontSize:12, color:'var(--warn)'}}>⚠️ {savedResult.posting.error}</div>
              )}
              {savedResult.esf_id && (
                <div style={{marginTop:10, padding:'8px 12px', background:'var(--accent-light)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', fontSize:12, color:'var(--accent)', fontWeight:600}}>
                  ⚡ ЭСФ автоматически добавлена в модуль ЭСФ → Входящие (статус: Не принято)
                </div>
              )}
            </div>
            <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
              <button onClick={reset}
                style={{flex:1, minWidth:140, background:'var(--accent)', color:'#fff', border:'none', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                📷 Сканировать ещё
              </button>
              <button onClick={()=>navigate(`/company/${companyId}/journal`)}
                style={{flex:1, minWidth:140, background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📒 В журнал
              </button>
              {savedResult.esf_id && (
                <button onClick={()=>navigate(`/company/${companyId}/esf`)}
                  style={{flex:1, minWidth:140, background:'var(--surface)', color:'var(--accent)', border:'1.5px solid var(--accent)', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                  ⚡ В модуль ЭСФ
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
