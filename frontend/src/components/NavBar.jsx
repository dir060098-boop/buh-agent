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
        .nb-wrap {
          position: sticky; top: 0; z-index: 50;
          height: 48px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: 0 1px 6px rgba(0,0,0,0.07);
          display: flex; align-items: center;
          padding: 0 12px; gap: 4px;
          font-family: Manrope, sans-serif;
        }
        .nb-company {
          display: flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px;
          font-size: 13px; font-weight: 700;
          color: var(--text2);
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          background: transparent;
          transition: background-color 0.15s, color 0.15s;
          max-width: 180px; overflow: hidden; text-overflow: ellipsis;
        }
        .nb-company:hover { background: var(--surface2); color: var(--text); }
        .nb-sep {
          width: 1px; height: 20px;
          background: var(--border);
          flex-shrink: 0;
          margin: 0 4px;
        }
        .nb-tabs {
          display: flex; align-items: center;
          gap: 2px; flex: 1; overflow: hidden;
        }
        .nb-tab {
          display: flex; align-items: center; gap: 5px;
          height: 32px; padding: 0 12px;
          border-radius: 8px;
          border: none; cursor: pointer;
          font-family: Manrope, sans-serif;
          font-size: 13px; font-weight: 600;
          white-space: nowrap;
          transition: background-color 0.15s, color 0.15s;
        }
        .nb-tab.active {
          background: var(--accent);
          color: #fff;
        }
        .nb-tab.inactive {
          background: transparent;
          color: var(--text3);
        }
        .nb-tab.inactive:hover {
          background: var(--surface2);
          color: var(--text);
        }
        .nb-icon { font-size: 14px; line-height: 1; }
        .nb-label { font-size: 12px; }

        @media (max-width: 960px) {
          .nb-label { display: none; }
          .nb-tab { padding: 0 10px; }
        }
        @media (max-width: 500px) {
          .nb-company span.nb-co-name { display: none; }
          .nb-company { padding: 0 8px; }
        }
      `}</style>

      <nav className="nb-wrap">

        {/* Компания → главная */}
        <div
          className="nb-company"
          onClick={() => navigate(`/company/${companyId}`)}
          title={company?.name}
        >
          <span style={{ fontSize: 13 }}>←</span>
          <span className="nb-co-name">{company?.name || '…'}</span>
        </div>

        <div className="nb-sep" />

        {/* Вкладки */}
        <div className="nb-tabs">
          {MODULES.map(m => {
            const active = current === m.key
            return (
              <button
                key={m.key}
                className={`nb-tab ${active ? 'active' : 'inactive'}`}
                onClick={() => navigate(`/company/${companyId}/${m.key}`)}
              >
                <span className="nb-icon">{m.icon}</span>
                <span className="nb-label">{m.label}</span>
              </button>
            )
          })}
        </div>

      </nav>
    </>
  )
}
