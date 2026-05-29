import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documents, scanner } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import NavBar from '../components/NavBar'

const DOC_TYPES = [
  ['', 'Все типы'],
  ['invoice', 'Счёт на оплату'],
  ['act', 'Акт'],
  ['esf', 'ЭСФ'],
  ['ttn', 'Накладная (ТТН)'],
  ['contract', 'Договор'],
  ['receipt', 'Квитанция'],
  ['payment_order', 'Платёжное поручение'],
  ['bank_statement', 'Выписка банка'],
  ['payroll', 'Зарплатная ведомость'],
  ['other', 'Прочее'],
]

// Типы документов — нужны только для цветных бейджиков
const TYPE_COLOR = {
  invoice:       '#7c3aed',
  act:           '#0369a1',
  esf:           '#047857',
  ttn:           '#b45309',
  contract:      '#6b21a8',
  receipt:       '#0284c7',
  payment_order: '#065f46',
  bank_statement:'#1e40af',
  payroll:       '#7c2d12',
  other:         '#374151',
}

function fmt(n, cur = 'KGS') {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' ' + cur
}
function fmtDate(s) {
  if (!s) return '—'
  const part = s.slice(0, 10)
  const [y, m, d] = part.split('-')
  return `${d}.${m}.${y}`
}

const SEL = {
  background: 'var(--surface)',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'Manrope, sans-serif',
  cursor: 'pointer',
}

export default function Documents() {
  const { companyId } = useParams()
  const navigate = useNavigate() // используется в кнопке «← Назад» и «+ Загрузить документ»

  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  const [search, setSearch]   = useState('')
  const [docType, setDocType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (search)   params.search    = search
    if (docType)  params.doc_type  = docType
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo
    documents.list(companyId, params)
      .then(r => setDocs(r.data))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [companyId, search, docType, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  function handleDelete(doc) {
    setConfirmState({
      title: 'Удалить документ?',
      message: `«${doc.counterparty || '—'}» на ${fmt(doc.amount, doc.currency)} будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: () => {
        setDeleting(doc.id)
        documents.delete(doc.id)
          .then(() => { setDocs(d => d.filter(x => x.id !== doc.id)); setSelected(null) })
          .finally(() => setDeleting(null))
      }
    })
  }

  const previewUrl = selected?.file_path ? scanner.fileUrl(selected.file_path) : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      <NavBar companyId={companyId} current="documents" />

      {/* Шапка модуля */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>🗂 Архив документов</div>
        <button onClick={() => navigate(`/company/${companyId}/scanner`)}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Загрузить документ
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* Фильтры */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 14, boxShadow: 'var(--shadow-sm)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Контрагент, номер, операция..."
            style={{ ...SEL, flex: '1 1 200px', cursor: 'text' }} />
          <select value={docType} onChange={e => setDocType(e.target.value)} style={{ ...SEL, flex: '1 1 160px' }}>
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...SEL, flex: '0 0 140px' }} />
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...SEL, flex: '0 0 140px' }} />
          {(search || docType || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(''); setDocType(''); setDateFrom(''); setDateTo('') }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Сбросить
            </button>
          )}
        </div>

        {/* Таблица */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 120px 1fr 1fr 120px 48px', gap: 8, padding: '10px 16px', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <div>Дата</div>
            <div>Тип</div>
            <div>Контрагент</div>
            <div>Операция</div>
            <div style={{ textAlign: 'right' }}>Сумма</div>
            <div></div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
          ) : docs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {search || docType || dateFrom || dateTo
                ? 'По фильтрам ничего не найдено'
                : 'Документов пока нет — загрузите первый через Сканер'}
            </div>
          ) : docs.map(doc => {
            const tColor = TYPE_COLOR[doc.doc_type] || '#374151'
            return (
              <div key={doc.id}
                onClick={() => setSelected(doc)}
                style={{ display: 'grid', gridTemplateColumns: '90px 120px 1fr 1fr 120px 48px', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(doc.doc_date)}</div>
                <div>
                  <span style={{ fontSize: 11, color: '#fff', background: tColor, fontWeight: 700, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                    {doc.doc_type_label}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.counterparty || '—'}</div>
                  {doc.doc_number && <div style={{ fontSize: 11, color: 'var(--text3)' }}>№{doc.doc_number}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.operation_type || '—'}</div>
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmt(doc.amount, doc.currency)}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={e => { e.stopPropagation(); handleDelete(doc) }}
                    disabled={deleting === doc.id}
                    style={{ fontSize: 11, color: 'var(--error)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' }}
                    title="Удалить">
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {docs.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
            {docs.length} {docs.length === 1 ? 'документ' : docs.length < 5 ? 'документа' : 'документов'}
          </div>
        )}
      </div>

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />

      {/* ════════ МОДАЛ ДЕТАЛИ ════════ */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
              width: '100%', maxWidth: 520,
              boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              maxHeight: '92vh',
            }}>

            {/* ── Детали документа ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Шапка */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, color: '#fff', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: TYPE_COLOR[selected.doc_type] || '#374151'
                    }}>{selected.doc_type_label}</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginTop: 4 }}>
                    {selected.doc_number ? `№${selected.doc_number}` : 'Б/н'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtDate(selected.doc_date)}</div>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>

              {/* Тело */}
              <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
                {/* Поля документа */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    ['Контрагент',      selected.counterparty],
                    ['ИНН контрагента', selected.counterparty_inn],
                    ['Сумма',           fmt(selected.amount, selected.currency)],
                    ['НДС',             selected.vat_amount ? fmt(selected.vat_amount, selected.currency) : '0'],
                    ['Тип операции',    selected.operation_type],
                    ['Дт / Кт',         selected.debit_account && selected.credit_account
                                          ? `${selected.debit_account} / ${selected.credit_account}` : null],
                    ['Уверенность AI',  selected.ai_confidence ? `${selected.ai_confidence}%` : null],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                      <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{k}</span>
                      <span style={{ color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* AI резюме */}
                {selected.ai_summary && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ai-text)', background: 'var(--ai-light)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ai)', lineHeight: 1.5 }}>
                    🤖 {selected.ai_summary}
                  </div>
                )}

              </div>

              {/* Футер */}
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noreferrer"
                    style={{ flex: 1, textAlign: 'center', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-sm)', padding: '9px 0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    📎 Открыть файл
                  </a>
                )}
                <button onClick={() => handleDelete(selected)}
                  style={{ background: 'none', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--error)' }}>
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
