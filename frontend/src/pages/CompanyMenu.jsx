import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { companies } from '../api/client'

const SECTIONS = [
  { icon:'📷', title:'Сканер первички',  desc:'AI распознаёт документы',   path:'scanner',  badge:null },
  { icon:'📒', title:'Журнал проводок',  desc:'Разноска по счетам КР',      path:'journal',  badge:'journal_count' },
  { icon:'📄', title:'Документы',        desc:'Реестр входящих документов', path:'documents',badge:'pending_docs' },
  { icon:'🏦', title:'Банк и касса',     desc:'Выписки и сверка',           path:'bank',     badge:null },
  { icon:'📋', title:'ЭСФ',             desc:'Входящие и расхождения',     path:'esf',      badge:null },
  { icon:'👥', title:'Зарплата и кадры', desc:'Сотрудники и расчёты',       path:'salary',   badge:null },
  { icon:'📅', title:'Дедлайны',         desc:'Календарь отчётности',       path:'deadlines',badge:'overdue_deadlines' },
  { icon:'💬', title:'Коммуникации',     desc:'AI пишет клиентам',          path:'communications',badge:null },
]

export default function CompanyMenu() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)

  useEffect(() => {
    companies.get(id).then(r=>setCompany(r.data)).catch(()=>{})
  }, [id])

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Шапка */}
      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'12px 24px',display:'flex',alignItems:'center',gap:12,boxShadow:'var(--shadow-sm)'}}>
        <button onClick={()=>navigate('/')}
          style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'6px 12px',color:'var(--text2)',fontSize:13,fontWeight:600}}>
          ← Назад
        </button>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:'var(--text)'}}>{company?.name||`Компания #${id}`}</div>
          {company?.inn&&<div style={{fontSize:12,color:'var(--text3)'}}>ИНН {company.inn} · {company.tax_regime}</div>}
        </div>
      </div>

      <div style={{maxWidth:700,margin:'0 auto',padding:'28px 24px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(165px,1fr))',gap:14}}>
          {SECTIONS.map(s => {
            const badgeVal = s.badge && company?.[s.badge]
            return (
              <div key={s.path} onClick={()=>navigate(`/company/${id}/${s.path}`)}
                style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'20px 16px',cursor:'pointer',position:'relative',boxShadow:'var(--shadow-sm)',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.boxShadow='var(--shadow)';e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='var(--shadow-sm)';e.currentTarget.style.transform='translateY(0)'}}>
                {badgeVal>0&&(
                  <div style={{position:'absolute',top:10,right:10,background:'var(--error)',color:'#fff',borderRadius:20,fontSize:10,fontWeight:700,padding:'2px 7px',minWidth:20,textAlign:'center'}}>
                    {badgeVal}
                  </div>
                )}
                <div style={{fontSize:28,marginBottom:10}}>{s.icon}</div>
                <div style={{fontWeight:700,fontSize:13,color:'var(--text)',marginBottom:4}}>{s.title}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{s.desc}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
