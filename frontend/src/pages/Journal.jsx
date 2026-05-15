import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { posting } from '../api/client'

const STATUS_LABEL = { posted: 'Проведено', needs_review: 'На проверке', rejected: 'Отклонено' }
const STATUS_COLOR = { posted: '#10B981', needs_review: '#F59E0B', rejected: '#EF4444' }
const STATUS_BG    = { posted: '#D1FAE5', needs_review: '#FEF3C7', rejected: '#FEE2E2' }

const DOC_TYPE_LABEL = {
  invoice: 'Счёт', act: 'Акт', esf: 'ЭСФ', ttn: 'Накладная',
  contract: 'Договор', receipt: 'Квитанция', payment_order: 'Платёжка',
  bank_statement: 'Выписка', payroll: 'Зарплата', other: 'Прочее'
}

function fmt(n, currency) {
  if (n == null) return '—'
  const s = Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${s} ${currency}` : s
}

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

  useEffect(() => { loadJournal() }, [filterStatus, filterDateFrom, filterDateTo])
  useEffect(() => { if (tab === 'report') loadReport() }, [tab, reportDate])

  async function loadJournal() {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterDateFrom) params.date_from = filterDateFrom
      if (filterDateTo) params.date_to = filterDateTo
      if (filterCounterparty) params.counterparty = filterCounterparty
      const res = await posting.journal(companyId, params)
      setEntries(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadReport() {
    setLoading(true)
    try {
      const res = await posting.dailyReport(companyId, reportDate)
      setReport(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function runAutoAll() {
    setPostingAll(true)
    try {
      await posting.autoAll(companyId)
      await loadJournal()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setPostingAll(false) }
  }

  const needsReview = entries.filter(e => e.status === 'needs_review').length
  const totalPosted = entries.filter(e => e.status === 'posted').length
  const totalKgs = entries
    .filter(e => e.status === 'posted')
    .reduce((s, e) => s + (e.amount_kgs || (e.currency === 'KGS' ? e.amount : 0)), 0)

  return (
    <div style={{ background: '#0f1117', minHeight: '100vh', fontFamily: 'Manrope, sans-serif', color: '#e8eaf6' }}>

      {/* Шапка */}
      <div style={{ background: '#181c27', borderBottom: '1px solid #2a3050', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(`/company/${companyId}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8892b0' }}>←</button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Журнал хозяйственных операций</div>
            <div style={{ fontSize: 11, color: '#4a5580' }}>План счетов КР · МСФО 2026</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/company/${companyId}/scanner`)}
            style={{ background: '#181c27', color: '#8892b0', border: '1px solid #2a3050', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            📷 Сканер
          </button>
          <button onClick={runAutoAll} disabled={postingAll}
            style={{ background: postingAll ? '#374151' : '#4F46E5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: postingAll ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {postingAll ? '⏳ Разношу...' : '⚡ Разнести все'}
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '16px 20px 0' }}>
        {[
          { label: 'Всего записей', value: entries.length, color: '#e8eaf6' },
          { label: 'Проведено', value: totalPosted, color: '#10B981' },
          { label: 'На проверке', value: needsReview, color: '#F59E0B' },
          { label: 'Итого KGS', value: totalKgs > 0 ? fmt(totalKgs) : '—', color: '#818CF8', small: true },
        ].map(s => (
          <div key={s.label} style={{ background: '#181c27', borderRadius: 10, padding: '12px 14px', border: '1px solid #2a3050' }}>
            <div style={{ fontSize: 10, color: '#4a5580', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
            <div style={{ fontSize: s.small ? 16 : 24, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Табы */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 20px 0' }}>
        {[['journal', '📋 Журнал'], ['report', '📊 Отчёт за день']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: tab === key ? '#4F46E5' : '#181c27', color: tab === key ? '#fff' : '#8892b0', border: tab === key ? 'none' : '1px solid #2a3050' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '14px 20px 40px' }}>

        {/* ── ЖУРНАЛ ── */}
        {tab === 'journal' && (
          <div>
            {/* Фильтры */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[['', 'Все'], ['posted', 'Проведено'], ['needs_review', 'На проверке']].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterStatus(val)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${filterStatus === val ? '#4F46E5' : '#2a3050'}`, background: filterStatus === val ? '#4F46E522' : 'none', color: filterStatus === val ? '#818CF8' : '#8892b0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setShowFilters(!showFilters)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #2a3050', background: 'none', color: '#8892b0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                  {showFilters ? '▲ Свернуть' : '▼ Фильтры'}
                </button>
              </div>

              {showFilters && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={labelStyle}>С даты</div>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={inputSmall} />
                  </div>
                  <div>
                    <div style={labelStyle}>По дату</div>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={inputSmall} />
                  </div>
                  <div>
                    <div style={labelStyle}>Контрагент</div>
                    <input placeholder="Поиск..." value={filterCounterparty}
                      onChange={e => setFilterCounterparty(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && loadJournal()}
                      style={{ ...inputSmall, width: 180 }} />
                  </div>
                  <button onClick={loadJournal}
                    style={{ alignSelf: 'flex-end', background: '#4F46E5', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Применить
                  </button>
                  <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterCounterparty(''); setFilterStatus('') }}
                    style={{ alignSelf: 'flex-end', background: 'none', color: '#8892b0', border: '1px solid #2a3050', padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Сброс
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#4a5580' }}>Загрузка...</div>
            ) : entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, background: '#181c27', borderRadius: 14, border: '1px solid #2a3050' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <p style={{ fontWeight: 700, color: '#e8eaf6', margin: '0 0 8px' }}>Проводок пока нет</p>
                <p style={{ fontSize: 13, color: '#8892b0', margin: '0 0 20px' }}>Отсканируйте документы — AI создаст проводки автоматически</p>
                <button onClick={() => navigate(`/company/${companyId}/scanner`)}
                  style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                  📷 Сканировать документ
                </button>
              </div>
            ) : (
              <div style={{ background: '#181c27', borderRadius: 12, border: '1px solid #2a3050', overflow: 'hidden' }}>
                {/* Шапка таблицы */}
                <div style={{ display: 'grid', gridTemplateColumns: '36px 70px 90px 130px 1fr 90px 90px 100px 80px', gap: 8, padding: '10px 14px', background: '#0f1117', fontSize: 10, fontWeight: 700, color: '#4a5580', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <div>№</div>
                  <div>Дата</div>
                  <div>Документ</div>
                  <div>Контрагент</div>
                  <div>Содержание операции</div>
                  <div>Дт счёт</div>
                  <div>Кт счёт</div>
                  <div style={{ textAlign: 'right' }}>Сумма</div>
                  <div>Статус</div>
                </div>

                {entries.map((e) => (
                  <div key={e.id}>
                    <div onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      style={{ display: 'grid', gridTemplateColumns: '36px 70px 90px 130px 1fr 90px 90px 100px 80px', gap: 8, padding: '11px 14px', borderTop: '1px solid #1e2640', cursor: 'pointer', alignItems: 'center', background: expanded === e.id ? '#1e2640' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1a1f35'}
                      onMouseLeave={ev => ev.currentTarget.style.background = expanded === e.id ? '#1e2640' : 'transparent'}>

                      {/* № п/п */}
                      <div style={{ fontSize: 11, color: '#4a5580', fontWeight: 600 }}>{e.row_num}</div>

                      {/* Дата */}
                      <div style={{ fontSize: 11, color: '#8892b0' }}>{e.entry_date?.slice(2)}</div>

                      {/* Документ */}
                      <div>
                        {e.doc_number && <div style={{ fontSize: 11, fontWeight: 700, color: '#e8eaf6' }}>№{e.doc_number}</div>}
                        {e.doc_type && <div style={{ fontSize: 10, color: '#4a5580' }}>{DOC_TYPE_LABEL[e.doc_type] || e.doc_type}</div>}
                      </div>

                      {/* Контрагент */}
                      <div style={{ fontSize: 11, color: '#8892b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.counterparty || '—'}
                      </div>

                      {/* Содержание */}
                      <div style={{ fontSize: 12, color: '#c0c8e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.description || '—'}
                      </div>

                      {/* Дт */}
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#818CF8', background: '#4F46E511', padding: '2px 6px', borderRadius: 4 }}>
                          {e.debit_account}
                        </span>
                      </div>

                      {/* Кт */}
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#34D399', background: '#10B98111', padding: '2px 6px', borderRadius: 4 }}>
                          {e.credit_account}
                        </span>
                      </div>

                      {/* Сумма */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#e8eaf6', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(e.amount).toLocaleString('ru-RU')}
                        </div>
                        <div style={{ fontSize: 10, color: '#4a5580' }}>{e.currency}</div>
                        {e.currency !== 'KGS' && e.amount_kgs && (
                          <div style={{ fontSize: 10, color: '#818CF8' }}>≈{Number(e.amount_kgs).toLocaleString('ru-RU')} KGS</div>
                        )}
                      </div>

                      {/* Статус */}
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: STATUS_BG[e.status] || '#F3F4F6', color: STATUS_COLOR[e.status] || '#6B7280' }}>
                          {STATUS_LABEL[e.status] || e.status}
                        </span>
                        <div style={{ fontSize: 10, color: e.ai_confidence >= 85 ? '#10B981' : e.ai_confidence >= 60 ? '#F59E0B' : '#EF4444', marginTop: 2 }}>
                          {e.ai_confidence}% AI
                        </div>
                      </div>
                    </div>

                    {/* Раскрытая детализация */}
                    {expanded === e.id && (
                      <div style={{ padding: '12px 14px 14px', background: '#141929', borderTop: '1px solid #2a3050' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 10 }}>
                          <div>
                            <div style={labelStyle}>Дт счёт</div>
                            <div style={{ fontSize: 13, color: '#e8eaf6' }}>{e.debit_account} — {e.debit_account_name}</div>
                          </div>
                          <div>
                            <div style={labelStyle}>Кт счёт</div>
                            <div style={{ fontSize: 13, color: '#e8eaf6' }}>{e.credit_account} — {e.credit_account_name}</div>
                          </div>
                          {e.counterparty_inn && (
                            <div>
                              <div style={labelStyle}>ИНН контрагента</div>
                              <div style={{ fontSize: 13, color: '#8892b0' }}>{e.counterparty_inn}</div>
                            </div>
                          )}
                          {e.doc_date && (
                            <div>
                              <div style={labelStyle}>Дата документа</div>
                              <div style={{ fontSize: 13, color: '#8892b0' }}>{e.doc_date}</div>
                            </div>
                          )}
                        </div>
                        {e.ai_reasoning && (
                          <div style={{ background: '#1e2640', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#8892b0' }}>
                            🤖 <strong style={{ color: '#818CF8' }}>AI:</strong> {e.ai_reasoning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ОТЧЁТ ЗА ДЕНЬ ── */}
        {tab === 'report' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                style={{ ...inputSmall, fontSize: 13 }} />
              <button onClick={loadReport}
                style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Показать
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#4a5580' }}>Загрузка...</div>
            ) : report && (
              <div>
                {/* Сводка */}
                <div style={{ background: '#181c27', borderRadius: 12, border: '1px solid #2a3050', padding: '16px 18px', marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>
                    📊 {report.report_date} · {report.company}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {[
                      ['Всего', report.summary?.total_entries, '#e8eaf6'],
                      ['Проведено', report.summary?.posted, '#10B981'],
                      ['На проверке', report.summary?.needs_review, '#F59E0B'],
                      ['Итого KGS', fmt(report.summary?.total_amount_kgs), '#818CF8'],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color }}>{val ?? 0}</div>
                        <div style={{ fontSize: 10, color: '#4a5580', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* На проверке */}
                {report.needs_review?.length > 0 && (
                  <div style={{ background: '#1A1200', border: '1px solid #F59E0B44', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #F59E0B22', fontWeight: 700, fontSize: 13, color: '#F59E0B' }}>
                      ⚠️ Требуют проверки бухгалтером ({report.needs_review.length})
                    </div>
                    {report.needs_review.map(e => (
                      <div key={e.id} style={{ padding: '12px 16px', borderBottom: '1px solid #2a1a00' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div>
                            {e.doc_number && <span style={{ fontSize: 12, fontWeight: 700, color: '#e8eaf6', marginRight: 8 }}>№{e.doc_number}</span>}
                            <span style={{ fontSize: 12, color: '#8892b0' }}>{e.counterparty || '—'}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf6', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount, e.currency)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#c0c8e0', marginBottom: 4 }}>{e.description}</div>
                        <div style={{ fontSize: 11, color: '#4a5580' }}>
                          Дт {e.debit?.split(' ')[0]} → Кт {e.credit?.split(' ')[0]} · AI {e.confidence}%
                        </div>
                        {e.reasoning && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>🤖 {e.reasoning}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Итоги по счетам */}
                {Object.keys(report.totals_by_debit_account || {}).length > 0 && (
                  <div style={{ background: '#181c27', borderRadius: 12, border: '1px solid #2a3050', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3050', fontWeight: 700, fontSize: 13 }}>
                      Обороты по дебетовым счетам
                    </div>
                    {Object.entries(report.totals_by_debit_account).map(([account, amount]) => (
                      <div key={account} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid #1e2640', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#8892b0' }}>{account}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf6', fontVariantNumeric: 'tabular-nums' }}>{fmt(amount)} KGS</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Список проведённых */}
                {report.posted_entries?.length > 0 && (
                  <div style={{ background: '#181c27', borderRadius: 12, border: '1px solid #2a3050', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3050', fontWeight: 700, fontSize: 13 }}>
                      ✅ Проведённые операции ({report.posted_entries.length})
                    </div>
                    {report.posted_entries.map(e => (
                      <div key={e.id} style={{ padding: '11px 16px', borderBottom: '1px solid #1e2640', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                            {e.doc_number && <span style={{ fontSize: 11, fontWeight: 700, color: '#818CF8' }}>№{e.doc_number}</span>}
                            {e.counterparty && <span style={{ fontSize: 11, color: '#8892b0' }}>{e.counterparty}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#c0c8e0', marginBottom: 4 }}>{e.description}</div>
                          <div style={{ fontSize: 11 }}>
                            <span style={{ color: '#818CF8', background: '#4F46E511', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Дт {e.debit?.split(' ')[0]}</span>
                            <span style={{ color: '#4a5580', margin: '0 5px' }}>→</span>
                            <span style={{ color: '#34D399', background: '#10B98111', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Кт {e.credit?.split(' ')[0]}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf6', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount, e.currency)}</div>
                          {e.currency !== 'KGS' && e.amount_kgs && (
                            <div style={{ fontSize: 11, color: '#818CF8' }}>≈{fmt(e.amount_kgs)} KGS</div>
                          )}
                          <div style={{ fontSize: 10, color: '#10B981' }}>{e.confidence}% AI</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {report.summary?.total_entries === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, background: '#181c27', borderRadius: 12, border: '1px solid #2a3050', color: '#4a5580' }}>
                    За этот день операций нет
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = { fontSize: 10, color: '#4a5580', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }
const inputSmall = { background: '#0f1117', border: '1px solid #2a3050', borderRadius: 6, padding: '7px 10px', color: '#e8eaf6', fontSize: 12, fontFamily: 'Manrope, sans-serif' }
