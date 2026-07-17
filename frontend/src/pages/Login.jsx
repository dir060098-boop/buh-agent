import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await auth.login(email, password)
      localStorage.setItem('token', res.data.access_token)
      navigate('/')
    } catch {
      setError('Неверный email или пароль')
    } finally { setLoading(false) }
  }

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:400}}>
        {/* Логотип */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:28,fontWeight:800,color:'var(--text)',letterSpacing:'-0.5px'}}>
            Бух<span style={{color:'var(--accent)'}}>Агент</span>
          </div>
          <div style={{fontSize:13,color:'var(--text3)',marginTop:6}}>
            Автоматизация бухгалтерии · Кыргызстан
          </div>
        </div>

        {/* Карточка */}
        <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-lg)',padding:32,border:'1px solid var(--border)'}}>
          <h2 style={{fontSize:18,fontWeight:800,marginBottom:24,color:'var(--text)'}}>Вход в систему</h2>

          <form onSubmit={handleSubmit}>
            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                Email
              </label>
              <input value={email} onChange={e=>setEmail(e.target.value)}
                type="email" placeholder="dinara@buhagent.kg" required
                style={{width:'100%',padding:'10px 14px'}}/>
            </div>

            <div style={{marginBottom:24}}>
              <label style={{display:'block',fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                Пароль
              </label>
              <input value={password} onChange={e=>setPassword(e.target.value)}
                type="password" placeholder="••••••••" required
                style={{width:'100%',padding:'10px 14px'}}/>
            </div>

            {error && (
              <div style={{background:'var(--error-light)',color:'var(--error)',border:'1px solid var(--error)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:13,marginBottom:16}}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{width:'100%',background:loading?'var(--text3)':'var(--accent)',color:'#fff',border:'none',padding:'12px',borderRadius:'var(--radius)',fontSize:14,fontWeight:700,transition:'background 0.15s',boxShadow:'var(--shadow)'}}>
              {loading ? 'Вхожу...' : 'Войти'}
            </button>
          </form>
          <div style={{textAlign:'center',marginTop:14}}>
            <a href="/help" style={{fontSize:13,color:'var(--accent)',fontWeight:600,textDecoration:'none'}}>
              ❓ Что это за приложение и как с ним работать
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
