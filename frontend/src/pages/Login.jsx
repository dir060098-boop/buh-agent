import { useState } from "react"
import { auth } from "../api/client"
export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const handleLogin = async () => {
    try {
      const res = await auth.login(email, password)
      localStorage.setItem("token", res.data.access_token)
      window.location.href = "/"
    } catch { setError("Неверный логин или пароль") }
  }
  return (<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f1117"}}><div style={{background:"#181c27",border:"1px solid #2a3050",borderRadius:16,padding:40,width:360}}><h2 style={{color:"#e8eaf6",textAlign:"center"}}>📊 БухАгент</h2><p style={{color:"#8892b0",textAlign:"center",marginBottom:32,fontSize:13}}>AI-система для бухгалтера</p><div style={{marginBottom:16}}><label style={{color:"#8892b0",fontSize:12,display:"block",marginBottom:6}}>Логин</label><input value={email} onChange={e=>setEmail(e.target.value)} style={{width:"100%",background:"#1e2336",border:"1px solid #2a3050",borderRadius:8,padding:"10px 14px",color:"#e8eaf6",fontSize:14,boxSizing:"border-box"}}/></div><div style={{marginBottom:16}}><label style={{color:"#8892b0",fontSize:12,display:"block",marginBottom:6}}>Пароль</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",background:"#1e2336",border:"1px solid #2a3050",borderRadius:8,padding:"10px 14px",color:"#e8eaf6",fontSize:14,boxSizing:"border-box"}}/></div>{error&&<p style={{color:"#ff4d6d",fontSize:13}}>{error}</p>}<button onClick={handleLogin} style={{width:"100%",background:"#4f7cff",color:"white",border:"none",borderRadius:8,padding:12,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}}>Войти →</button></div></div>)
}