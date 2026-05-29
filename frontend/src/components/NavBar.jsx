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

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  return (
    <>
      <style>{`
        /* ── Обёртка: 3-колоночный grid ──────────────────────────── */
        .nb-wrap {
          position: sticky; top: 0; z-index: 50;
          height: 48px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: 0 1px 6px rgba(0,0,0,0.07);
          font-family: Manrope, sans-serif;

          display: grid;
          grid-template-columns: 200px 1fr 200px;
          align-items: center;
          padding: 0 8px;
          box-sizing: border-box;
        }

        /* ── Левая: название компании (фиксированная ширина) ─────── */
        .nb-left {
          display: flex; align-items: center;
          min-width: 0;                 /* важно для ellipsis внутри grid */
        }
        .nb-company {
          display: flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px;
          font-size: 13px; font-weight: 700;
          color: var(--text2);
          cursor: pointer;
          white-space: nowrap;
          background: transparent;
          transition: background-color 0.15s, color 0.15s;
          max-width: 192px;
          overflow: hidden;
        }
        .nb-company:hover { background: var(--surface2); color: var(--text); }
        .nb-co-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Центр: вкладки всегда по центру ────────────────────── */
        .nb-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;                     /* расстояние между кнопками */
        }

        /* ── Правая: зеркало левой (пустая, держит симметрию) ────── */
        .nb-right { width: 200px; }

        /* ── Кнопка вкладки ─────────────────────────────────────── */
        .nb-tab {
          display: flex; align-items: center; gap: 5px;
          height: 32px; padding: 0 12px;
          border-radius: 8px;
          border: none; cursor: pointer;
          font-family: Manrope, sans-serif;
          font-size: 13px; font-weight: 600;
          white-space: nowrap;
          transition: background-color 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .nb-tab.active  { background: var(--accent); color: #fff; }
        .nb-tab.inactive { background: transparent; color: var(--text3); }
        .nb-tab.inactive:hover { background: var(--surface2); color: var(--text); }

        .nb-icon  { font-size: 14px; line-height: 1; }
        .nb-label { font-size: 12px; }

        /* ── Планшет ≤960px: скрываем подписи ───────────────────── */
        @media (max-width: 960px) {
          .nb-wrap {
            grid-template-columns: 140px 1fr 140px;
          }
          .nb-right { width: 140px; }
          .nb-label { display: none; }
          .nb-tab   { padding: 0 9px; gap: 0; }
          .nb-center { gap: 4px; }
        }

        /* ── Мобильный ≤640px ────────────────────────────────────── */
        @media (max-width: 640px) {
          .nb-wrap {
            grid-template-columns: 42px 1fr 42px;
            padding: 0 4px;
          }
          .nb-right { width: 42px; }
          .nb-co-name { display: none; }
          .nb-company { padding: 0 8px; max-width: 42px; }
          .nb-tab { padding: 0 8px; }
          .nb-center {
            gap: 2px;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }
          .nb-center::-webkit-scrollbar { display: none; }
        }
      `}</style>

      <nav className="nb-wrap">

        {/* Левая: ← Название компании */}
        <div className="nb-left">
          <div
            className="nb-company"
            onClick={() => navigate(`/company/${companyId}`)}
            title={company?.name}
          >
            <span style={{ fontSize: 13, flexShrink: 0 }}>←</span>
            <span className="nb-co-name">{company?.name || '…'}</span>
          </div>
        </div>

        {/* Центр: вкладки */}
        <div className="nb-center">
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

        {/* Правая: пустая — держит симметрию */}
        <div className="nb-right" />

      </nav>
    </>
  )
}
