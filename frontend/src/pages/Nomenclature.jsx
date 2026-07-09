import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { nomenclature as api } from '../api/client'
import NavBar from '../components/NavBar'
import ConfirmModal from '../components/ConfirmModal'
import { useToast } from '../hooks/useToast'
import Toast from '../components/Toast'

const LBL = { display:'block', fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }
const INP = { width:'100%', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'Manrope, sans-serif', boxSizing:'border-box', outline:'none' }
const SEL = { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 10px', color:'var(--text)', fontSize:13, fontFamily:'Manrope, sans-serif' }

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

const STATUS_BADGE = {
  auto:      { label:'Авто',        color:'var(--success)', bg:'var(--success-light)' },
  suggested: { label:'Предложено',  color:'var(--warn)',    bg:'var(--warn-light)' },
  review:    { label:'Не найдено',  color:'var(--error)',   bg:'var(--error-light)' },
  confirmed: { label:'Подтверждено',color:'var(--accent)',  bg:'var(--accent-light)' },
}

export default function Nomenclature() {
  const { companyId } = useParams()
  const [tab, setTab] = useState('review')   // review | catalog
  const [stats, setStats] = useState(null)
  const { toasts, showToast, removeToast } = useToast()
  const [confirmState, setConfirmState] = useState(null)

  const loadStats = useCallback(() => {
    api.stats(companyId).then(r => setStats(r.data)).catch(() => {})
  }, [companyId])
  useEffect(() => { loadStats() }, [loadStats])

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:'Manrope, sans-serif' }}>
      <NavBar companyId={companyId} current="nomenclature" />

      {/* Шапка */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'10px 24px', display:'flex', alignItems:'center', gap:14, boxShadow:'var(--shadow-sm)', flexWrap:'wrap' }}>
        <div style={{ fontWeight:800, fontSize:15, color:'var(--text)', flex:1 }}>📦 Товарная номенклатура</div>
        {stats && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'var(--text3)', padding:'4px 10px', background:'var(--surface2)', borderRadius:20, fontWeight:600 }}>
              {stats.items} позиций
            </span>
            {stats.pending > 0 && (
              <span style={{ fontSize:12, color:'var(--warn)', padding:'4px 10px', background:'var(--warn-light)', borderRadius:20, fontWeight:700 }}>
                ⏳ {stats.pending} строк ждут проверки
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 16px' }}>
        {/* Вкладки */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['review', `🔍 Проверка${stats?.pending ? ` (${stats.pending})` : ''}`], ['catalog', '📚 Справочник']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ background: tab === key ? 'var(--accent)' : 'var(--surface)', color: tab === key ? '#fff' : 'var(--text2)', border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border)'}`, borderRadius:'var(--radius-sm)', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'review' && <ReviewTab companyId={companyId} showToast={showToast} onChanged={loadStats} />}
        {tab === 'catalog' && <CatalogTab companyId={companyId} showToast={showToast} setConfirmState={setConfirmState} onChanged={loadStats} />}
      </div>

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

// ══════════ ВКЛАДКА: ПРОВЕРКА (review-очередь) ══════════
function ReviewTab({ companyId, showToast, onChanged }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [linkModal, setLinkModal] = useState(null)   // {lineIds: [...], names: [...]}
  const [working, setWorking] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.lines(companyId, { status: 'suggested,review', limit: 300 })
      .then(r => { setLines(r.data.items); setSelected(new Set()) })
      .catch(() => setLines([]))
      .finally(() => setLoading(false))
  }, [companyId])
  useEffect(() => { load() }, [load])

  // Группировка одинаковых строк (нормализованное имя): решение принимается один раз
  const groups = []
  const byName = new Map()
  for (const l of lines) {
    const key = `${l.raw_name}`.toUpperCase().replace(/\s+/g, ' ').trim()
    if (!byName.has(key)) { byName.set(key, []); groups.push(key) }
    byName.get(key).push(l)
  }

  function toggleGroup(key) {
    const ids = byName.get(key).map(l => l.id)
    setSelected(prev => {
      const s = new Set(prev)
      const allIn = ids.every(id => s.has(id))
      ids.forEach(id => allIn ? s.delete(id) : s.add(id))
      return s
    })
  }

  async function acceptSuggested(lineIds) {
    setWorking(true)
    try {
      const r = await api.bulkAccept(companyId, { line_ids: lineIds })
      showToast(`Подтверждено: ${r.data.accepted}`)
      load(); onChanged()
    } catch (e) { showToast(e.response?.data?.detail || 'Ошибка', 'error') }
    finally { setWorking(false) }
  }

  async function acceptAllSuggested() {
    const ids = lines.filter(l => l.match_status === 'suggested').map(l => l.id)
    if (ids.length === 0) return
    await acceptSuggested(ids)
  }

  async function createItemFromGroup(key) {
    const groupLines = byName.get(key)
    setWorking(true)
    try {
      // Первая строка создаёт канон, остальные привязываются к нему
      const first = groupLines[0]
      const r = await api.createFromLine(companyId, first.id, {})
      const itemId = r.data.item.id
      const rest = groupLines.slice(1).map(l => l.id)
      if (rest.length) await api.bulkLink(companyId, { line_ids: rest, item_id: itemId })
      showToast(`Создана позиция «${r.data.item.name}» (${groupLines.length} строк)`)
      load(); onChanged()
    } catch (e) { showToast(e.response?.data?.detail || 'Ошибка', 'error') }
    finally { setWorking(false) }
  }

  const suggestedCount = lines.filter(l => l.match_status === 'suggested').length

  return (
    <div>
      {/* Панель массовых операций */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        {suggestedCount > 0 && (
          <button onClick={acceptAllSuggested} disabled={working}
            style={{ background:'var(--success)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            ✅ Принять все предложенные ({suggestedCount})
          </button>
        )}
        {selected.size > 0 && (
          <>
            <button onClick={() => setLinkModal({ lineIds: [...selected] })}
              style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              🔗 Привязать выбранные ({selected.size}) к позиции…
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit', color:'var(--text3)' }}>
              Снять выделение
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--text3)', fontSize:13 }}>Загрузка...</div>
      ) : groups.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:40, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>✨</div>
          <div style={{ fontWeight:700, color:'var(--text)', marginBottom:4 }}>Очередь пуста</div>
          <div style={{ fontSize:13, color:'var(--text3)' }}>Все строки документов привязаны к номенклатуре</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {groups.map(key => {
            const groupLines = byName.get(key)
            const first = groupLines[0]
            const badge = STATUS_BADGE[first.match_status] || STATUS_BADGE.review
            const allSelected = groupLines.every(l => selected.has(l.id))
            return (
              <div key={key} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px 16px', boxShadow:'var(--shadow-sm)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(key)}
                    style={{ width:16, height:16, marginTop:3, cursor:'pointer', accentColor:'var(--accent)' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{first.raw_name}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:badge.color, background:badge.bg, padding:'2px 8px', borderRadius:10 }}>{badge.label}</span>
                      {groupLines.length > 1 && (
                        <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                          ×{groupLines.length} строк
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text3)', marginTop:4, display:'flex', gap:12, flexWrap:'wrap' }}>
                      {first.supplier_code && <span>Код: {first.supplier_code}</span>}
                      <span>{first.unit || 'шт'}</span>
                      {first.counterparty && <span>{first.counterparty}</span>}
                      <span>{groupLines.reduce((s, l) => s + (l.qty || 0), 0)} ед. · {fmt(groupLines.reduce((s, l) => s + (l.total || 0), 0))} сом</span>
                    </div>
                    {first.match_status === 'suggested' && first.item_name && (
                      <div style={{ fontSize:12, color:'var(--warn-text)', background:'var(--warn-light)', padding:'6px 10px', borderRadius:'var(--radius-sm)', marginTop:6, display:'inline-block' }}>
                        🤖 Похоже на: <b>{first.item_name}</b> {first.match_note && `(${first.match_note})`}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                    {first.match_status === 'suggested' && (
                      <button onClick={() => acceptSuggested(groupLines.map(l => l.id))} disabled={working}
                        style={{ background:'var(--success-light)', color:'var(--success)', border:'1px solid var(--success)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                        ✓ Да, это оно
                      </button>
                    )}
                    <button onClick={() => setLinkModal({ lineIds: groupLines.map(l => l.id) })}
                      style={{ background:'var(--surface2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      🔗 Выбрать позицию
                    </button>
                    <button onClick={() => createItemFromGroup(key)} disabled={working}
                      style={{ background:'var(--accent-light)', color:'var(--accent)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      + Новая позиция
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {linkModal && (
        <LinkModal companyId={companyId} lineIds={linkModal.lineIds}
          onClose={() => setLinkModal(null)}
          onDone={() => { setLinkModal(null); load(); onChanged() }}
          showToast={showToast} />
      )}
    </div>
  )
}

// ══════════ МОДАЛ: выбор канонической позиции ══════════
function LinkModal({ companyId, lineIds, onClose, onDone, showToast }) {
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      api.items(companyId, { search: search || undefined, limit: 30 })
        .then(r => setItems(r.data.items))
        .catch(() => setItems([]))
    }, 250)
    return () => clearTimeout(t)
  }, [companyId, search])

  async function link(itemId) {
    setSaving(true)
    try {
      await api.bulkLink(companyId, { line_ids: lineIds, item_id: itemId })
      showToast(`Привязано строк: ${lineIds.length}`)
      onDone()
    } catch (e) { showToast(e.response?.data?.detail || 'Ошибка', 'error'); setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', width:'100%', maxWidth:520, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:800, fontSize:15 }}>
          🔗 Привязать {lineIds.length > 1 ? `${lineIds.length} строк` : 'строку'} к позиции
        </div>
        <div style={{ padding:'12px 18px' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, артикулу, коду 1С..." style={INP} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 18px 14px' }}>
          {items.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:13 }}>Ничего не найдено</div>
          ) : items.map(it => (
            <div key={it.id} onClick={() => !saving && link(it.id)}
              style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderRadius:'var(--radius-sm)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{it.name}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                {it.category}{it.article && ` · арт. ${it.article}`} · {it.base_unit}
                {it.code_1c && ` · 1С: ${it.code_1c}`} · {it.alias_count} алиасов
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)' }}>
          <button onClick={onClose} style={{ width:'100%', background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:10, fontSize:13, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)' }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════ ВКЛАДКА: СПРАВОЧНИК ══════════
function CatalogTab({ companyId, showToast, setConfirmState, onChanged }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState(null)   // модал редактирования
  const [aliasesFor, setAliasesFor] = useState(null) // {item, aliases}
  const LIMIT = 100

  const load = useCallback(() => {
    setLoading(true)
    api.items(companyId, { search: search || undefined, limit: LIMIT, offset: 0 })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setHasMore(r.data.has_more) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [companyId, search])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function loadMore() {
    const r = await api.items(companyId, { search: search || undefined, limit: LIMIT, offset: items.length })
    setItems(prev => [...prev, ...r.data.items])
    setHasMore(r.data.has_more)
  }

  async function openAliases(item) {
    const r = await api.aliases(companyId, item.id)
    setAliasesFor({ item, aliases: r.data })
  }

  function deleteAlias(alias) {
    setConfirmState({
      title: 'Удалить алиас?',
      message: `«${alias.raw_name}» больше не будет автоматически привязываться. Используйте это для исправления ошибочной привязки.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await api.deleteAlias(companyId, alias.id)
        const r = await api.aliases(companyId, aliasesFor.item.id)
        setAliasesFor(prev => ({ ...prev, aliases: r.data }))
        showToast('Алиас удалён')
        onChanged()
      }
    })
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск: название, артикул, код 1С..." style={{ ...INP, maxWidth:400 }} />
        <div style={{ fontSize:12, color:'var(--text3)', alignSelf:'center' }}>{total} позиций</div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 80px 110px 90px 90px', gap:8, padding:'10px 16px', borderBottom:'2px solid var(--border)', background:'var(--surface2)', fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
          <div>Название</div>
          <div>Артикул</div>
          <div>ЕИ</div>
          <div>Код 1С</div>
          <div style={{ textAlign:'right' }}>Алиасы</div>
          <div></div>
        </div>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text3)', fontSize:13 }}>Загрузка...</div>
        ) : items.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text3)', fontSize:13 }}>
            {search ? 'Ничего не найдено' : 'Справочник пуст — позиции появятся из строк документов через Сканер'}
          </div>
        ) : items.map(it => (
          <div key={it.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 80px 110px 90px 90px', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--border)', fontSize:13, alignItems:'center' }}>
            <div style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.name}>{it.name}</div>
            <div style={{ color:'var(--text2)' }}>{it.article || '—'}</div>
            <div style={{ color:'var(--text2)' }}>{it.base_unit}</div>
            <div style={{ color: it.code_1c ? 'var(--success)' : 'var(--text4)', fontWeight: it.code_1c ? 700 : 400 }}>{it.code_1c || 'нет'}</div>
            <div style={{ textAlign:'right' }}>
              <button onClick={() => openAliases(it)}
                style={{ background:'none', border:'none', color:'var(--accent)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                {it.alias_count} →
              </button>
            </div>
            <div style={{ textAlign:'right' }}>
              <button onClick={() => setEditItem(it)}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)' }}>
                ✏️
              </button>
            </div>
          </div>
        ))}
        {hasMore && (
          <div style={{ padding:12, textAlign:'center' }}>
            <button onClick={loadMore} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 20px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)' }}>
              Показать ещё
            </button>
          </div>
        )}
      </div>

      {/* Модал редактирования канона */}
      {editItem && (
        <EditItemModal companyId={companyId} item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); load(); showToast('Сохранено') }}
          showToast={showToast} />
      )}

      {/* Модал алиасов */}
      {aliasesFor && (
        <div onClick={() => setAliasesFor(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', width:'100%', maxWidth:560, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontWeight:800, fontSize:15 }}>Алиасы — как называют поставщики</div>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{aliasesFor.item.name}</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'10px 18px' }}>
              {aliasesFor.aliases.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:13 }}>Алиасов пока нет</div>
              ) : aliasesFor.aliases.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{a.raw_name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {a.supplier_inn ? `ИНН ${a.supplier_inn}` : 'без ИНН'}
                      {a.supplier_code && ` · код ${a.supplier_code}`}
                      {a.unit && ` · ${a.unit}`}
                      {a.unit_ratio !== 1 && ` · ×${a.unit_ratio}`}
                      {` · использован ${a.use_count} раз`}
                    </div>
                  </div>
                  <button onClick={() => deleteAlias(a)}
                    style={{ background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit', color:'var(--error)' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)' }}>
              <button onClick={() => setAliasesFor(null)} style={{ width:'100%', background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:10, fontSize:13, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)' }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════ МОДАЛ: редактирование канона ══════════
function EditItemModal({ companyId, item, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    name: item.name, category: item.category, article: item.article,
    base_unit: item.base_unit, code_1c: item.code_1c,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.updateItem(companyId, item.id, form)
      onSaved()
    } catch (e) { showToast(e.response?.data?.detail || 'Ошибка', 'error'); setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', width:'100%', maxWidth:440, boxShadow:'var(--shadow-lg)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:800, fontSize:15 }}>
          ✏️ Каноническая позиция
        </div>
        <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={LBL}>Название</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INP} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10 }}>
            <div>
              <label style={LBL}>Категория</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={INP} />
            </div>
            <div>
              <label style={LBL}>Артикул</label>
              <input value={form.article} onChange={e => setForm(f => ({ ...f, article: e.target.value }))} style={INP} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10 }}>
            <div>
              <label style={LBL}>Базовая ЕИ</label>
              <input value={form.base_unit} onChange={e => setForm(f => ({ ...f, base_unit: e.target.value }))} style={INP} />
            </div>
            <div>
              <label style={LBL}>Код 1С</label>
              <input value={form.code_1c} onChange={e => setForm(f => ({ ...f, code_1c: e.target.value }))}
                placeholder="код позиции в справочнике 1С" style={INP} />
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', padding:'8px 12px', borderRadius:'var(--radius-sm)' }}>
            💡 Код 1С связывает позицию с существующим справочником — при выгрузке 1С не создаст дубль
          </div>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
          <button onClick={save} disabled={saving || !form.name.trim()}
            style={{ flex:2, background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:11, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
          <button onClick={onClose} style={{ flex:1, background:'none', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:11, fontSize:13, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)' }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
