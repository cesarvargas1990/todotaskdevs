import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExt from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { ArrowLeft, Calendar, CheckSquare, FileDown, LayoutGrid, LogOut, MessageCircle, Paperclip, Plus, Save, User, Users } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_BASE_URL || '/todotaskdev/api';
type UserT = { id:number; name:string; email:string };
type Status = 'TODO'|'IN_PROGRESS'|'BLOCKED'|'DONE';
type Task = { id:number; title:string; detailHtml:string; status:Status; createdBy:UserT; assignedTo:UserT; createdAt:string; updatedAt:string; comments?:any[]; attachments?:any[]; history?:any[] };
const statuses: [Status,string][] = [['TODO','TODO'],['IN_PROGRESS','En proceso'],['BLOCKED','Bloqueada'],['DONE','Finalizada']];

function token(){ return localStorage.getItem('token') || ''; }
async function api(path:string, options:RequestInit={}) {
  const headers:Record<string,string> = { ...(options.headers as any) };
  if (!(options.body instanceof FormData)) headers['Content-Type']='application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) throw new Error((await res.json().catch(()=>({message:'Error'}))).message || 'Error');
  return res.json();
}

function App(){
  return <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/todotaskdev/'}>
    <Routes>
      <Route path="/login" element={<Login/>}/>
      <Route path="/" element={<Shell><Board/></Shell>}/>
      <Route path="/new" element={<Shell><TaskForm/></Shell>}/>
      <Route path="/tasks/:id" element={<Shell><TaskDetail/></Shell>}/>
    </Routes>
  </BrowserRouter>;
}

function Login(){
  const nav = useNavigate(); const [email,setEmail]=useState('cesara.vargas1990@gmil.com'); const [password,setPassword]=useState('password'); const [err,setErr]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault(); setErr(''); try{const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})}); localStorage.setItem('token',r.accessToken); nav('/');}catch(ex:any){setErr(ex.message)}}
  return <main className="login">
    <section className="brand"><CheckSquare size={58}/><h1>Todo<span>Tasks</span></h1><p>Gestión simple y colaborativa de tareas</p></section>
    <form className="login-card" onSubmit={submit}><h2>Iniciar sesión</h2><p>Ingresa tus credenciales para continuar</p>
      <label>Correo electrónico<input value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
      {err && <div className="error">{err}</div>}<button>Iniciar sesión</button>
    </form>
    <aside className="test-users"><h3><Users size={20}/> Usuarios de prueba</h3><b>cesara.vargas1990@gmil.com</b><small>Contraseña: password</small><hr/><b>hezuri@hotmail.com</b><small>Contraseña: password</small></aside>
  </main>
}

function Shell({children}:{children:React.ReactNode}){
  const [me,setMe]=useState<UserT|null>(null); const nav=useNavigate();
  useEffect(()=>{api('/auth/me').then(setMe).catch(()=>nav('/login'))},[]);
  function out(){localStorage.removeItem('token'); nav('/login')}
  return <div className="app"><aside className="side"><Link className="logo" to="/"><CheckSquare/> Todo<span>Tasks</span></Link><Link to="/"><LayoutGrid/> Tablero</Link><Link to="/new"><Plus/> Crear tarea</Link><button onClick={out}><LogOut/> Cerrar sesión</button></aside><header><nav><Link to="/"><LayoutGrid/> Tablero</Link><Link to="/new"><Plus/> Crear tarea</Link></nav><div className="profile"><span>{me?.name?.slice(0,2) || 'CV'}</span><b>{me?.name}</b></div></header><main className="content">{children}</main></div>
}

function Board(){
  const [tasks,setTasks]=useState<Task[]>([]); useEffect(()=>{api('/tasks').then(setTasks)},[]);
  return <><div className="topline"><h2>Tablero</h2><Link className="primary" to="/new"><Plus/> Nueva tarea</Link></div><div className="kanban">{statuses.map(([s,label])=><section className={`col ${s}`} key={s}><h3><span></span>{label}<em>{tasks.filter(t=>t.status===s).length}</em></h3>{tasks.filter(t=>t.status===s).map(t=><TaskCard key={t.id} task={t}/>)}</section>)}</div></>
}
function TaskCard({task}:{task:Task}){return <Link className="task-card" to={`/tasks/${task.id}`}><h4>{task.title}</h4><div className={`chip ${task.status}`}>{statuses.find(s=>s[0]===task.status)?.[1]}</div><p>TT-{String(task.id).padStart(6,'0')}</p><div className="people"><small>Creada por<br/><b>{task.createdBy.name}</b></small><small>Asignada a<br/><b>{task.assignedTo.name}</b></small></div><footer><span><Calendar size={15}/>{new Date(task.createdAt).toLocaleDateString()}</span><span><MessageCircle size={15}/>{task.comments?.length||0}</span><span><Paperclip size={15}/>{task.attachments?.length||0}</span></footer></Link>}

function Editor({value,onChange}:{value:string;onChange:(v:string)=>void}){
  const editor=useEditor({extensions:[StarterKit,LinkExt,Image,Placeholder.configure({placeholder:'Describe la tarea...'}),Table.configure({resizable:true}),TableRow,TableHeader,TableCell],content:value,onUpdate:({editor})=>onChange(editor.getHTML())});
  return <div className="editor"><div className="toolbar"><button type="button" onClick={()=>editor?.chain().focus().toggleBold().run()}>B</button><button type="button" onClick={()=>editor?.chain().focus().toggleItalic().run()}>I</button><button type="button" onClick={()=>editor?.chain().focus().toggleBulletList().run()}>•</button><button type="button" onClick={()=>editor?.chain().focus().toggleOrderedList().run()}>1.</button><button type="button" onClick={()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}>Tabla</button></div><EditorContent editor={editor}/></div>
}

