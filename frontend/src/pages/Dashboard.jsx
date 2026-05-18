import { useEffect, useState } from 'react'
import { companies, auth } from '../api/client'
import { useNavigate } from 'react-router-dom'

const TAX_REGIMES = ['ОРН (общий режим)','Упрощённая система','Патент','Плательщик НДС']
const EMPTY = { name:'', inn:'', tax_regime:'ОРН (общий режим)' }

export default function Dashboard() {
  const [list, setList] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)
  const [innConfirm, setInnConfirm] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    await Promise.all([
      companies.list().then(r=>setList(r.data)).catch(()=>{}),
      auth.me().then(r=>setUser(r.data)).catch(()=>{})
    ])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.name.trim()) { setCreateError('Введите название'); return }
    setCreating(true); setCreateError('')
    try {
      await companies.create({name:createForm.name.trim(),inn:createForm.inn.trim()||null,tax_regime:createForm.tax_regime})
      await load(); setShowCreate(false); setCreateForm(EMPTY)
    } catch(e) { setCreateError(e.response?.data?.detail||'Ошибка') }
    finally { setCreating(false) }
  }

  function openEdit(c) {
    setEditId(c.id)
    setEditForm({name:c.name,inn:c.inn||'',tax_regime:c.tax_regime||'ОРН (общий режим)'})
    setEditError(''); setInnConfirm(false)
  }

  async function handleEdit(e, confirmed=false) {
    e?.preventDefault()
    setEditing(true); setEditError('')
    try {
      const orig = list.find(c=>c.id===editId)
      const innChanged = editForm.inn.trim() !== (orig?.inn||'')
      await companies.update(editId,{name:editForm.name.trim(),inn:editForm.inn.trim()||null,tax_regime:editForm.tax_regime,inn_confirmed:confirmed||!innChanged})
      await load(); setEditId(null)
    } catch(e) {
      const d = e.response?.data?.detail||''
      if (d==='INN_CONFIRM_REQUIRED') { setInnConfirm(true); setEditError('ИНН изменён — подтвердите') }
      else setEditError(d||'Ошибка')
    } finally { setEditing(false) }
  }

  async function handleDelete() {
    setDeleting(true); setDeleteError('')
    try { await companies.delete(deleteId); await load(); setDeleteId(null) }
    catch(e) { setDeleteError(e.response?.data?.detail||'Ошибка') }
    finally { setDeleting(false) }
  }

  const hour = new Date().getHours()
  const greeting = hour<12?'Доброе утро':hour<17?'Добрый день':'Добрый вечер'
  const canDelete = list.find(x=>x.id===deleteId)

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Шапка */}
      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'12px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'var(--shadow-sm)'}}>
        <div style={{fontSize:18,fontWeight:800,color:'var(--text)',letterSpacing:'-0.3px'}}>
          Бух<span style={{color:'var(--accent)'}}>Агент</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setTheme(t=>t==='light'?'dark':'light')}
            style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'5px 10px',fontSize:16,color:'var(--text2)'}}>
            {theme==='light'?'🌙':'☀️'}
          </button>
          {user&&<span style={{fontSize:13,color:'var(--text2)'}}>{user.full_name||user.email}</span>}
          <button onClick={()=>{localStorage.removeItem('token');navigate('/login')}}
            style={{background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'5px 12px',color:'var(--text2)',fontSize:12,fontWeight:600}}>
            Выйти
          </button>
        </div>
      </div>

      <div style={{maxWidth:640,margin:'0 auto',padding:'32px 24px'}}>
        {/* Приветствие */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontSize:22,fontWeight:800,color:'var(--text)',margin:'0 0 4px'}}>{greeting} 👋</h1>
          <p style={{margin:0,color:'var(--text3)',fontSize:13}}>Мои компании</p>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>Загрузка...</div>
        ) : (
          <>
            {list.length===0 && !showCreate && (
              <div style={{textAlign:'center',padding:'48px 24px',background:'var(--surface)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)',marginBottom:16}}>
                <div style={{fontSize:40,marginBottom:12}}>🏢</div>
                <p style={{fontWeight:700,margin:'0 0 6px',color:'var(--text)'}}>Компаний пока нет</p>
                <p style={{fontSize:13,color:'var(--text3)',margin:'0 0 20px'}}>Добавьте первую компанию чтобы начать работу</p>
                <button onClick={()=>setShowCreate(true)}
                  style={{background:'var(--accent)',color:'#fff',border:'none',padding:'11px 24px',borderRadius:'var(--radius)',fontSize:14,fontWeight:700,boxShadow:'var(--shadow)'}}>
                  + Добавить компанию
                </button>
              </div>
            )}

            {list.map(c=>(
              <div key={c.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px',marginBottom:10,display:'flex',alignItems:'center',gap:12,boxShadow:'var(--shadow-sm)',transition:'box-shadow 0.15s,border-color 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.boxShadow='var(--shadow)'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='var(--shadow-sm)'}}>
                <div onClick={()=>navigate('/company/'+c.id)} style={{flex:1,cursor:'pointer',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{width:42,height:42,borderRadius:'var(--radius)',background:'var(--accent-light)',border:'1px solid var(--border2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                    🏢
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:'var(--text)'}}>{c.name}</div>
                    <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
                      {c.inn&&`ИНН ${c.inn}`}{c.inn&&c.tax_regime&&' · '}{c.tax_regime}
                    </div>
                    <div style={{fontSize:11,color:'var(--text4)',marginTop:2}}>
                      {c.doc_count>0&&`${c.doc_count} doc`}
                      {c.doc_count>0&&c.journal_count>0&&' · '}
                      {c.journal_count>0&&`${c.journal_count} проводок`}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                  {c.pending_docs>0&&<span style={{background:'var(--warn-light)',color:'var(--warn)',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20}}>{c.pending_docs} ожид.</span>}
                  {c.overdue_deadlines>0&&<span style={{background:'var(--error-light)',color:'var(--error)',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20}}>{c.overdue_deadlines} срок</span>}
                  <button onClick={()=>openEdit(c)} title="Редактировать"
                    style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'6px 10px',color:'var(--text2)',fontSize:14}}>✏️</button>
                  <button onClick={()=>{setDeleteId(c.id);setDeleteError('')}} title="Удалить"
                    style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'6px 10px',color:c.can_delete?'var(--error)':'var(--text4)',fontSize:14,opacity:c.can_delete?1:0.4,cursor:c.can_delete?'pointer':'not-allowed'}}>🗑️</button>
                </div>
              </div>
            ))}

            {!showCreate&&(
              <button onClick={()=>{setShowCreate(true);setCreateError('')}}
                style={{width:'100%',background:'none',border:'1.5px dashed var(--border2)',borderRadius:'var(--radius-lg)',padding:'13px',color:'var(--text3)',fontSize:13,fontWeight:600,marginTop:4}}>
                + Добавить компанию
              </button>
            )}
          </>
        )}

        {/* Форма создания */}
        {showCreate&&(
          <CompanyForm title="Новая компания" form={createForm} setForm={setCreateForm}
            error={createError} saving={creating} onSubmit={handleCreate}
            onCancel={()=>{setShowCreate(false);setCreateError('')}}/>
        )}

        {/* Форма редактирования */}
        {editId&&(
          <CompanyForm title="Редактировать компанию" form={editForm} setForm={setEditForm}
            error={editError} saving={editing} isEdit
            innConfirmPending={innConfirm}
            onSubmit={handleEdit} onConfirmInn={()=>handleEdit(null,true)}
            onCancel={()=>{setEditId(null);setInnConfirm(false)}}/>
        )}

        {/* Диалог удаления */}
        {deleteId&&(
          <div style={{position:'fixed',inset:0,background:'rgba(30,42,62,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:24}}>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,maxWidth:400,width:'100%',boxShadow:'var(--shadow-lg)'}}>
              {canDelete?.can_delete ? (
                <>
                  <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
                  <h3 style={{margin:'0 0 8px',color:'var(--text)'}}>Удалить компанию?</h3>
                  <p style={{margin:'0 0 20px',fontSize:13,color:'var(--text2)'}}>«{canDelete?.name}» будет удалена без возможности восстановления.</p>
                  {deleteError&&<div style={{background:'var(--error-light)',color:'var(--error)',fontSize:13,padding:'10px 12px',borderRadius:'var(--radius-sm)',marginBottom:14}}>{deleteError}</div>}
                  <div style={{display:'flex',gap:10}}>
                    <button onClick={handleDelete} disabled={deleting}
                      style={{flex:1,background:'var(--error)',color:'#fff',border:'none',padding:11,borderRadius:'var(--radius)',fontSize:14,fontWeight:700}}>
                      {deleting?'Удаляю...':'Удалить'}
                    </button>
                    <button onClick={()=>setDeleteId(null)}
                      style={{flex:1,background:'none',border:'1px solid var(--border)',color:'var(--text2)',padding:11,borderRadius:'var(--radius)',fontSize:14,fontWeight:600}}>
                      Отмена
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{fontSize:28,marginBottom:12}}>🚫</div>
                  <h3 style={{margin:'0 0 8px',color:'var(--text)'}}>Нельзя удалить</h3>
                  <p style={{margin:'0 0 6px',fontSize:13,color:'var(--text2)'}}>У компании «{canDelete?.name}» есть данные:</p>
                  <ul style={{margin:'0 0 20px',paddingLeft:20,fontSize:13,color:'var(--text2)'}}>
                    {canDelete?.doc_count>0&&<li>{canDelete.doc_count} документов</li>}
                    {canDelete?.journal_count>0&&<li>{canDelete.journal_count} проводок</li>}
                  </ul>
                  <p style={{margin:'0 0 20px',fontSize:13,color:'var(--warn)'}}>Сначала удалите все данные компании.</p>
                  <button onClick={()=>setDeleteId(null)}
                    style={{width:'100%',background:'var(--accent)',color:'#fff',border:'none',padding:11,borderRadius:'var(--radius)',fontSize:14,fontWeight:700}}>
                    Понятно
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CompanyForm({title,form,setForm,error,saving,onSubmit,onCancel,isEdit,innConfirmPending,onConfirmInn}) {
  return (
    <div style={{background:'var(--surface)',border:'1.5px solid var(--accent)',borderRadius:'var(--radius-lg)',padding:20,marginTop:12,boxShadow:'var(--shadow)'}}>
      <h3 style={{margin:'0 0 18px',fontSize:15,fontWeight:800,color:'var(--text)'}}>{title}</h3>
      <form onSubmit={onSubmit}>
        <Field label="Название *">
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            placeholder="ОсОО Ромашка" autoFocus style={{width:'100%',padding:'10px 12px'}}/>
        </Field>
        <Field label={isEdit?'ИНН (изменение требует подтверждения)':'ИНН'}>
          <input value={form.inn} onChange={e=>setForm(f=>({...f,inn:e.target.value}))}
            placeholder="12345678901234" style={{width:'100%',padding:'10px 12px'}}/>
        </Field>
        <Field label="Налоговый режим">
          <select value={form.tax_regime} onChange={e=>setForm(f=>({...f,tax_regime:e.target.value}))}
            style={{width:'100%',padding:'10px 12px'}}>
            {['ОРН (общий режим)','Упрощённая система','Патент','Плательщик НДС'].map(r=>(
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        {error&&<div style={{background:'var(--error-light)',color:'var(--error)',fontSize:13,padding:'10px 12px',borderRadius:'var(--radius-sm)',marginBottom:14}}>{error}</div>}
        {innConfirmPending&&(
          <div style={{background:'var(--warn-light)',border:'1px solid var(--warn)',borderRadius:'var(--radius-sm)',padding:'12px 14px',marginBottom:14}}>
            <p style={{margin:'0 0 10px',fontSize:13,color:'var(--warn-text)'}}>⚠️ Вы меняете ИНН. Подтвердите что это правильно.</p>
            <button type="button" onClick={onConfirmInn}
              style={{background:'var(--warn)',color:'#fff',border:'none',padding:'8px 16px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:700}}>
              Да, изменить ИНН
            </button>
          </div>
        )}
        <div style={{display:'flex',gap:10,marginTop:4}}>
          <button type="submit" disabled={saving}
            style={{flex:1,background:saving?'var(--text3)':'var(--accent)',color:'#fff',border:'none',padding:11,borderRadius:'var(--radius)',fontSize:14,fontWeight:700,boxShadow:'var(--shadow)'}}>
            {saving?'Сохраняю...':isEdit?'Сохранить':'Добавить'}
          </button>
          <button type="button" onClick={onCancel}
            style={{flex:1,background:'none',color:'var(--text2)',border:'1px solid var(--border)',padding:11,borderRadius:'var(--radius)',fontSize:14,fontWeight:600}}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({label,children}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</label>
      {children}
    </div>
  )
}
