import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { communications } from '../api/client'
import NavBar from '../components/NavBar'

const CLIENT_TYPES = [
  { key: 'status',    icon: '📊', label: 'Статус компании',     desc: 'Общий отчёт по состоянию дел' },
  { key: 'documents', icon: '📄', label: 'Запрос документов',   desc: 'Попросить клиента предоставить документы' },
  { key: 'deadline',  icon: '⏰', label: 'Напоминание о сроке', desc: 'Сроки сдачи отчётности и уплаты налогов' },
  { key: 'payment',   icon: '💰', label: 'Запрос оплаты услуг', desc: 'Напомнить об оплате бухгалтерских услуг' },
]

const QUICK_Q = [
  '💰 НДС к уплате за квартал?',
  '📄 Сколько документов на обработке?',
  '⏰ Какие ближайшие дедлайны?',
  '💼 Статус зарплаты?',
  '🏦 Остаток на счёте?',
]

export default function Communications() {
  const { companyId } = useParams()
  const bottomRef    = useRef(null)

  const [tab, setTab]             = useState('chat')
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [histLoading, setHistLoading] = useState(true)

  const [clientType, setClientType]     = useState(null)
  const [clientText, setClientText]     = useState('')
  const [clientHist, setClientHist]     = useState([])
  const [clientLoading, setClientLoading] = useState(false)
  const [copied, setCopied]             = useState(false)

  // Загружаем историю чата
  useEffect(() => {
    setHistLoading(true)
    communications.history(companyId)
      .then(r => setMessages(r.data))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [companyId])

  // Загружаем историю писем при переключении вкладки
  useEffect(() => {
    if (tab === 'client') {
      communications.clientMessages(companyId)
        .then(r => setClientHist(r.data))
        .catch(() => {})
    }
  }, [tab, companyId])

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg || chatLoading) return
    setInput('')

    // Оптимистично добавляем сообщение пользователя
    const temp = { id: `tmp-${Date.now()}`, role: 'user', content: msg, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, temp])
    setChatLoading(true)
    try {
      const res = await communications.chat(companyId, { message: msg })
      setMessages(prev => [...prev, res.data])
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: '⚠️ Не удалось получить ответ. Попробуйте снова.',
        created_at: new Date().toISOString(),
      }])
    } finally {
      setChatLoading(false)
    }
  }

  async function clearHistory() {
    if (!window.confirm('Очистить всю историю чата?')) return
    await communications.clearHistory(companyId).catch(() => {})
    setMessages([])
  }

  async function generateClientMsg(type) {
    setClientType(type)
    setClientText('')
    setCopied(false)
    setClientLoading(true)
    try {
      const res = await communications.generateClientMsg(companyId, { message_type: type })
      setClientText(res.data.content)
      setClientHist(prev => [res.data, ...prev.filter(m => m.id !== res.data.id)])
    } catch { setClientText('⚠️ Ошибка генерации. Попробуйте снова.') }
    finally { setClientLoading(false) }
  }

  function copyText() {
    navigator.clipboard.writeText(clientText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const TAB_BTN = (key, icon, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      display:'flex', alignItems:'center', gap:6, padding:'6px 14px',
      borderRadius:'var(--radius-sm)', border:'none', cursor:'pointer',
      fontFamily:'Manrope, sans-serif', fontSize:13, fontWeight:700,
      background: tab === key ? 'var(--accent)' : 'transparent',
      color: tab === key ? '#fff' : 'var(--text3)',
      transition:'all 0.15s',
    }}>{icon} {label}</button>
  )

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', fontFamily:'Manrope, sans-serif'}}>
      <NavBar companyId={companyId} current="communications" />

      {/* ── Шапка ── */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)'}}>
        <div>
          <div style={{fontWeight:800, fontSize:15, color:'var(--text)'}}>💬 Коммуникации</div>
          <div style={{fontSize:11, color:'var(--text3)'}}>AI-бухгалтер — задайте вопрос по данным компании</div>
        </div>
        <div style={{marginLeft:'auto', display:'flex', gap:3, background:'var(--surface2)', padding:4, borderRadius:'var(--radius)', border:'1px solid var(--border)'}}>
          {TAB_BTN('chat',   '💬', 'AI-консультант')}
          {TAB_BTN('client', '📨', 'Клиенту')}
        </div>
      </div>

      <div style={{maxWidth:820, margin:'0 auto', padding:'20px 16px'}}>

        {/* ══════════════════ CHAT TAB ══════════════════ */}
        {tab === 'chat' && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>

            {/* Блок сообщений */}
            <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>

              {/* Заголовок блока */}
              <div style={{padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface2)'}}>
                <div style={{fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
                  🤖 AI-бухгалтер
                </div>
                {messages.length > 0 && (
                  <button onClick={clearHistory} style={{fontSize:11, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', fontFamily:'Manrope, sans-serif', padding:'4px 8px', borderRadius:'var(--radius-sm)'}}>
                    Очистить историю
                  </button>
                )}
              </div>

              {/* Список сообщений */}
              <div style={{minHeight:320, maxHeight:480, overflowY:'auto', padding:16}}>
                {histLoading ? (
                  <div style={{textAlign:'center', color:'var(--text4)', padding:'40px 0', fontSize:13}}>Загрузка...</div>
                ) : messages.length === 0 ? (
                  <div style={{textAlign:'center', padding:'48px 0'}}>
                    <div style={{fontSize:40, marginBottom:10}}>🤖</div>
                    <div style={{fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:6}}>AI-бухгалтер готов помочь</div>
                    <div style={{fontSize:12, color:'var(--text3)'}}>Задайте вопрос по данным компании или используйте быстрые кнопки ниже</div>
                  </div>
                ) : (
                  <div style={{display:'flex', flexDirection:'column', gap:14}}>
                    {messages.map(msg => (
                      <div key={msg.id} style={{display:'flex', flexDirection:'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'}}>
                        <div style={{
                          maxWidth:'82%',
                          padding:'10px 14px',
                          borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                          color: msg.role === 'user' ? '#fff' : 'var(--text)',
                          fontSize: 13, lineHeight: 1.6,
                          border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {msg.role === 'assistant' && (
                            <div style={{fontSize:10, color:'var(--ai)', fontWeight:800, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em'}}>
                              🤖 AI-бухгалтер
                            </div>
                          )}
                          {msg.content}
                        </div>
                        <div style={{fontSize:10, color:'var(--text4)', marginTop:3, padding:'0 4px'}}>
                          {new Date(msg.created_at).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}
                        </div>
                      </div>
                    ))}

                    {chatLoading && (
                      <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
                        <div style={{padding:'10px 14px', borderRadius:'16px 16px 16px 4px', background:'var(--surface2)', border:'1px solid var(--border)', fontSize:13, color:'var(--text3)'}}>
                          <div style={{fontSize:10, color:'var(--ai)', fontWeight:800, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em'}}>🤖 AI-бухгалтер</div>
                          ⏳ Анализирую данные компании...
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Быстрые вопросы */}
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {QUICK_Q.map(q => (
                <button key={q} onClick={() => sendMessage(q)} disabled={chatLoading}
                  style={{
                    fontSize:12, padding:'6px 13px', borderRadius:20,
                    border:'1px solid var(--border)', background:'var(--surface)',
                    color:'var(--text2)', cursor: chatLoading ? 'not-allowed' : 'pointer',
                    fontFamily:'Manrope, sans-serif', transition:'background 0.12s',
                    opacity: chatLoading ? 0.5 : 1,
                  }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Поле ввода */}
            <div style={{display:'flex', gap:8}}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Задайте вопрос по данным компании... (Enter — отправить)"
                disabled={chatLoading}
                style={{
                  flex:1, background:'var(--surface)', border:'1.5px solid var(--border)',
                  borderRadius:'var(--radius)', padding:'12px 16px', color:'var(--text)',
                  fontSize:13, fontFamily:'Manrope, sans-serif', outline:'none',
                  opacity: chatLoading ? 0.6 : 1,
                }}
              />
              <button onClick={() => sendMessage()} disabled={!input.trim() || chatLoading}
                style={{
                  background: (!input.trim() || chatLoading) ? 'var(--text4)' : 'var(--accent)',
                  color:'#fff', border:'none', padding:'0 22px', borderRadius:'var(--radius)',
                  fontSize:18, fontWeight:800, cursor: (!input.trim() || chatLoading) ? 'not-allowed' : 'pointer',
                  fontFamily:'Manrope, sans-serif', transition:'background 0.15s',
                }}>
                →
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ CLIENT TAB ══════════════════ */}
        {tab === 'client' && (
          <div style={{display:'flex', flexDirection:'column', gap:16}}>

            {/* Карточки типов */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
              {CLIENT_TYPES.map(t => (
                <button key={t.key} onClick={() => generateClientMsg(t.key)} disabled={clientLoading}
                  style={{
                    padding:'16px 14px', borderRadius:'var(--radius)', textAlign:'left',
                    border: `1.5px solid ${clientType === t.key ? 'var(--accent)' : 'var(--border)'}`,
                    background: clientType === t.key ? 'var(--accent-light)' : 'var(--surface)',
                    cursor: clientLoading ? 'not-allowed' : 'pointer',
                    fontFamily:'Manrope, sans-serif', transition:'all 0.15s',
                    opacity: clientLoading && clientType !== t.key ? 0.5 : 1,
                  }}>
                  <div style={{fontSize:22, marginBottom:6}}>{t.icon}</div>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:3}}>{t.label}</div>
                  <div style={{fontSize:11, color:'var(--text3)', lineHeight:1.4}}>{t.desc}</div>
                </button>
              ))}
            </div>

            {/* Результат */}
            {(clientLoading || clientText) && (
              <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
                <div style={{padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface2)'}}>
                  <div style={{fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
                    📨 Готовое сообщение для клиента
                  </div>
                  {clientText && !clientLoading && (
                    <button onClick={copyText}
                      style={{
                        fontSize:12, padding:'5px 14px', borderRadius:'var(--radius-sm)',
                        border:'1px solid var(--border)',
                        background: copied ? 'var(--success)' : 'var(--surface)',
                        color: copied ? '#fff' : 'var(--text2)',
                        cursor:'pointer', fontFamily:'Manrope, sans-serif',
                        fontWeight:700, transition:'all 0.15s',
                      }}>
                      {copied ? '✓ Скопировано!' : '📋 Копировать'}
                    </button>
                  )}
                </div>
                <div style={{padding:18, fontSize:13.5, color:'var(--text)', lineHeight:1.75, whiteSpace:'pre-wrap', minHeight:100}}>
                  {clientLoading
                    ? <span style={{color:'var(--text3)'}}>⏳ Генерирую сообщение на основе данных компании...</span>
                    : clientText
                  }
                </div>
              </div>
            )}

            {/* История предыдущих писем */}
            {clientHist.length > 1 && (
              <div>
                <div style={{fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>
                  Ранее сгенерированные письма
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {clientHist.slice(1, 6).map(m => {
                    const TYPE_ICONS = {status:'📊', documents:'📄', deadline:'⏰', payment:'💰'}
                    return (
                      <div key={m.id} onClick={() => setClientText(m.content)}
                        style={{
                          background:'var(--surface)', border:'1px solid var(--border)',
                          borderRadius:'var(--radius)', padding:'12px 14px',
                          cursor:'pointer', transition:'background 0.12s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                        onMouseOut={e => e.currentTarget.style.background='var(--surface)'}
                      >
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}>
                          <span style={{fontSize:12, fontWeight:700, color:'var(--text2)'}}>
                            {TYPE_ICONS[m.message_type] || '📨'} {m.message_type}
                          </span>
                          <span style={{fontSize:11, color:'var(--text4)'}}>
                            {new Date(m.created_at).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                        <div style={{
                          fontSize:12, color:'var(--text3)', overflow:'hidden',
                          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
                        }}>
                          {m.content}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
