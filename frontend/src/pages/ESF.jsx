import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { esf as esfApi, companies, bank, documents } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import NavBar from '../components/NavBar'

// ── Стили ──────────────────────────────────────────────────────────────────
const SEL = {
  background: 'var(--surface)', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 10px',
  color: 'var(--text)', fontSize: 13, fontFamily: 'Manrope, sans-serif',
}
const INP  = { ...SEL, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const LBL  = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}
const GRID_IN  = '120px 90px 1fr 110px 110px 90px 110px 80px 110px'
const GRID_OUT = '120px 90px 1fr 110px 110px 90px 110px 80px 110px'

// ── Утилиты ────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
function calcVat(amount, rate) {
  if (rate === '12') return Math.round(Number(amount) * 12 / 112 * 100) / 100
  return 0
}

const VAT_LABELS = { '12': 'НДС 12%', '0': 'НДС 0%', 'exempt': 'Без НДС' }
const today = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  direction: 'incoming', esf_number: '', esf_date: today,
  supplier_name: '', supplier_inn: '', buyer_name: '', buyer_inn: '',
  contract_number: '', amount: '', vat_rate: '12', vat_amount: '',
}

// ── Главный компонент ───────────────────────────────────────────────────────
export default function ESF() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [company, setCompany]       = useState(null)
  const [tab, setTab]               = useState('incoming')   // incoming | outgoing
  const [records, setRecords]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [confirmState, setConfirmState] = useState(null)

  // Фильтры
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [search,   setSearch]   = useState('')

  // Форма добавления
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)

  // Книга покупок/продаж
  const [showBook, setShowBook] = useState(false)
  const [book, setBook]         = useState(null)

  // Модал привязки к транзакции
  const [linkTxModal, setLinkTxModal]   = useState(null)  // { esfId }
  const [transactions, setTransactions] = useState([])
  const [txSearch, setTxSearch]         = useState('')

  // Модал привязки к документу
  const [linkDocModal, setLinkDocModal] = useState(null)  // { esfId }
  const [docs, setDocs]                 = useState([])
  const [docSearch, setDocSearch]       = useState('')

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  const loadRecords = useCallback(() => {
    setLoading(true)
    const params = { direction: tab }
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo
    esfApi.list(companyId, params)
      .then(r => setRecords(r.data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [companyId, tab, dateFrom, dateTo])

  useEffect(() => { loadRecords() }, [loadRecords])

  // ── Фильтрация по поиску (клиент-сайд) ──────────────────────────────────
  const filtered = records.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (r.esf_number || '').toLowerCase().includes(q)
      || (r.supplier_name || '').toLowerCase().includes(q)
      || (r.buyer_name || '').toLowerCase().includes(q)
      || (r.supplier_inn || '').toLowerCase().includes(q)
      || (r.buyer_inn || '').toLowerCase().includes(q)
      || (r.contract_number || '').toLowerCase().includes(q)
  })

  // ── Статистика ──────────────────────────────────────────────────────────
  const stats = {
    total:    filtered.reduce((s, r) => s + (r.amount || 0), 0),
    vat:      filtered.reduce((s, r) => s + (r.vat_amount || 0), 0),
    pending:  filtered.filter(r => r.status === 'pending').length,
    accepted: filtered.filter(r => r.status !== 'pending').length,
  }

  // ── Добавить ────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!form.esf_number || !form.esf_date || !form.amount) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        direction: tab,
        amount:     parseFloat(form.amount)     || 0,
        vat_amount: parseFloat(form.vat_amount) || calcVat(form.amount, form.vat_rate),
      }
      await esfApi.create(companyId, payload)
      setShowAdd(false)
      setForm(EMPTY_FORM)
      loadRecords()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    } finally { setSaving(false) }
  }

  // ── Удалить ─────────────────────────────────────────────────────────────
  function handleDelete(r) {
    const counterparty = tab === 'incoming' ? r.supplier_name : r.buyer_name
    setConfirmState({
      title: 'Удалить ЭСФ?',
      message: `ЭСФ №${r.esf_number} от ${fmtDate(r.esf_date)}${counterparty ? ` (${counterparty})` : ''} будет удалён.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await esfApi.delete(companyId, r.id)
        loadRecords()
      }
    })
  }

  // ── Принять / отменить ───────────────────────────────────────────────────
  async function handleToggleAccept(r) {
    try {
      if (r.status === 'pending') {
        await esfApi.accept(companyId, r.id)
      } else {
        await esfApi.unaccept(companyId, r.id)
      }
      loadRecords()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  // ── Привязать к транзакции ───────────────────────────────────────────────
  async function openLinkTx(r) {
    setLinkTxModal({ esfId: r.id })
    setTxSearch('')
    const res = await bank.transactions(companyId, {})
    setTransactions(res.data?.items || res.data || [])
  }

  async function handleLinkTx(txId) {
    await esfApi.linkTx(companyId, linkTxModal.esfId, txId)
    setLinkTxModal(null)
    loadRecords()
  }

  async function handleUnlinkTx(r) {
    await esfApi.unlinkTx(companyId, r.id)
    loadRecords()
  }

  // ── Привязать к документу ────────────────────────────────────────────────
  async function openLinkDoc(r) {
    setLinkDocModal({ esfId: r.id })
    setDocSearch('')
    const res = await documents.list(companyId, {})
    setDocs(res.data || [])
  }

  async function handleLinkDoc(docId) {
    await esfApi.linkDoc(companyId, linkDocModal.esfId, docId)
    setLinkDocModal(null)
    loadRecords()
  }

  async function handleUnlinkDoc(r) {
    await esfApi.unlinkDoc(companyId, r.id)
    loadRecords()
  }

  // ── Книга покупок/продаж ─────────────────────────────────────────────────
  async function openBook() {
    const params = { direction: tab }
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo
    const res = await esfApi.book(companyId, params)
    setBook(res.data)
    setShowBook(true)
  }

  // ── Авторасчёт НДС в форме ───────────────────────────────────────────────
  function handleAmountChange(val) {
    const vat = val && form.vat_rate === '12' ? String(calcVat(val, '12')) : ''
    setForm(f => ({ ...f, amount: val, vat_amount: vat }))
  }
  function handleVatRateChange(val) {
    const vat = form.amount && val === '12' ? String(calcVat(form.amount, '12')) : ''
    setForm(f => ({ ...f, vat_rate: val, vat_amount: vat }))
  }

  // ── Шапка таблицы ────────────────────────────────────────────────────────
  const TH = ({ children, right }) => (
    <div style={{ textAlign: right ? 'right' : 'left' }}>{children}</div>
  )

  const counterpartyLabel = tab === 'incoming' ? 'Поставщик' : 'Покупатель'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      <NavBar companyId={companyId} current="esf" />

      {/* Шапка модуля */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>⚡ ЭСФ</div>
      </div>

      {/* Табы */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: 0 }}>
        {[['incoming', '📥 Входящие'], ['outgoing', '📤 Исходящие']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '12px 20px', fontSize: 13, fontWeight: 700,
              color: tab === key ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>

        {/* Статистика */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Записей',        val: filtered.length,     color: 'var(--text)' },
            { label: 'Сумма',          val: fmt(stats.total) + ' KGS', color: 'var(--text)', big: false },
            { label: 'НДС',            val: fmt(stats.vat) + ' KGS',   color: 'var(--text3)' },
            { label: tab === 'incoming' ? 'Не принято' : 'Не выставлено',
              val: stats.pending, color: stats.pending > 0 ? 'var(--warn)' : 'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Панель инструментов */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={LBL}>Поиск</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Номер, контрагент, ИНН, договор..."
              style={{ ...INP, padding: '8px 10px' }} />
          </div>
          <div>
            <label style={LBL}>Дата с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ ...SEL, padding: '8px 10px' }} />
          </div>
          <div>
            <label style={LBL}>Дата по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ ...SEL, padding: '8px 10px' }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text3)', alignSelf: 'flex-end' }}>
              ✕ Сбросить
            </button>
          )}
          <button onClick={openBook}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', alignSelf: 'flex-end' }}>
            📖 {tab === 'incoming' ? 'Книга покупок' : 'Книга продаж'}
          </button>
          <button onClick={() => { setShowAdd(true); setForm({ ...EMPTY_FORM, direction: tab }) }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-end' }}>
            + Добавить ЭСФ
          </button>
        </div>

        {/* Таблица */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            {records.length === 0
              ? `${tab === 'incoming' ? 'Входящих' : 'Исходящих'} ЭСФ нет — добавьте первый`
              : 'Ничего не найдено по фильтрам'}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            {/* Заголовок */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID_IN, padding: '8px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', gap: 8 }}>
              <TH>Номер ЭСФ</TH>
              <TH>Дата</TH>
              <TH>{counterpartyLabel}</TH>
              <TH>Договор</TH>
              <TH right>Сумма</TH>
              <TH right>НДС</TH>
              <TH>Статус</TH>
              <TH>Связи</TH>
              <TH>Действия</TH>
            </div>

            {/* Строки */}
            {filtered.map(r => {
              const isPending  = r.status === 'pending'
              const counterparty = tab === 'incoming' ? r.supplier_name : r.buyer_name
              const inn          = tab === 'incoming' ? r.supplier_inn  : r.buyer_inn
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: GRID_IN, padding: '10px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 8 }}>

                  {/* Номер */}
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{r.esf_number}</div>

                  {/* Дата */}
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(r.esf_date)}</div>

                  {/* Контрагент */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{counterparty || '—'}</div>
                    {inn && <div style={{ fontSize: 10, color: 'var(--text3)' }}>ИНН {inn}</div>}
                    {r.contract_number && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Дог. {r.contract_number}</div>}
                  </div>

                  {/* Договор */}
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.contract_number || '—'}</div>

                  {/* Сумма */}
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(r.amount)}</div>

                  {/* НДС */}
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>
                    {r.vat_rate === 'exempt' ? 'Без НДС' : fmt(r.vat_amount)}
                  </div>

                  {/* Статус */}
                  <div>
                    {isPending ? (
                      <span style={{ background: 'var(--warn-light)', color: 'var(--warn)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                        {tab === 'incoming' ? 'Не принят' : 'Не выставлен'}
                      </span>
                    ) : (
                      <span style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                        {tab === 'incoming' ? `✓ Принят ${fmtDate(r.accepted_at)}` : `✓ Выставлен`}
                      </span>
                    )}
                  </div>

                  {/* Связи */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {r.bank_transaction_id ? (
                      <span title="Привязан к транзакции" onClick={() => handleUnlinkTx(r)}
                        style={{ background: '#e8f0fe', color: '#1a56db', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 12, cursor: 'pointer' }}>
                        💳 Оплата ✕
                      </span>
                    ) : (
                      <span onClick={() => openLinkTx(r)}
                        style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 10, padding: '2px 6px', borderRadius: 12, cursor: 'pointer', border: '1px dashed var(--border)' }}>
                        + Оплата
                      </span>
                    )}
                    {r.linked_document_id ? (
                      <span title="Привязан к документу" onClick={() => handleUnlinkDoc(r)}
                        style={{ background: '#f3e8ff', color: '#7e22ce', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 12, cursor: 'pointer' }}>
                        📄 Документ ✕
                      </span>
                    ) : (
                      <span onClick={() => openLinkDoc(r)}
                        style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 10, padding: '2px 6px', borderRadius: 12, cursor: 'pointer', border: '1px dashed var(--border)' }}>
                        + Документ
                      </span>
                    )}
                  </div>

                  {/* Действия */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button onClick={() => handleToggleAccept(r)}
                      style={{
                        background: isPending ? 'var(--success)' : 'var(--surface2)',
                        color: isPending ? '#fff' : 'var(--text3)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        padding: '3px 8px', fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {isPending
                        ? (tab === 'incoming' ? 'Принять' : 'Выставить')
                        : 'Отменить'}
                    </button>
                    <button onClick={() => handleDelete(r)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 10, cursor: 'pointer', color: 'var(--error)', fontFamily: 'inherit' }}>
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Итого */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID_IN, padding: '8px 14px', background: 'var(--surface2)', borderTop: '2px solid var(--border)', fontWeight: 800, fontSize: 11, gap: 8 }}>
              <div style={{ gridColumn: '1/5', color: 'var(--text3)' }}>ИТОГО ({filtered.length} записей)</div>
              <div style={{ textAlign: 'right' }}>{fmt(stats.total)}</div>
              <div style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmt(stats.vat)}</div>
              <div></div><div></div><div></div>
            </div>
          </div>
        )}
      </div>

      {/* ════════ МОДАЛ: Добавить ЭСФ ════════ */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {tab === 'incoming' ? '📥 Новый входящий ЭСФ' : '📤 Новый исходящий ЭСФ'}
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LBL}>Номер ЭСФ *</label>
                  <input value={form.esf_number} onChange={e => setForm(f => ({ ...f, esf_number: e.target.value }))}
                    placeholder="ЭСФ-2026-0001" style={INP} />
                </div>
                <div>
                  <label style={LBL}>Дата ЭСФ *</label>
                  <input type="date" value={form.esf_date} onChange={e => setForm(f => ({ ...f, esf_date: e.target.value }))}
                    style={{ ...SEL, width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              {tab === 'incoming' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={LBL}>Поставщик *</label>
                    <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                      placeholder="ООО «Название»" style={INP} />
                  </div>
                  <div>
                    <label style={LBL}>ИНН поставщика</label>
                    <input value={form.supplier_inn} onChange={e => setForm(f => ({ ...f, supplier_inn: e.target.value }))}
                      placeholder="1234567890" style={INP} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={LBL}>Покупатель *</label>
                    <input value={form.buyer_name} onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))}
                      placeholder="ООО «Название»" style={INP} />
                  </div>
                  <div>
                    <label style={LBL}>ИНН покупателя</label>
                    <input value={form.buyer_inn} onChange={e => setForm(f => ({ ...f, buyer_inn: e.target.value }))}
                      placeholder="1234567890" style={INP} />
                  </div>
                </div>
              )}

              <div>
                <label style={LBL}>Номер договора</label>
                <input value={form.contract_number} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))}
                  placeholder="Договор №..." style={INP} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LBL}>Сумма (с НДС) *</label>
                  <input type="number" min="0" value={form.amount}
                    onChange={e => handleAmountChange(e.target.value)}
                    placeholder="0.00" style={INP} />
                </div>
                <div>
                  <label style={LBL}>Ставка НДС</label>
                  <select value={form.vat_rate} onChange={e => handleVatRateChange(e.target.value)}
                    style={{ ...SEL, width: '100%' }}>
                    <option value="12">НДС 12%</option>
                    <option value="0">НДС 0%</option>
                    <option value="exempt">Без НДС</option>
                  </select>
                </div>
                <div>
                  <label style={LBL}>Сумма НДС</label>
                  <input type="number" min="0" value={form.vat_amount}
                    onChange={e => setForm(f => ({ ...f, vat_amount: e.target.value }))}
                    placeholder="авто" style={INP} />
                </div>
              </div>

              {form.amount && form.vat_rate === '12' && (
                <div style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  НДС выделен из суммы: {fmt(calcVat(form.amount, '12'))} KGS · без НДС: {fmt(Number(form.amount) - calcVat(form.amount, '12'))} KGS
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={handleAdd}
                disabled={!form.esf_number || !form.esf_date || !form.supplier || !(parseFloat(form.amount) > 0) || saving}
                style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!form.esf_number || !form.supplier || !(parseFloat(form.amount) > 0)) ? 0.5 : 1 }}>
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ МОДАЛ: Привязать к транзакции ════════ */}
      {linkTxModal && (
        <div onClick={() => setLinkTxModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>💳 Привязать к оплате</div>
              <button onClick={() => setLinkTxModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '10px 16px', flexShrink: 0 }}>
              <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                placeholder="Поиск по контрагенту или назначению..."
                style={{ ...INP, padding: '7px 10px', fontSize: 12 }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {transactions
                .filter(t => !txSearch || (t.counterparty || '').toLowerCase().includes(txSearch.toLowerCase()) || (t.purpose || '').toLowerCase().includes(txSearch.toLowerCase()))
                .slice(0, 50)
                .map(t => (
                  <div key={t.id} onClick={() => handleLinkTx(t.id)}
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{t.counterparty || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(t.date)} · {t.purpose || ''}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: t.direction === 'in' ? 'var(--success)' : 'var(--error)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {t.direction === 'in' ? '+' : '−'}{fmt(t.amount)} KGS
                    </div>
                  </div>
                ))}
              {transactions.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Транзакций нет</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ МОДАЛ: Привязать к документу ════════ */}
      {linkDocModal && (
        <div onClick={() => setLinkDocModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>📄 Привязать к документу</div>
              <button onClick={() => setLinkDocModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '10px 16px', flexShrink: 0 }}>
              <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
                placeholder="Поиск по номеру или контрагенту..."
                style={{ ...INP, padding: '7px 10px', fontSize: 12 }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {docs
                .filter(d => !docSearch || (d.doc_number || '').toLowerCase().includes(docSearch.toLowerCase()) || (d.counterparty || '').toLowerCase().includes(docSearch.toLowerCase()))
                .slice(0, 50)
                .map(d => (
                  <div key={d.id} onClick={() => handleLinkDoc(d.id)}
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{d.counterparty || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {d.doc_number && `№${d.doc_number} · `}{fmtDate(d.doc_date)} · {d.doc_type}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {fmt(d.amount)} KGS
                    </div>
                  </div>
                ))}
              {docs.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Документов нет</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ МОДАЛ: Книга покупок/продаж ════════ */}
      {showBook && book && (
        <div onClick={() => setShowBook(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  📖 {tab === 'incoming' ? 'Книга покупок' : 'Книга продаж'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {book.count} записей · Сумма: {fmt(book.total_amount)} KGS · НДС: {fmt(book.total_vat)} KGS
                  {book.pending_count > 0 && <span style={{ color: 'var(--warn)', marginLeft: 8 }}>· {book.pending_count} не {tab === 'incoming' ? 'принято' : 'выставлено'}</span>}
                </div>
              </div>
              <button onClick={() => setShowBook(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Шапка */}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 120px 90px 1fr 120px 110px 90px 110px', padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', gap: 8, position: 'sticky', top: 0 }}>
                <div>№</div>
                <div>Номер ЭСФ</div>
                <div>Дата</div>
                <div>{tab === 'incoming' ? 'Поставщик' : 'Покупатель'}</div>
                <div>Договор</div>
                <div style={{ textAlign: 'right' }}>Сумма</div>
                <div style={{ textAlign: 'right' }}>НДС</div>
                <div>Статус</div>
              </div>

              {book.items.map((r, i) => {
                const counterparty = tab === 'incoming' ? r.supplier_name : r.buyer_name
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '40px 120px 90px 1fr 120px 110px 90px 110px', padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, gap: 8, alignItems: 'center' }}>
                    <div style={{ color: 'var(--text3)' }}>{i + 1}</div>
                    <div style={{ fontWeight: 600 }}>{r.esf_number}</div>
                    <div style={{ color: 'var(--text2)' }}>{fmtDate(r.esf_date)}</div>
                    <div>{counterparty || '—'}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>{r.contract_number || '—'}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmt(r.vat_amount)}</div>
                    <div>
                      {r.status === 'pending'
                        ? <span style={{ color: 'var(--warn)', fontSize: 10, fontWeight: 700 }}>Ожидает</span>
                        : <span style={{ color: 'var(--success)', fontSize: 10, fontWeight: 700 }}>✓</span>
                      }
                    </div>
                  </div>
                )
              })}

              {/* Итого */}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 120px 90px 1fr 120px 110px 90px 110px', padding: '10px 16px', background: 'var(--surface2)', borderTop: '2px solid var(--border)', fontWeight: 800, fontSize: 12, gap: 8 }}>
                <div></div><div></div><div></div>
                <div style={{ color: 'var(--text3)' }}>ИТОГО</div>
                <div></div>
                <div style={{ textAlign: 'right' }}>{fmt(book.total_amount)}</div>
                <div style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmt(book.total_vat)}</div>
                <div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  )
}
