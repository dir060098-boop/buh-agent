import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documents, scanner, companies } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

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

const STATUSES = [
  ['', 'Все статусы'],
  ['pending', 'Ожидает разноски'],
  ['posted', 'Разнесено'],
  ['needs_review', 'На проверке'],
]

const STATUS_STYLE = {
  pending:      { bg: 'var(--warn-light)',    color: 'var(--warn)',    label: 'Ожидает' },
  posted:       { bg: 'var(--success-light)', color: 'var(--success)', label: 'Разнесено' },
  needs_review: { bg: '#e8f0fe',              color: '#1a56db',        label: 'На проверке' },
}

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
  const navigate = useNavigate()

  const [company, setCompany]   = useState(null)
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  const [search, setSearch]           = useState('')
  const [docType, setDocType]         = useState('')
  const [postingStatus, setPostingStatus] = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (search)        params.search         = search
    if (docType)       params.doc_type       = docType
    if (postingStatus) params.posting_status = postingStatus
    if (dateFrom)      params.date_from      = dateFrom
    if (dateTo)        params.date_to        = dateTo
    documents.list(companyId, params)
      .then(r => setDocs(r.data))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [companyId, search, docType, postingStatus, dateFrom, dateTo])

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

  // Статистика
  const total       = docs.length
  const pending     = docs.filter(d => d.posting_status === 'pending').length
  const needs_rev   = docs.filter(d => d.posting_status === 'needs_review').length
  const posted      = docs.filter(d => d.posting_status === 'posted').length

  const previewUrl = selected?.file_path ? scanner.fileUrl(selected.file_path) : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Шапка */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={() => navigate(`/company/${companyId}`)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Назад
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>🗂 Архив документов</div>
          {company && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{company.name}</div>}
        </div>
        <button onClick={() => navigate(`/company/${companyId}/scanner`)}
          style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Загрузить документ
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* Счётчики */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Всего',         val: total,     color: 'var(--text)',    filter: '' },
            { label: 'Ожидают',       val: pending,   color: 'var(--warn)',    filter: 'pending' },
            { label: 'На проверке',   val: needs_rev, color: '#1a56db',        filter: 'needs_review' },
            { label: 'Разнесено',     val: posted,    color: 'var(--success)', filter: 'posted' },
          ].map(s => (
            <div key={s.label}
              onClick={() => setPostingStatus(postingStatus === s.filter ? '' : s.filter)}
              style={{
                background: postingStatus === s.filter ? 'var(--surface2)' : 'var(--surface)',
                border: `1px solid ${postingStatus === s.filter ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '12px 18px',
                boxShadow: 'var(--shadow-sm)', minWidth: 110, cursor: 'pointer',
              }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Фильтры */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 14, boxShadow: 'var(--shadow-sm)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Контрагент, номер, операция..."
            style={{ ...SEL, flex: '1 1 200px', cursor: 'text' }} />
          <select value={docType} onChange={e => setDocType(e.target.value)} style={{ ...SEL, flex: '1 1 160px' }}>
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={postingStatus} onChange={e => setPostingStatus(e.target.value)} style={{ ...SEL, flex: '1 1 150px' }}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...SEL, flex: '0 0 140px' }} />
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...SEL, flex: '0 0 140px' }} />
          {(search || docType || postingStatus || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(''); setDocType(''); setPostingStatus(''); setDateFrom(''); setDateTo('') }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Сбросить
            </button>
          )}
        </div>

        {/* Таблица */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 120px 1fr 1fr 120px 110px 64px', gap: 8, padding: '10px 16px', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <div>Дата</div>
            <div>Тип</div>
            <div>Контрагент</div>
            <div>Операция</div>
            <div style={{ textAlign: 'right' }}>Сумма</div>
            <div style={{ textAlign: 'center' }}>Статус</div>
            <div></div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
          ) : docs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {search || docType || postingStatus || dateFrom || dateTo
                ? 'По фильтрам ничего не найдено'
                : 'Документов пока нет — загрузите первый через Сканер'}
            </div>
          ) : docs.map(doc => {
            const st    = STATUS_STYLE[doc.posting_status] || STATUS_STYLE.pending
            const tColor = TYPE_COLOR[doc.doc_type] || '#374151'
            return (
              <div key={doc.id}
                onClick={() => setSelected(doc)}
                style={{ display: 'grid', gridTemplateColumns: '90px 120px 1fr 1fr 120px 110px 64px', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
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
                <div style={{ textAlign: 'center' }}>
                  <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>{st.label}</span>
                </div>
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
                    {(() => {
                      const st = STATUS_STYLE[selected.posting_status] || STATUS_STYLE.pending
                      return <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{st.label}</span>
                    })()}
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
                <button onClick={() => navigate(`/company/${companyId}/journal`)}
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                  📒 В журнал
                </button>
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
