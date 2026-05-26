import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { companies } from '../api/client'

const MODULES = [
  { key: 'scanner',   icon: '📷', label: 'Сканер'   },
  { key: 'documents', icon: '🗂',  label: 'Архив'    },
  { key: 'journal',   icon: '📋', label: 'Журнал'   },
  { key: 'esf',       icon: '⚡', label: 'ЭСФ'      },
  { key: 'bank',      icon: '🏦', label: 'Банк'     },
  { key: 'salary',    icon: '💼', label: 'Зарплата' },
  { key: 'deadlines', icon: '📅', label: 'Сроки'    },
]

export default function NavBar({ companyId, current }) {
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  return (
    <>
      <style>{`
        .nb-label { display: inline; margin-left: 5px; }
        .nb-btn {
          display: flex; align-items: center; padding: 0 13px; height: 44px;
          border: none; cursor: pointer; font-family: Manrope, sans-serif;
          font-size: 13px; font-weight: 600; transition: all 0.12s;
          white-space: nowrap; background: transparent;
        }
        .nb-co {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 700; color: var(--text);
          cursor: pointer; padding: 0 12px; height: 44px;
          border-right: 1px solid var(--border); flex-shrink: 0;
          white-space: nowrap; max-width: 200px; overflow: hidden;
          text-overflow: ellipsis;
        }
        .nb-co:hover { background: var(--surface2); }
        @media (max-width: 900px) {
          .nb-label { display: none; }
          .nb-btn { padding: 0 10px; }
        }
        @media (max-width: 480px) {
          .nb-co { max-width: 100px; font-size: 11px; }
        }
      `}</style>

      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        height: 44,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'stretch',
        fontFamily: 'Manrope, sans-serif',
      }}>

        {/* Название компании — клик → главная страница */}
        <div className="nb-co" onClick={() => navigate(`/company/${companyId}`)}>
          <span style={{ fontSize: 15 }}>🏢</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company?.name || '…'}
          </span>
        </div>

        {/* Вкладки модулей */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflow: 'hidden' }}>
          {MODULES.map(m => {
            const active = current === m.key
            return (
              <button
                key={m.key}
                className="nb-btn"
                onClick={() => navigate(`/company/${companyId}/${m.key}`)}
                onMouseEnter={() => setHover(m.key)}
                onMouseLeave={() => setHover(null)}
                style={{
                  color: active ? 'var(--accent)' : hover === m.key ? 'var(--text)' : 'var(--text3)',
                  background: active ? 'var(--accent-light)' : hover === m.key ? 'var(--surface2)' : 'transparent',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: active ? 700 : 600,
                }}
              >
                <span>{m.icon}</span>
                <span className="nb-label">{m.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
