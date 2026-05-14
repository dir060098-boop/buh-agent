import { useEffect, useState } from "react"
import { companies } from "../api/client"
import { useNavigate } from "react-router-dom"
export default function Dashboard() {
  const [list, setList] = useState([])
  const navigate = useNavigate()
  useEffect(() => { companies.list().then(r => setList(r.data)).catch(() => {}) }, [])
  return (<div style={{background:"#0f1117",minHeight:"100vh",padding:24,color:"#e8eaf6",fontFamily:"sans-serif"}}><h2 style={{marginBottom:4}}>Добрый день 👋</h2><p style={{color:"#8892b0",marginBottom:24,fontSize:13}}>Мои компании</p>{list.length===0&&<p style={{color:"#4a5580"}}>Компаний пока нет.</p>}{list.map(c=>(<div key={c.id} onClick={()=>navigate("/company/"+c.id)} style={{background:"#181c27",border:"1px solid #2a3050",borderRadius:10,padding:"16px 20px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:600}}>{c.name}</div><div style={{fontSize:12,color:"#8892b0",marginTop:2}}>{c.tax_regime}</div></div><span style={{color:"#4a5580",fontSize:18}}>›</span></div>))}</div>)
}