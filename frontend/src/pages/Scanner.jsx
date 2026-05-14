import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { scanner } from '../api/client'

export default function Scanner() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [state, setstate] = useState('idle') // idle | uploading | done | error
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError('')

    // Показываем превью для изображений
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setPreview(null) // PDF — нет превью
    }

    uploadFile(file)
  }

  async function uploadFile(file) {
    setstate('uploading')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('auto_post', 'true')
      const res = await scanner.scan(companyId, form)
      setResult(res.data)
      setstate('done')
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка при сканировании')
      setstate('error')
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function confidenceColor(n) {
    if (n >= 85) return '#10B981'
    if (n >= 60) return '#F59E0B'
    return '#EF4444'
  }

  function docTypeLabel(t) {
    const map = {
      invoice: 'Счёт на оплату', act: 'Акт', esf: 'ЭСФ',
      ttn: 'Накладная', contract: 'Договор', receipt: 'Квитанция',
      bank_statement: 'Банковская выписка', payment_order: 'Платёжное поручение',
      payroll: 'Зарплатная ведомость', other: 'Прочее'
    }
    return map[t] || t
  }

  const r = result?.recognition
  const p = result?.posting

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', fontFamily: 'Manrope, sans-serif' }}>

      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#6B7280' }}>
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>Сканер документов</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#9CA3AF' }}>Загрузите фото или PDF — AI распознает и разнесёт</p>
        </div>
      </div>

      {/* Зона загрузки */}
      {state === 'idle' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            border: '2px dashed #D1D5DB', borderRadius: 16, padding: '40px 24px',
            textAlign: 'center', background: '#FAFAFA', cursor: 'pointer',
            transition: 'border-color 0.2s'
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
          <p style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#374151' }}>
            Перетащите файл или выберите способ загрузки
          </p>
          <p style={{ margin: '0 0 24px', fontSize: 12, color: '#9CA3AF' }}>
            PDF, JPEG, PNG, WEBP, HEIC
          </p>

          {/* Две большие кнопки */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>

            {/* Камера — для телефона */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#4F46E5', color: '#fff', border: 'none',
                padding: '12px 20px', borderRadius: 10, fontSize: 14,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
              }}>
              📷 Снять камерой
            </button>

            {/* Файл — PDF или фото из галереи */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', color: '#374151',
                border: '2px solid #E5E7EB',
                padding: '12px 20px', borderRadius: 10, fontSize: 14,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
              }}>
              📁 Загрузить файл
            </button>
          </div>

          {/* Скрытые input'ы */}
          {/* Камера — задняя камера телефона */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />
          {/* Файл — PDF, фото из галереи */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.heic,.heif"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* Загрузка */}
      {state === 'uploading' && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          {preview && (
            <img src={preview} alt="preview"
              style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 12, marginBottom: 20, objectFit: 'contain' }} />
          )}
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            AI распознаёт документ...
          </p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
            {fileName && `Файл: ${fileName}`}
          </p>
          <div style={{
            marginTop: 20, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', background: '#4F46E5', borderRadius: 2,
              animation: 'progress 2s ease-in-out infinite',
              width: '60%'
            }} />
          </div>
          <style>{`@keyframes progress { 0%{margin-left:-60%} 100%{margin-left:100%} }`}</style>
        </div>
      )}

      {/* Ошибка */}
      {state === 'error' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ color: '#DC2626', fontWeight: 600, margin: '0 0 16px' }}>{error}</p>
          <button onClick={() => { setstate('idle'); setPreview(null); setFileName('') }}
            style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Попробовать снова
          </button>
        </div>
      )}

      {/* Результат */}
      {state === 'done' && result && (
        <div>
          {/* Превью */}
          {preview && (
            <img src={preview} alt="document"
              style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, marginBottom: 16, background: '#F9FAFB' }} />
          )}

          {/* Карточка распознавания */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 14 }}>
            {/* Заголовок с уверенностью */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>
                  {docTypeLabel(r?.doc_type)} {r?.doc_number ? `№${r.doc_number}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{r?.doc_date || 'Дата не определена'}</div>
              </div>
              <div style={{
                background: confidenceColor(r?.confidence || 0) + '20',
                color: confidenceColor(r?.confidence || 0),
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700
              }}>
                {r?.confidence || 0}% AI
              </div>
            </div>

            {/* Поля */}
            <div style={{ padding: '12px 18px' }}>
              {[
                ['Контрагент', r?.counterparty],
                ['ИНН', r?.counterparty_inn],
                ['Сумма', r?.amount ? `${r.amount.toLocaleString()} ${r?.currency || ''}` : null],
                ['НДС', r?.vat_amount > 0 ? `${r.vat_amount.toLocaleString()} ${r?.currency || ''}` : null],
                ['Тип операции', r?.operation_type],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F9FAFB' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#111827', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                </div>
              ))}
              {r?.summary && (
                <p style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 0', lineHeight: 1.5 }}>{r.summary}</p>
              )}
            </div>

            {/* Предупреждения */}
            {r?.issues?.length > 0 && (
              <div style={{ padding: '10px 18px', background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}>
                {r.issues.map((issue, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#92400E', marginBottom: 2 }}>⚠️ {issue}</div>
                ))}
              </div>
            )}
          </div>

          {/* Карточка проводки */}
          {p && !p.error && (
            <div style={{ background: '#F0FDF4', borderRadius: 14, border: '1px solid #BBF7D0', padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#065F46', marginBottom: 10 }}>
                ✅ AI-проводка создана
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#065F46' }}>
                  Дт {p.debit}
                </div>
                <span style={{ color: '#9CA3AF', fontSize: 14 }}>→</span>
                <div style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#065F46' }}>
                  Кт {p.credit}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                {p.amount?.toLocaleString()} {p.currency}
              </div>
              {p.status === 'needs_review' && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#92400E', background: '#FFFBEB', padding: '4px 8px', borderRadius: 6 }}>
                  ⚠️ Требует проверки бухгалтером (уверенность {p.confidence}%)
                </div>
              )}
            </div>
          )}

          {p?.error && (
            <div style={{ background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA', padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
              ⚠️ {p.error}
            </div>
          )}

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setstate('idle'); setPreview(null); setFileName(''); setResult(null) }}
              style={{ flex: 1, background: '#4F46E5', color: '#fff', border: 'none', padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              📷 Сканировать ещё
            </button>
            <button
              onClick={() => navigate(`/company/${companyId}/documents`)}
              style={{ flex: 1, background: '#fff', color: '#374151', border: '2px solid #E5E7EB', padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              📋 К документам
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
