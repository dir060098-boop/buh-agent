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

// ── Кэш имён компаний: заполняется один раз, живёт всю сессию ─────────────
// При переходе между модулями имя уже известно → не мигает «…»
const _nameCache = new Map()

export default function NavBar({ companyId, current, companyName: nameProp }) {
  const navigate = useNavigate()

  // Инициализируем имя из пропа, кэша или дефолта
  const [name, setName] = useState(
    nameProp || _nameCache.get(String(companyId)) || '…'
  )

  useEffect(() => {
    const key = String(companyId)

    // Проп передан извне (из страницы-родителя) — доверяем ему
    if (nameProp) {
      _nameCache.set(key, nameProp)
      setName(nameProp)
      return
    }

    // Есть в кэше — сразу показываем, запрос не нужен
    if (_nameCache.has(key)) {
      setName(_nameCache.get(key))
      return
    }

    // Первый визит — тихо грузим и кладём в кэш
    companies.get(companyId)
      .then(r => {
        const n = r.data?.name || ''
        _nameCache.set(key, n)
        setName(n)
      })
      .catch(() => {})
  }, [companyId, nameProp])

  return (
    <>
      <style>{`
        /* ── Обёртка: 3 колонки ────────────────────────────────────────
           [фикс. левая] [1fr центр] [фикс. правая-зеркало]
           Левая и правая одного размера → центр математически по середине.
           Имя компании может быть любой длины — кнопки НЕ двигаются.
        ─────────────────────────────────────────────────────────────── */
        .nb-wrap {
          position: sticky; top: 0; z-index: 50;
          height: 48px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: 0 1px 6px rgba(0,0,0,0.07);
          font-family: Manrope, sans-serif;
          box-sizing: border-box;

          display: grid;
          grid-template-columns: 210px 1fr 210px;
          align-items: center;
          padding: 0 8px;
        }

        /* ── Левая колонка: название компании ─────────────────────── */
        .nb-left {
          display: flex;
          align-items: center;
          min-width: 0;
          overflow: hidden;
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
          max-width: 100%;
          overflow: hidden;
        }
        .nb-company:hover { background: var(--surface2); color: var(--text); }
        .nb-co-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Центральная колонка: вкладки всегда в середине ───────── */
        .nb-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        /* ── Правая колонка: зеркало левой (пустая) ───────────────── */
        .nb-right { /* ничего */ }

        /* ── Кнопка вкладки ───────────────────────────────────────── */
        .nb-tab {
          display: flex; align-items: center; gap: 5px;
          height: 32px; padding: 0 13px;
          border-radius: 8px;
          border: none; cursor: pointer;
          font-family: Manrope, sans-serif;
          font-size: 13px; font-weight: 600;
          white-space: nowrap;
          transition: background-color 0.15s, color 0.15s;
          flex-shrink: 0;
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
        .nb-icon  { font-size: 14px; line-height: 1; }
        .nb-label { font-size: 12px; }

        /* ── Планшет ≤ 960px: скрываем подписи ───────────────────── */
        @media (max-width: 960px) {
          .nb-wrap {
            grid-template-columns: 150px 1fr 150px;
          }
          .nb-label { display: none; }
          .nb-tab   { padding: 0 9px; gap: 0; }
          .nb-center { gap: 4px; }
        }

        /* ── Мобильный ≤ 600px: компактная левая + прокрутка кнопок ─ */
        @media (max-width: 600px) {
          .nb-wrap {
            grid-template-columns: 44px 1fr 44px;
            padding: 0 4px;
          }
          .nb-co-name { display: none; }
          .nb-company { padding: 0 8px; max-width: 44px; }
          .nb-tab     { padding: 0 8px; }
          .nb-center  {
            gap: 2px;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            justify-content: flex-start;
          }
          .nb-center::-webkit-scrollbar { display: none; }
        }
      `}</style>

      <nav className="nb-wrap">

        {/* Левая: ← Название компании (фиксированная колонка) */}
        <div className="nb-left">
          <div
            className="nb-company"
            onClick={() => navigate(`/company/${companyId}`)}
            title={name !== '…' ? name : ''}
          >
            <span style={{ fontSize: 13, flexShrink: 0 }}>←</span>
            <span className="nb-co-name">{name}</span>
          </div>
        </div>

        {/* Центр: вкладки — всегда строго по центру */}
        <div className="nb-center">
          {MODULES.map(m => {
            const active = current === m.key
            return (
              <button
                key={m.key}
                className={`nb-tab ${active ? 'active' : 'inactive'}`}
                onClick={() => navigate(`/company/${companyId}/${m.key}`)}
                title={m.label}
              >
                <span className="nb-icon">{m.icon}</span>
                <span className="nb-label">{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Правая: зеркало левой, держит симметрию */}
        <div className="nb-right" />

      </nav>
    </>
  )
}
