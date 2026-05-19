import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { scanner } from '../api/client'

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
        auto_post: true
      })
      setRecognized(r)
      setState('preview')
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
        auto_post: form.auto_post
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
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const canConfirm = form.amount && form.counterparty && state !== 'saving'

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', fontFamily:'Manrope, sans-serif'}}>

      {/* Шапка */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)'}}>
        <button onClick={()=>navigate(`/company/${companyId}`)}
          style={{background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', color:'var(--text2)', cursor:'pointer', fontSize:13, fontWeight:600}}>←</button>
        <div>
          <div style={{fontWeight:800, fontSize:16, color:'var(--text)'}}>Сканер документов</div>
          <div style={{fontSize:11, color:'var(--text3)'}}>Загрузите фото или PDF — AI распознаёт, вы проверяете</div>
        </div>
      </div>

      <div style={{maxWidth: state === 'preview' || state === 'saving' ? 1100 : 640, margin:'0 auto', padding:'20px 16px'}}>

        {/* ── IDLE ── */}
        {state === 'idle' && (
          <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
            style={{border:'2px dashed var(--border2)', borderRadius:'var(--radius-lg)', padding:'40px 24px', textAlign:'center', background:'var(--surface)', cursor:'pointer', boxShadow:'var(--shadow-sm)'}}>
            <div style={{fontSize:48, marginBottom:12}}>📄</div>
            <p style={{margin:'0 0 6px', fontSize:15, fontWeight:700, color:'var(--text)'}}>Перетащите файл или выберите способ</p>
            <p style={{margin:'0 0 24px', fontSize:12, color:'var(--text3)'}}>PDF, JPEG, PNG, WEBP, HEIC</p>
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
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.heic,.heif" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
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
          <div style={{display:'grid', gridTemplateColumns: fileUrl ? '1fr 1fr' : '1fr', gap:20, alignItems:'start'}}>

            {/* Левая колонка — оригинал */}
            {fileUrl && (
              <div style={{position:'sticky', top:20}}>
                <div style={{fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>📄 Оригинал документа</div>
                {sourceType === 'pdf' ? (
                  <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
                    <object data={fileUrl} type="application/pdf"
                      style={{width:'100%', height:580, display:'block'}}>
                      <div style={{padding:20, textAlign:'center', color:'var(--text3)', fontSize:13}}>
                        PDF не отображается в браузере.{' '}
                        <a href={fileUrl} target="_blank" rel="noreferrer" style={{color:'var(--accent)', fontWeight:700}}>
                          Открыть в новой вкладке →
                        </a>
                      </div>
                    </object>
                    <div style={{padding:'8px 12px', borderTop:'1px solid var(--border)', textAlign:'center'}}>
                      <a href={fileUrl} target="_blank" rel="noreferrer"
                        style={{fontSize:12, color:'var(--accent)', fontWeight:600, textDecoration:'none'}}>
                        🔗 Открыть PDF в новой вкладке
                      </a>
                    </div>
                  </div>
                ) : (
                  <img src={fileUrl || preview} alt="document"
                    style={{width:'100%', borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)'}}/>
                )}
              </div>
            )}

            {/* Правая колонка — форма */}
            <div>
              {/* Имя файла */}
              {fileName && (
                <div style={{fontSize:11, color:'var(--text3)', marginBottom:8, padding:'6px 10px', background:'var(--surface2)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)'}}>
                  📎 {fileName}
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

                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <input type="checkbox" id="auto_post" checked={form.auto_post}
                      onChange={e=>setForm(f=>({...f,auto_post:e.target.checked}))}
                      style={{width:16, height:16, cursor:'pointer', accentColor:'var(--accent)'}}/>
                    <label htmlFor="auto_post" style={{fontSize:13, color:'var(--text2)', cursor:'pointer'}}>
                      Автоматически разнести по счетам КР после сохранения
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
            </div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={reset}
                style={{flex:1, background:'var(--accent)', color:'#fff', border:'none', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'var(--shadow)'}}>
                📷 Сканировать ещё
              </button>
              <button onClick={()=>navigate(`/company/${companyId}/journal`)}
                style={{flex:1, background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', padding:14, borderRadius:'var(--radius)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📒 В журнал
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