function TaskForm(){
  const [users,setUsers]=useState<UserT[]>([]), [title,setTitle]=useState(''), [detail,setDetail]=useState(''), [assigned,setAssigned]=useState(''), [files,setFiles]=useState<FileList|null>(null), [err,setErr]=useState(''); const nav=useNavigate();
  useEffect(()=>{api('/users').then((u)=>{setUsers(u); setAssigned(String(u[0]?.id||''))})},[]);
  async function submit(e:React.FormEvent){e.preventDefault(); setErr(''); const fd=new FormData(); fd.append('title',title); fd.append('detailHtml',detail); fd.append('assignedToId',assigned); Array.from(files||[]).forEach(f=>fd.append('attachments',f)); try{const t=await api('/tasks',{method:'POST',body:fd}); nav(`/tasks/${t.id}`)}catch(ex:any){setErr(ex.message)}}
  return <form className="panel form" onSubmit={submit}><h2>Crear tarea</h2><label>Título *<input maxLength={150} required value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Detalle *</label><Editor value={detail} onChange={setDetail}/><div className="grid2"><label>Usuario asignado *<select value={assigned} onChange={e=>setAssigned(e.target.value)}>{users.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label><label>Estado inicial<input disabled value="TODO"/></label></div><label>Adjuntos<input type="file" multiple onChange={e=>setFiles(e.target.files)}/><small>Máximo 10 MB. PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, PNG, JPG.</small></label>{err&&<div className="error">{err}</div>}<div className="actions"><Link className="secondary" to="/">Cancelar</Link><button><Save size={18}/> Guardar tarea</button></div></form>
}

function TaskDetail(){
  const {id}=useParams(); const [task,setTask]=useState<Task|null>(null); const [comment,setComment]=useState(''); const [status,setStatus]=useState<Status>('TODO'); const [statusComment,setStatusComment]=useState('');
  const load=()=>api(`/tasks/${id}`).then((t)=>{setTask(t); setStatus(t.status)}); useEffect(()=>{void load()},[id]); if(!task) return <div className="panel">Cargando...</div>;
  async function change(){await api(`/tasks/${id}/status`,{method:'PATCH',body:JSON.stringify({status,comment:statusComment})}); setStatusComment(''); load()}
  async function addComment(){if(!comment.trim())return; await api(`/tasks/${id}/comments`,{method:'POST',body:JSON.stringify({content:comment})}); setComment(''); load()}
  async function delAtt(att:any){if(confirm('¿Eliminar este archivo?')){await api(`/attachments/${att.id}`,{method:'DELETE'}); load()}}
  async function download(att:any){const res=await fetch(`${API}/attachments/${att.id}/download`,{headers:{Authorization:`Bearer ${token()}`}}); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=att.originalName; a.click(); URL.revokeObjectURL(url)}
  const clean=useMemo(()=>DOMPurify.sanitize(task.detailHtml),[task.detailHtml]);
  return <article className="detail"><Link to="/" className="back"><ArrowLeft/> Volver</Link><section className="panel"><small>CÓDIGO DE TAREA</small><h2>TT-{String(task.id).padStart(6,'0')}</h2><h1>{task.title}</h1><div className={`chip ${task.status}`}>{statuses.find(s=>s[0]===task.status)?.[1]}</div></section><section className="panel meta"><div><User/>Creada por <b>{task.createdBy.name}</b></div><div><User/>Asignada a <b>{task.assignedTo.name}</b></div><div><Calendar/>Creación <b>{new Date(task.createdAt).toLocaleString()}</b></div><div><Calendar/>Actualización <b>{new Date(task.updatedAt).toLocaleString()}</b></div></section><section className="panel"><h3>Descripción</h3><div className="html" dangerouslySetInnerHTML={{__html:clean}}/></section><section className="panel"><h3>Archivos adjuntos</h3>{task.attachments?.map(a=><div className="file" key={a.id}><Paperclip/> {a.originalName} <small>{Math.round(a.fileSize/1024)} KB</small><button onClick={()=>download(a)}><FileDown/></button><button onClick={()=>delAtt(a)}>×</button></div>)}</section><section className="panel"><h3>Cambiar estado</h3><div className="row"><select value={status} onChange={e=>setStatus(e.target.value as Status)}>{statuses.map(s=><option value={s[0]} key={s[0]}>{s[1]}</option>)}</select><input placeholder="Comentario, obligatorio si bloquea" value={statusComment} onChange={e=>setStatusComment(e.target.value)}/><button onClick={change}>Cambiar</button></div></section><section className="panel"><h3>Historial de estados</h3>{task.history?.map(h=><p key={h.id}><b>{statuses.find(s=>s[0]===h.newStatus)?.[1]}</b> - {h.changedBy.name} <small>{new Date(h.createdAt).toLocaleString()}</small> {h.comment}</p>)}</section><section className="panel"><h3>Comentarios</h3>{task.comments?.map(c=><p className="comment" key={c.id}><b>{c.user.name}</b><br/>{c.content}<br/><small>{new Date(c.createdAt).toLocaleString()}</small></p>)}<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Agregar comentario"/><button onClick={addComment}><MessageCircle/> Comentar</button></section></article>
}

createRoot(document.getElementById('root')!).render(<App/>);
