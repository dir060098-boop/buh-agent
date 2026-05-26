import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { bank, companies } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import NavBar from '../components/NavBar'

function fmt(n, cur = 'KGS') {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 0 })
  return (n < 0 ? '−' : '') + s + ' ' + cur
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

const SEL = { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'Manrope, sans-serif', cursor: 'pointer' }
const INP = { ...SEL, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const LBL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }

const EMPTY_TX = { account_id: '', date: new Date().toISOString().slice(0, 10), amount: '', direction: 'out', counterparty: '', purpose: '', auto_post: true }
const EMPTY_ACC = { bank_name: '', account_number: '', currency: 'KGS', opening_balance: '', is_cash: false }

export default function Bank() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [company, setCompany]   = useState(null)
  const [data, setData]         = useState({ accounts: [], transactions: [], summary: {} })
  const [loading, setLoading]   = useState(true)
  const [activeAcc, setActiveAcc] = useState(null)   // null = все счета
  const [dirFilter, setDirFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const [showAddTx, setShowAddTx]   = useState(false)
  const [showAddAcc, setShowAddAcc] = useState(false)
  const [txForm, setTxForm]         = useState(EMPTY_TX)
  const [accForm, setAccForm]       = useState(EMPTY_ACC)
  const [saving, setSaving]         = useState(false)
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    companies.get(companyId).then(r => setCompany(r.data)).catch(() => {})
  }, [companyId])

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (activeAcc)    params.account_id = activeAcc
    if (dirFilter)    params.direction = dirFilter
    if (statusFilter) params.status = statusFilter
    if (search)       params.search = search
    if (dateFrom)     params.date_from = dateFrom
    if (dateTo)       params.date_to = dateTo
    bank.transactions(companyId, params)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId, activeAcc, dirFilter, statusFilter, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // ── Добавить счёт ──────────────────────────────────────────────────────
  async function handleAddAccount() {
    if (!accForm.bank_name) return
    setSaving(true)
    try {
      await bank.createAccount(companyId, {
        ...accForm,
        opening_balance: parseFloat(accForm.opening_balance) || 0,
      })
      setShowAddAcc(false)
      setAccForm(EMPTY_ACC)
      load()
    } finally { setSaving(false) }
  }

  function handleDeleteAccount(id, accName) {
    setConfirmState({
      title: 'Удалить счёт?',
      message: `«${accName}» и все его операции будут удалены без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await bank.deleteAccount(id)
        if (activeAcc === id) setActiveAcc(null)
        load()
      }
    })
  }

  // ── Добавить операцию ──────────────────────────────────────────────────
  async function handleAddTx() {
    if (!txForm.account_id || !txForm.amount || !txForm.date) return
    setSaving(true)
    try {
      await bank.addTransaction(companyId, {
        ...txForm,
        amount: parseFloat(txForm.amount),
      })
      setShowAddTx(false)
      setTxForm({ ...EMPTY_TX, account_id: txForm.account_id })
      load()
    } finally { setSaving(false) }
  }

  function handleDeleteTx(id, amount, currency) {
    setConfirmState({
      title: 'Удалить операцию?',
      message: `Операция на ${fmt(amount, currency)} будет удалена без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await bank.deleteTransaction(id)
        load()
      }
    })
  }

  const { accounts, transactions, summary } = data
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a]))
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      <NavBar companyId={companyId} current="bank" />

      {/* Шапка модуля */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', flex: 1 }}>🏦 Банк и касса</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setShowAddAcc(true); setAccForm(EMPTY_ACC) }}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
            + Счёт
          </button>
          <button onClick={() => { setShowAddTx(true); setTxForm({ ...EMPTY_TX, account_id: activeAcc || accounts[0]?.id || '' }) }}
            disabled={accounts.length === 0}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: accounts.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: accounts.length ? 1 : 0.5 }}>
            + Операция
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* Карточки счетов */}
        {accounts.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px 24px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Счетов пока нет</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Добавьте расчётный счёт или кассу</div>
            <button onClick={() => setShowAddAcc(true)}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Добавить счёт
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Итого */}
            <div onClick={() => setActiveAcc(null)}
              style={{ background: activeAcc === null ? 'var(--accent)' : 'var(--surface)', border: `2px solid ${activeAcc === null ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 18px', cursor: 'pointer', minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: activeAcc === null ? 'rgba(255,255,255,0.8)' : 'var(--text3)', marginBottom: 4 }}>ИТОГО</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: activeAcc === null ? '#fff' : (totalBalance >= 0 ? 'var(--success)' : 'var(--error)') }}>
                {fmt(totalBalance)}
              </div>
            </div>
            {accounts.map(acc => (
              <div key={acc.id} onClick={() => setActiveAcc(acc.id === activeAcc ? null : acc.id)}
                style={{ background: activeAcc === acc.id ? 'var(--accent-light)' : 'var(--surface)', border: `2px solid ${activeAcc === acc.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 18px', cursor: 'pointer', minWidth: 160, position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); handleDeleteAccount(acc.id, acc.bank_name || (acc.is_cash ? 'Касса' : 'Счёт')) }}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--text4)', fontSize: 14, cursor: 'pointer', padding: 2 }}>×</button>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 2 }}>
                  {acc.is_cash ? '💵 КАССА' : '🏦 ' + (acc.bank_name || 'БАНК')}
                </div>
                {acc.account_number && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                    {acc.account_number}
                  </div>
                )}
                <div style={{ fontSize: 19, fontWeight: 800, color: acc.balance >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {fmt(acc.balance, acc.currency)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{acc.tx_count} операций</div>
              </div>
            ))}
          </div>
        )}

        {/* Сводка */}
        {accounts.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Приход', val: summary.total_in,  color: 'var(--success)' },
              { label: 'Расход', val: summary.total_out, color: 'var(--error)' },
              { label: 'Не сверено', val: summary.unmatched, color: 'var(--warn)', unit: 'оп.' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>
                  {s.unit ? s.val : fmt(s.val)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Фильтры */}
        {accounts.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Контрагент или назначение..."
              style={{ ...INP, flex: '1 1 180px' }} />
            <select value={dirFilter} onChange={e => setDirFilter(e.target.value)} style={{ ...SEL }}>
              <option value="">Все операции</option>
              <option value="in">Приход</option>
              <option value="out">Расход</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...SEL }}>
              <option value="">Все статусы</option>
              <option value="unmatched">Не сверено</option>
              <option value="matched">Сверено</option>
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...SEL }} />
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...SEL }} />
            {(search || dirFilter || statusFilter || dateFrom || dateTo) && (
              <button onClick={() => { setSearch(''); setDirFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo('') }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Сбросить
              </button>
            )}
          </div>
        )}

        {/* Таблица операций */}
        {accounts.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 130px 1fr 1fr 110px 110px 70px', gap: 8, padding: '10px 16px', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <div>Дата</div>
              <div>Счёт</div>
              <div>Контрагент</div>
              <div>Назначение</div>
              <div style={{ textAlign: 'right' }}>Приход</div>
              <div style={{ textAlign: 'right' }}>Расход</div>
              <div></div>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Операций пока нет — нажмите «+ Операция»
              </div>
            ) : transactions.map(tx => {
              const acc = accMap[tx.account_id]
              const isIn = tx.direction === 'in'
              const unmatched = tx.status === 'unmatched'
              return (
                <div key={tx.id}
                  style={{ display: 'grid', gridTemplateColumns: '90px 130px 1fr 1fr 110px 110px 70px', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(tx.date)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc ? (acc.is_cash ? '💵 Касса' : '🏦 ' + acc.bank_name) : '—'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.counterparty || '—'}
                    {unmatched && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--warn-light)', color: 'var(--warn)', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>не сверено</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.purpose || '—'}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                    {isIn ? fmt(tx.amount, tx.currency) : ''}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--error)' }}>
                    {!isIn ? fmt(tx.amount, tx.currency) : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {tx.journal_entry_id && (
                      <button onClick={() => navigate(`/company/${companyId}/journal`)}
                        title="Посмотреть проводку"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--ai)' }}>
                        📒
                      </button>
                    )}
                    <button onClick={() => handleDeleteTx(tx.id, tx.amount, tx.currency)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--error)' }}>
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Модал: добавить счёт ─────────────────────────────────────────── */}
      {showAddAcc && (
        <div onClick={() => setShowAddAcc(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 800, fontSize: 15 }}>
              Новый счёт
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Тип */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: false, l: '🏦 Банк' }, { v: true, l: '💵 Касса' }].map(({ v, l }) => (
                  <button key={String(v)} onClick={() => setAccForm(f => ({ ...f, is_cash: v }))}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: `2px solid ${accForm.is_cash === v ? 'var(--accent)' : 'var(--border)'}`, background: accForm.is_cash === v ? 'var(--accent-light)' : 'var(--surface2)', color: accForm.is_cash === v ? 'var(--accent)' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {l}
                  </button>
                ))}
              </div>
              <div>
                <label style={LBL}>{accForm.is_cash ? 'Название кассы' : 'Банк'} *</label>
                <input value={accForm.bank_name} onChange={e => setAccForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder={accForm.is_cash ? 'Главная касса' : 'Оптима Банк'} style={INP} />
              </div>
              {!accForm.is_cash && (
                <div>
                  <label style={LBL}>Номер счёта</label>
                  <input value={accForm.account_number} onChange={e => setAccForm(f => ({ ...f, account_number: e.target.value }))}
                    placeholder="1091808266920171" style={INP} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label style={LBL}>Начальный остаток</label>
                  <input type="number" value={accForm.opening_balance} onChange={e => setAccForm(f => ({ ...f, opening_balance: e.target.value }))}
                    placeholder="0" style={INP} />
                </div>
                <div>
                  <label style={LBL}>Валюта</label>
                  <select value={accForm.currency} onChange={e => setAccForm(f => ({ ...f, currency: e.target.value }))} style={{ ...INP, width: '100%' }}>
                    {['KGS', 'USD', 'EUR', 'RUB'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={handleAddAccount} disabled={!accForm.bank_name || saving}
                style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: accForm.bank_name ? 1 : 0.5 }}>
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
              <button onClick={() => setShowAddAcc(false)}
                style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Модал: добавить операцию ──────────────────────────────────────── */}
      {showAddTx && (
        <div onClick={() => setShowAddTx(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 800, fontSize: 15 }}>
              Новая операция
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Тип операции */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: 'in', l: '↓ Приход', color: 'var(--success)' }, { v: 'out', l: '↑ Расход', color: 'var(--error)' }].map(({ v, l, color }) => (
                  <button key={v} onClick={() => setTxForm(f => ({ ...f, direction: v }))}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: `2px solid ${txForm.direction === v ? color : 'var(--border)'}`, background: txForm.direction === v ? color + '18' : 'var(--surface2)', color: txForm.direction === v ? color : 'var(--text)', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {l}
                  </button>
                ))}
              </div>
              {/* Счёт */}
              <div>
                <label style={LBL}>Счёт *</label>
                <select value={txForm.account_id} onChange={e => setTxForm(f => ({ ...f, account_id: +e.target.value }))} style={{ ...INP, width: '100%' }}>
                  <option value="">Выберите счёт</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.is_cash ? '💵 ' : '🏦 '}{a.bank_name} {a.account_number ? `(${a.account_number.slice(-4)})` : ''} — {fmt(a.balance, a.currency)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
                <div>
                  <label style={LBL}>Дата *</label>
                  <input type="date" value={txForm.date} onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))} style={INP} />
                </div>
                <div>
                  <label style={LBL}>Сумма *</label>
                  <input type="number" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0" style={INP} />
                </div>
              </div>
              <div>
                <label style={LBL}>Контрагент</label>
                <input value={txForm.counterparty} onChange={e => setTxForm(f => ({ ...f, counterparty: e.target.value }))}
                  placeholder="ООО Поставщик..." style={INP} />
              </div>
              <div>
                <label style={LBL}>Назначение платежа</label>
                <input value={txForm.purpose} onChange={e => setTxForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="За аренду офиса, счёт №123..." style={INP} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={txForm.auto_post}
                  onChange={e => setTxForm(f => ({ ...f, auto_post: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
                Автоматически создать проводку в журнале
              </label>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={handleAddTx}
                disabled={!txForm.account_id || !txForm.amount || !txForm.date || saving}
                style={{ flex: 2, background: txForm.direction === 'in' ? 'var(--success)' : 'var(--error)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (txForm.account_id && txForm.amount) ? 1 : 0.5 }}>
                {saving ? 'Сохранение...' : `Добавить ${txForm.direction === 'in' ? 'приход' : 'расход'}`}
              </button>
              <button onClick={() => setShowAddTx(false)}
                style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал подтверждения */}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  )
}
