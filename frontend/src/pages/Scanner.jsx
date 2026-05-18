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
  if (n >= 85) return '#10B981'
  if (n >= 60) return '#F59E0B'
  return '#EF4444'
}

const INP = {
  width:'100%', background:'#0f1117', border:'1px solid #2a3050',
  borderRadius:8, padding:'9px 12px', color:'#e8eaf6',
  fontSize:13, fontFamily:'Manrope, sans-serif', boxSizing:'border-box'
}
const LBL = {
  display:'block', fontSize:11, fontWeight:700, color:'#4a5580',
  textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5
}

export default function Scanner() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // Состояния
  const [state, setState] = useState('idle') // idle | scanning | preview | saving | done | error
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const [fileUrl, setFileUrl] = useState(null)
  const [sourceType, setSourceType] = useState(null)
  // Данные от AI (для предпросмотра)
  const [recognized, setRecognized] = useState(null)
  const [filePath, setFilePath] = useState(null)
  const [aiRawJson, setAiRawJson] = useState(null)
  const [duplicateWarning, setDuplicateWarning] = useState(null)

  // Форма редактирования
  const [form, setForm] = useState({})

  // Результат после сохранения
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

      // Заполняем форму из распознанных данных
      setForm({
        doc_type:        r.doc_type || 'other',
        doc_number:      r.doc_number || '',
        doc_date:        r.doc_date || '',
        counterparty:    r.counterparty || '',
        counterparty_inn:r.counterparty_inn || '',
        amount:          r.amount || '',
        vat_amount:      r.vat_amount || 0,
        currency:        r.currency || 'KGS',
        operation_type:  r.operation_type || '',
        summary:         r.summary || '',
        auto_post:       true
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
        file_path:       filePath,
        doc_type:        form.doc_type,
        doc_number:      form.doc_number || null,
        doc_date:        form.doc_date || null,
        counterparty:    form.counterparty || null,
        counterparty_inn:form.counterparty_inn || null,
        amount:          form.amount ? parseFloat(form.amount) : null,
        vat_amount:      parseFloat(form.vat_amount) || 0,
        currency:        form.currency,
        operation_type:  form.operation_type || null,
        summary:         form.summary || null,
        ai_raw_json:     aiRawJson,
        auto_post:       form.auto_post
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
    setAiRawJson(null)
    setFileUrl(null)
    setSourceType(null)
    setDuplicateWarning(null)
    setForm({})
    setSavedResult(null)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{background:'#0f1117', minHeight:'100vh', fontFamily:'Manrope, sans-serif', color:'#e8eaf6'}}>

      {/* Шапка */}
      <div style={{background:'#181c27', borderBottom:'1px solid #2a3050', padding:'14px 20px', display:'flex', alignItems:'center', gap:12}}>
        <button onClick={() => navigate(`/company/${companyId}`)}
          style={{background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#8892b0'}}>←</button>
        <div>
          <div style={{fontWeight:800, fontSize:16}}>Сканер документов</div>
          <div style={{fontSize:11, color:'#4a5580'}}>Загрузите фото или PDF — AI распознает, вы проверяете</div>
        </div>
      </div>

      <div style={{maxWidth:680, margin:'0 auto', padding:'20px 16px'}}>

        {/* ── IDLE: Зона загрузки ── */}
        {state === 'idle' && (
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            style={{border:'2px dashed #2a3050', borderRadius:16, padding:'40px 24px', textAlign:'center', background:'#181c27', cursor:'pointer'}}>
            <div style={{fontSize:48, marginBottom:12}}>📄</div>
            <p style={{margin:'0 0 6px', fontSize:15, fontWeight:700, color:'#e8eaf6'}}>
              Перетащите файл или выберите способ
            </p>
            <p style={{margin:'0 0 24px', fontSize:12, color:'#4a5580'}}>
              PDF, JPEG, PNG, WEBP, HEIC
            </p>
            <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
              <button onClick={() => cameraInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:8, background:'#4F46E5', color:'#fff', border:'none', padding:'12px 20px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📷 Снять камерой
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:8, background:'#181c27', color:'#e8eaf6', border:'1px solid #2a3050', padding:'12px 20px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📁 Загрузить файл
              </button>
            </div>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              style={{display:'none'}} onChange={e => handleFile(e.target.files[0])}/>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.heic,.heif"
              style={{display:'none'}} onChange={e => handleFile(e.target.files[0])}/>
          </div>
        )}

        {/* ── SCANNING: Загрузка ── */}
        {state === 'scanning' && (
          <div style={{textAlign:'center', padding:'48px 24px', background:'#181c27', borderRadius:16, border:'1px solid #2a3050'}}>
            {preview && <img src={preview} alt="preview"
              style={{maxWidth:'100%', maxHeight:180, borderRadius:10, marginBottom:20, objectFit:'contain'}}/>}
            <div style={{fontSize:36, marginBottom:16}}>🔍</div>
            <p style={{fontSize:16, fontWeight:700, margin:'0 0 8px'}}>AI читает документ...</p>
            <p style={{fontSize:13, color:'#4a5580', margin:'0 0 20px'}}>{fileName}</p>
            <div style={{height:4, background:'#2a3050', borderRadius:2, overflow:'hidden'}}>
              <div style={{height:'100%', background:'#4F46E5', borderRadius:2,
                animation:'progress 2s ease-in-out infinite', width:'60%'}}/>
            </div>
            <style>{`@keyframes progress{0%{margin-left:-60%}100%{margin-left:100%}}`}</style>
          </div>
        )}

        {/* ── ERROR ── */}
        {state === 'error' && (
          <div style={{background:'#1e0a0a', border:'1px solid #EF444466', borderRadius:14, padding:20, textAlign:'center'}}>
            <div style={{fontSize:36, marginBottom:8}}>⚠️</div>
            <p style={{color:'#EF4444', fontWeight:600, margin:'0 0 16px'}}>{error}</p>
            <button onClick={reset}
              style={{background:'#4F46E5', color:'#fff', border:'none', padding:'10px 24px', borderRadius:8, fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:13}}>
              Попробовать снова
            </button>
          </div>
        )}

        {/* ── PREVIEW: Предпросмотр и редактирование ── */}
        {(state === 'preview' || state === 'saving') && recognized && (
          <div style={{display:'grid', gridTemplateColumns: fileUrl ? '1fr 1fr' : '1fr', gap:16, alignItems:'start'}}>
            {/* ЛЕВАЯ КОЛОНКА — оригинал документа */}
            {fileUrl && (
              <div style={{position:'sticky', top:20}}>
                <div style={{fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>
                  📄 Оригинал документа
                </div>
                {sourceType === 'pdf' ? (
                  <iframe
                    src={fileUrl}
                    style={{width:'100%', height:600, border:'1px solid var(--border)', borderRadius:'var(--radius)', background:'var(--surface)'}}
                    title="Предпросмотр документа"
                  />
                ) : (
                  <img src={fileUrl || preview} alt="document"
                    style={{width:'100%', borderRadius:'var(--radius)', border:'1px solid var(--border)'}}/>
                )}
              </div>
            )}
            {/* ПРАВАЯ КОЛОНКА — форма */}
            <div>

            {/* Предупреждение о дубле */}
            {duplicateWarning && (
              <div style={{background:'#1A1200', border:'1px solid #F59E0B66', borderRadius:12, padding:'14px 16px', marginBottom:16}}>
                <div style={{fontWeight:700, color:'#F59E0B', marginBottom:6}}>
                  ⚠️ Похожий документ уже {duplicateWarning.already_posted ? 'разнесён в журнал' : 'загружен'}
                </div>
                <div style={{fontSize:12, color:'#8892b0'}}>
                  {duplicateWarning.counterparty} · {duplicateWarning.amount} {duplicateWarning.currency}
                  {duplicateWarning.doc_number && ` · №${duplicateWarning.doc_number}`}
                </div>
                <div style={{fontSize:12, color:'#F59E0B', marginTop:6}}>
                  Проверьте данные ниже — если документ другой, нажмите Подтвердить и сохранить
                </div>
              </div>
            )}

            {/* Шапка с уверенностью */}
            <div style={{background:'#181c27', border:'1px solid #2a3050', borderRadius:14, overflow:'hidden', marginBottom:16}}>
              <div style={{padding:'14px 18px', borderBottom:'1px solid #2a3050', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontWeight:800, fontSize:15}}>Предпросмотр — проверьте и исправьте</div>
                <div style={{
                  background: confColor(recognized.confidence) + '22',
                  color: confColor(recognized.confidence),
                  padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700,
                  border: `1px solid ${confColor(recognized.confidence)}44`
                }}>
                  {recognized.confidence}% AI
                </div>
              </div>

              {/* Данные поставщика/покупателя (только для чтения) */}
              {(recognized.supplier_name || recognized.buyer_name) && (
                <div style={{padding:'12px 18px', borderBottom:'1px solid #1e2640', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div>
                    <div style={LBL}>Поставщик (из документа)</div>
                    <div style={{fontSize:13, color:'#10B981', fontWeight:600}}>{recognized.supplier_name || '—'}</div>
                    {recognized.supplier_inn && <div style={{fontSize:11, color:'#4a5580'}}>ИНН {recognized.supplier_inn}</div>}
                  </div>
                  <div>
                    <div style={LBL}>Покупатель (из документа)</div>
                    <div style={{fontSize:13, color:'#818CF8', fontWeight:600}}>{recognized.buyer_name || '—'}</div>
                    {recognized.buyer_inn && <div style={{fontSize:11, color:'#4a5580'}}>ИНН {recognized.buyer_inn}</div>}
                  </div>
                </div>
              )}

              {/* Форма редактирования */}
              <div style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:14}}>

                {/* Тип документа */}
                <div>
                  <label style={LBL}>Тип документа</label>
                  <select value={form.doc_type} onChange={e => setForm(f => ({...f, doc_type: e.target.value}))} style={INP}>
                    {DOC_TYPES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>

                {/* Номер и дата */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div>
                    <label style={LBL}>Номер документа</label>
                    <input value={form.doc_number} onChange={e => setForm(f => ({...f, doc_number: e.target.value}))}
                      placeholder="000006049" style={INP}/>
                  </div>
                  <div>
                    <label style={LBL}>Дата</label>
                    <input type="date" value={form.doc_date} onChange={e => setForm(f => ({...f, doc_date: e.target.value}))} style={INP}/>
                  </div>
                </div>

                {/* Контрагент */}
                <div>
                  <label style={LBL}>Контрагент (поставщик) *</label>
                  <input value={form.counterparty} onChange={e => setForm(f => ({...f, counterparty: e.target.value}))}
                    placeholder="ОсОО Ярос Групп" style={INP}/>
                </div>

                {/* ИНН контрагента */}
                <div>
                  <label style={LBL}>ИНН контрагента</label>
                  <input value={form.counterparty_inn} onChange={e => setForm(f => ({...f, counterparty_inn: e.target.value}))}
                    placeholder="01011200510144" style={INP}/>
                </div>

                {/* Сумма и валюта */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 120px', gap:12}}>
                  <div>
                    <label style={LBL}>Сумма *</label>
                    <input type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}
                      placeholder="9350.00" style={INP}/>
                  </div>
                  <div>
                    <label style={LBL}>Валюта</label>
                    <select value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))} style={INP}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* НДС */}
                <div>
                  <label style={LBL}>Сумма НДС</label>
                  <input type="number" value={form.vat_amount} onChange={e => setForm(f => ({...f, vat_amount: e.target.value}))}
                    placeholder="0" style={INP}/>
                </div>

                {/* Тип операции */}
                <div>
                  <label style={LBL}>Тип операции</label>
                  <input value={form.operation_type} onChange={e => setForm(f => ({...f, operation_type: e.target.value}))}
                    placeholder="аренда рабочего места" style={INP}/>
                </div>

                {/* Описание */}
                {recognized.summary && (
                  <div style={{background:'#0f1117', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#8892b0'}}>
                    📝 {recognized.summary}
                  </div>
                )}

                {/* Предупреждения AI */}
                {recognized.issues?.length > 0 && (
                  <div style={{background:'#1A1200', borderRadius:8, padding:'10px 14px'}}>
                    {recognized.issues.map((issue, i) => (
                      <div key={i} style={{fontSize:12, color:'#F59E0B'}}>⚠️ {issue}</div>
                    ))}
                  </div>
                )}

                {/* Авторазноска */}
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <input type="checkbox" id="auto_post" checked={form.auto_post}
                    onChange={e => setForm(f => ({...f, auto_post: e.target.checked}))}
                    style={{width:16, height:16, cursor:'pointer'}}/>
                  <label htmlFor="auto_post" style={{fontSize:13, color:'#8892b0', cursor:'pointer'}}>
                    Автоматически разнести по счетам КР после сохранения
                  </label>
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div style={{display:'flex', gap:10}}>
              <button onClick={handleConfirm} disabled={state === 'saving' || !form.amount || !form.counterparty}
                style={{
                  flex:2, background: (!form.amount || !form.counterparty) ? '#374151' : '#10B981',
                  color: (!form.amount || !form.counterparty) ? '#6B7280' : '#fff',
                  border:'none', padding:14, borderRadius:10, fontSize:14, fontWeight:800,
                  cursor: (!form.amount || !form.counterparty) ? 'not-allowed' : 'pointer', fontFamily:'inherit'
                }}>
                {state === 'saving' ? '⏳ Сохраняю...' : '✅ Подтвердить и сохранить'}
              </button>
              <button onClick={reset}
                style={{flex:1, background:'none', color:'#8892b0', border:'1px solid #2a3050', padding:14, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
                ✕ Отмена
              </button>
            </div>
            </div>{/* конец правой колонки */}
          </div>
        )}

        {/* ── DONE: Результат ── */}
        {state === 'done' && savedResult && (
          <div>
            <div style={{background:'#0D1A12', border:'1px solid #10B98166', borderRadius:14, padding:'20px 18px', marginBottom:16}}>
              <div style={{fontWeight:800, fontSize:16, color:'#10B981', marginBottom:12}}>✅ Документ сохранён</div>

              {savedResult.posting && !savedResult.posting.error && (
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12, color:'#4a5580', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>AI-проводка создана</div>
                  <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                    <div style={{background:'#4F46E511', border:'1px solid #4F46E533', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, color:'#818CF8'}}>
                      Дт {savedResult.posting.debit}
                    </div>
                    <span style={{color:'#4a5580'}}>→</span>
                    <div style={{background:'#10B98111', border:'1px solid #10B98133', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, color:'#34D399'}}>
                      Кт {savedResult.posting.credit}
                    </div>
                  </div>
                  <div style={{fontSize:13, color:'#e8eaf6', marginTop:8, fontWeight:600}}>
                    {Number(savedResult.posting.amount).toLocaleString('ru-RU')} {savedResult.posting.currency}
                  </div>
                  {savedResult.posting.status === 'needs_review' && (
                    <div style={{fontSize:12, color:'#F59E0B', marginTop:6}}>⚠️ Требует проверки бухгалтером ({savedResult.posting.confidence}% уверенность)</div>
                  )}
                </div>
              )}

              {savedResult.posting?.error && (
                <div style={{fontSize:12, color:'#F59E0B'}}>⚠️ {savedResult.posting.error}</div>
              )}
            </div>

            <div style={{display:'flex', gap:10}}>
              <button onClick={reset}
                style={{flex:1, background:'#4F46E5', color:'#fff', border:'none', padding:14, borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📷 Сканировать ещё
              </button>
              <button onClick={() => navigate(`/company/${companyId}/journal`)}
                style={{flex:1, background:'#181c27', color:'#e8eaf6', border:'1px solid #2a3050', padding:14, borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                📒 В журнал
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
