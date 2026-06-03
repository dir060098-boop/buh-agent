import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { companies, posting } from '../api/client'

const MODULES = [
  { icon:'📷', title:'Сканер',        path:'scanner'        },
  { icon:'🗂',  title:'Архив',          path:'documents'      },
  { icon:'📋', title:'Журнал',         path:'journal'        },
  { icon:'⚡', title:'ЭСФ',            path:'esf'            },
  { icon:'🏦', title:'Банк',           path:'bank'           },
  { icon:'💼', title:'Зарплата',       path:'salary'         },
  { icon:'📅', title:'Сроки',          path:'deadlines'      },
  { icon:'💬', title:'Чат',            path:'communications' },
]

const HEALTH_LABEL = { error:'🔴 Требует внимания', warn:'⚠️ Есть задачи', ok:'✅ Всё в порядке' }
const HEALTH_COLOR = { error:'var(--error)', warn:'var(--warn)', ok:'var(--success)' }
const HEALTH_BG    = { error:'var(--error-light)', warn:'var(--warn-light)', ok:'var(--success-light)' }
const HEALTH_BORDER= { error:'var(--error)', warn:'var(--warn)', ok:'var(--success)' }

export default function CompanyMenu() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [company, setCompany]     = useState(null)
  const [stats, setStats]         = useState(null)
  const [posting_, setPosting]    = useState(false)

  useEffect(() => {
    companies.get(id).then(r => setCompany(r.data)).catch(() => {})
    companies.stats(id).then(r => setStats(r.data)).catch(() => {})
  }, [id])

  async function handlePostAll() {
    setPosting(true)
    try {
      await posting.autoAll(id)
      companies.stats(id).then(r => setStats(r.data)).catch(() => {})
    } catch {}
    finally { setPosting(false) }
  }

  const s = stats

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'Manrope, sans-serif' }}>

      {/* Шапка */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={() => navigate('/')}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Назад
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{company?.name || `Компания #${id}`}</div>
          {company?.inn && <div style={{ fontSize: 12, color: 'var(--text3)' }}>ИНН {company.inn} · {company.tax_regime}</div>}
        </div>
        {/* Быстрые действия в шапке */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/company/${id}/scanner`)}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow)' }}>
            📷 Сканировать
          </button>
          {s?.pending_docs > 0 && (
            <button onClick={handlePostAll} disabled={posting_}
              style={{ background: posting_ ? 'var(--text4)' : 'var(--warn)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: posting_ ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {posting_ ? '⏳ Разношу...' : `⚡ Разнести (${s.pending_docs})`}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>

        {/* ── Статус здоровья ── */}
        {s && (
          <div style={{ background: HEALTH_BG[s.health], border: `1.5px solid ${HEALTH_BORDER[s.health]}`, borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: HEALTH_COLOR[s.health] }}>
              {HEALTH_LABEL[s.health]}
            </div>
            {s.overdue_deadlines > 0 && (
              <span style={{ fontSize: 12, color: 'var(--error)', fontWeight: 600 }}>
                · {s.overdue_deadlines} просроченных дедлайна
              </span>
            )}
          </div>
        )}

        {/* ── Карточки метрик ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            {
              icon: '📄', label: 'Документы', val: s?.doc_count ?? '…',
              sub: s?.pending_docs > 0 ? `${s.pending_docs} ожидают разноски` : 'Все обработаны',
              subColor: s?.pending_docs > 0 ? 'var(--warn)' : 'var(--success)',
              onClick: () => navigate(`/company/${id}/documents`),
            },
            {
              icon: '📋', label: 'Проводки', val: s?.journal_count ?? '…',
              sub: s?.needs_review > 0 ? `${s.needs_review} на проверке` : 'Нет замечаний',
              subColor: s?.needs_review > 0 ? 'var(--warn)' : 'var(--success)',
              onClick: () => navigate(`/company/${id}/journal`),
            },
            {
              icon: '⚡', label: 'ЭСФ', val: s?.esf_pending ?? '…',
              sub: s?.esf_pending > 0 ? 'Не приняты' : 'Всё принято',
              subColor: s?.esf_pending > 0 ? 'var(--warn)' : 'var(--success)',
              onClick: () => navigate(`/company/${id}/esf`),
            },
            {
              icon: '🏦', label: 'Банк', val: s?.unmatched_bank ?? '…',
              sub: s?.unmatched_bank > 0 ? 'Не сверено' : 'Сверено',
              subColor: s?.unmatched_bank > 0 ? 'var(--warn)' : 'var(--success)',
              onClick: () => navigate(`/company/${id}/bank`),
            },
          ].map(card => (
            <div key={card.label} onClick={card.onClick}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 14px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {card.icon} {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
                {card.val}
              </div>
              <div style={{ fontSize: 11, color: card.subColor, fontWeight: 600 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Ближайшие дедлайны ── */}
        {s?.upcoming_deadlines?.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>⏰ Ближайшие дедлайны (7 дней)</div>
              <button onClick={() => navigate(`/company/${id}/deadlines`)}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                Все →
              </button>
            </div>
            {s.upcoming_deadlines.map(d => (
              <div key={d.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{d.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{d.date}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: d.days_left <= 2 ? 'var(--error-light)' : 'var(--warn-light)',
                    color: d.days_left <= 2 ? 'var(--error)' : 'var(--warn)',
                  }}>
                    {d.days_left === 0 ? 'Сегодня' : `через ${d.days_left} дн.`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Модули ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Модули
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {MODULES.map(m => (
            <div key={m.path} onClick={() => navigate(`/company/${id}/${m.path}`)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.title}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
