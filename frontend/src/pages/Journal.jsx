import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { posting } from '../api/client'

const STATUS_LABEL = { posted: 'Разнесено', needs_review: 'На проверке', rejected: 'Отклонено' }
const STATUS_COLOR = { posted: '#10B981', needs_review: '#F59E0B', rejected: '#EF4444' }
const STATUS_BG    = { posted: '#D1FAE5', needs_review: '#FEF3C7', rejected: '#FEE2E2' }

function fmt(n) {
  if (!n) return '—'
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Journal() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState('journal') // journal | report
  const [entries, setEntries] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [posting_all, setPostingAll] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { loadJournal() }, [filterStatus])
  useEffect(() => { if (tab === 'report') loadReport() }, [tab, reportDate])

  async function loadJournal() {
    setLoading(true)
    try {
      const res = await posting.journal(companyId, filterStatus ? { status: filterStatus } : {})
      setEntries(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadReport() {
    setLoading(true)
    try {
      const res = await posting.dailyReport(companyId, reportDate)
      setReport(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function runAutoAll() {
    setPostingAll(true)
    try {
      await posting.autoAll(companyId)
      await loadJournal()
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.detail || e.message))
    } finally {
      setPostingAll(false)
    }
  }

  const needsReview = entries.filter(e => e.status === 'needs_review').length
  const totalPosted = entries.filter(e => e.status === 'posted').length

  return (
    <div style={{ background: '#F5F6FA', minHeight: '100vh', fontFamily: 'Manrope, sans-serif' }}>

      {/* Шапка */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8EAF0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(`/company/${companyId}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6B7280' }}>←</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>Журнал проводок</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>План счетов КР · МСФО 2026</p>
          </div>
        </div>
        <button
          onClick={runAutoAll}
          disabled={posting_all}
          style={{
            background: posting_all ? '#9CA3AF' : '#4F46E5', color: '#fff',
            border: 'none', padding: '9px 16px', borderRadius: 8,
            fontSize: 13, fontWeight: 700, cursor: posting_all ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6
          }}>
          {posting_all ? '⏳ Разношу...' : '⚡ Разнести все'}
        </button>
      </div>

      {/* Статистика */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 24px 0' }}>
        {[
          { label: 'Всего проводок', value: entries.length, color: '#4F46E5', bg: '#EEF2FF' },
          { label: 'Разнесено', value: totalPosted, color: '#10B981', bg: '#D1FAE5' },
          { label: 'На проверке', value: needsReview, color: '#F59E0B', bg: '#FEF3C7' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #E8EAF0' }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginTop: 4 }}>{s.value}</div>
            {s.label === 'На проверке' && needsReview > 0 && (
              <div style={{ fontSize: 10, color: s.color, fontWeight: 600, marginTop: 2 }}>⚠️ Требуют проверки</div>
            )}
          </div>
        ))}
      </div>

      {/* Табы */}
      <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0' }}>
        {[['journal', '📋 Журнал'], ['report', '📊 Отчёт за день']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: tab === key ? '#4F46E5' : '#fff',
              color: tab === key ? '#fff' : '#6B7280',
              boxShadow: tab === key ? '0 2px 8px rgba(79,70,229,0.3)' : 'none'
            }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '16px 24px 32px' }}>

        {/* ===== ЖУРНАЛ ===== */}
        {tab === 'journal' && (
          <div>
            {/* Фильтр */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['', 'Все'], ['posted', 'Разнесено'], ['needs_review', 'На проверке']].map(([val, label]) => (
                <button key={val} onClick={() => setFilterStatus(val)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterStatus === val ? '#4F46E5' : '#E5E7EB'}`,
                    background: filterStatus === val ? '#EEF2FF' : '#fff',
                    color: filterStatus === val ? '#4338CA' : '#6B7280',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                  }}>{label}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Загрузка...</div>
            ) : entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <p style={{ fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Проводок пока нет</p>
                <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 20px' }}>Отсканируйте документы или нажмите «Разнести все»</p>
                <button onClick={() => navigate(`/company/${companyId}/scanner`)}
                  style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                  📷 Сканировать документ
                </button>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0', overflow: 'hidden' }}>
                {/* Шапка таблицы */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 1fr 120px 80px 100px',
                  padding: '10px 16px', background: '#F9FAFB', gap: 8,
                  fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>
                  <div>Дата</div><div>Дебет</div><div>Кредит</div><div>Сумма</div><div>AI%</div><div>Статус</div>
                </div>

                {entries.map(e => (
                  <div key={e.id}>
                    <div
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      style={{
                        display: 'grid', gridTemplateColumns: '80px 1fr 1fr 120px 80px 100px',
                        padding: '12px 16px', gap: 8, borderTop: '1px solid #F3F4F6',
                        cursor: 'pointer', alignItems: 'center',
                        background: expanded === e.id ? '#FAFBFF' : '#fff'
                      }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>
                        {e.entry_date?.slice(5)}
                      </div>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#4338CA', background: '#EEF2FF', padding: '2px 6px', borderRadius: 4 }}>
                          {e.debit_account}
                        </span>
                        <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 6 }}>
                          {e.debit_account_name?.split(' ').slice(0, 3).join(' ')}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#065F46', background: '#D1FAE5', padding: '2px 6px', borderRadius: 4 }}>
                          {e.credit_account}
                        </span>
                        <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 6 }}>
                          {e.credit_account_name?.split(' ').slice(0, 3).join(' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(e.amount)} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{e.currency}</span>
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: e.ai_confidence >= 85 ? '#10B981' : e.ai_confidence >= 60 ? '#F59E0B' : '#EF4444'
                      }}>
                        {e.ai_confidence}%
                      </div>
                      <div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                          background: STATUS_BG[e.status] || '#F3F4F6',
                          color: STATUS_COLOR[e.status] || '#6B7280'
                        }}>
                          {STATUS_LABEL[e.status] || e.status}
                        </span>
                      </div>
                    </div>

                    {/* Раскрытая детализация */}
                    {expanded === e.id && (
                      <div style={{ padding: '12px 16px 16px', background: '#F8FAFF', borderTop: '1px solid #EEF2FF' }}>
                        <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                          <strong>Описание:</strong> {e.description || '—'}
                        </div>
                        {e.ai_reasoning && (
                          <div style={{ fontSize: 11, color: '#6B7280', background: '#EEF2FF', padding: '8px 12px', borderRadius: 8, marginBottom: 8 }}>
                            🤖 <strong>AI объяснение:</strong> {e.ai_reasoning}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9CA3AF' }}>
                          <span>Дт: <strong style={{ color: '#374151' }}>{e.debit_account} {e.debit_account_name}</strong></span>
                          <span>Кт: <strong style={{ color: '#374151' }}>{e.credit_account} {e.credit_account_name}</strong></span>
                          {e.document_id && <span>Документ: <strong style={{ color: '#4338CA' }}>#{e.document_id}</strong></span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== ОТЧЁТ ЗА ДЕНЬ ===== */}
        {tab === 'report' && (
          <div>
            {/* Выбор даты */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <input
                type="date"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB',
                  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: '#111827',
                  background: '#fff', cursor: 'pointer'
                }}
              />
              <button onClick={loadReport}
                style={{ background: '#4F46E5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Показать
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Загрузка...</div>
            ) : report && (
              <div>
                {/* Сводка */}
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0', padding: '16px 20px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#111827', marginBottom: 12 }}>
                    📊 {report.report_date} · {report.company}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {[
                      ['Всего проводок', report.summary?.total_entries],
                      ['Разнесено', report.summary?.posted],
                      ['На проверке', report.summary?.needs_review],
                    ].map(([label, val]) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{val ?? 0}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {report.summary?.total_amount_kgs > 0 && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#F0FDF4', borderRadius: 8, fontSize: 13, color: '#065F46', fontWeight: 700 }}>
                      💰 Итого разнесено: {fmt(report.summary.total_amount_kgs)} KGS
                    </div>
                  )}
                </div>

                {/* Итоги по счетам */}
                {Object.keys(report.totals_by_debit_account || {}).length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0', overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontWeight: 700, fontSize: 13, color: '#374151' }}>
                      Итоги по дебетовым счетам
                    </div>
                    {Object.entries(report.totals_by_debit_account).map(([account, amount]) => (
                      <div key={account} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #F9FAFB', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{account}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(amount)} KGS</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Проводки на проверке */}
                {report.needs_review?.length > 0 && (
                  <div style={{ background: '#FFFBEB', borderRadius: 14, border: '1px solid #FDE68A', overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #FDE68A', fontWeight: 700, fontSize: 13, color: '#92400E' }}>
                      ⚠️ Требуют проверки бухгалтером ({report.needs_review.length})
                    </div>
                    {report.needs_review.map(e => (
                      <div key={e.id} style={{ padding: '12px 16px', borderBottom: '1px solid #FEF3C7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                            Дт {e.debit?.split(' ')[0]} → Кт {e.credit?.split(' ')[0]}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{fmt(e.amount)} {e.currency}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{e.description}</div>
                        {e.reasoning && (
                          <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>🤖 {e.reasoning}</div>
                        )}
                        <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, marginTop: 4 }}>Уверенность AI: {e.confidence}%</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Список всех разнесённых */}
                {report.posted_entries?.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontWeight: 700, fontSize: 13, color: '#374151' }}>
                      ✅ Разнесённые проводки ({report.posted_entries.length})
                    </div>
                    {report.posted_entries.map(e => (
                      <div key={e.id} style={{ padding: '11px 16px', borderBottom: '1px solid #F9FAFB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, marginBottom: 2 }}>
                            <span style={{ fontWeight: 800, color: '#4338CA', background: '#EEF2FF', padding: '1px 6px', borderRadius: 4 }}>Дт {e.debit?.split(' ')[0]}</span>
                            <span style={{ color: '#9CA3AF', margin: '0 6px' }}>→</span>
                            <span style={{ fontWeight: 800, color: '#065F46', background: '#D1FAE5', padding: '1px 6px', borderRadius: 4 }}>Кт {e.credit?.split(' ')[0]}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280' }}>{e.description}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)} {e.currency}</div>
                          <div style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>{e.confidence}% AI</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {report.summary?.total_entries === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 14, border: '1px solid #E8EAF0', color: '#9CA3AF' }}>
                    За этот день проводок нет
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
