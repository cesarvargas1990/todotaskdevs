import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { ArrowLeft, Calendar, CheckSquare, FileDown, LayoutGrid, LogOut, MessageCircle, Paperclip, Plus, Save, Share2, User } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_BASE_URL || '/todotaskdev/api';
type UserT = { id:number; name:string; email:string };
type Status = 'TODO'|'IN_PROGRESS'|'BLOCKED'|'DONE';
type Task = { id:number; title:string; detailHtml:string; status:Status; createdBy:UserT; assignedTo:UserT; createdAt:string; updatedAt:string; comments?:any[]; attachments?:any[]; history?:any[] };
const statuses: [Status,string][] = [['TODO','TODO'],['IN_PROGRESS','En proceso'],['BLOCKED','Bloqueada'],['DONE','Finalizada']];
const imageTypes = new Set(['image/png','image/jpeg','image/webp','image/gif']);

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
  const nav = useNavigate(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [err,setErr]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault(); setErr(''); try{const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})}); localStorage.setItem('token',r.accessToken); nav('/');}catch(ex:any){setErr(ex.message)}}
  return <main className="login">
    <section className="brand"><CheckSquare size={58}/><h1>Todo<span>Tasks</span></h1><p>Gestión simple y colaborativa de tareas</p></section>
    <form className="login-card" onSubmit={submit}><h2>Iniciar sesión</h2><p>Ingresa tus credenciales para continuar</p>
      <label>Correo electrónico<input value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
      {err && <div className="error">{err}</div>}<button>Iniciar sesión</button>
    </form>
  </main>
}

function Shell({children}:{children:React.ReactNode}){
  const [me,setMe]=useState<UserT|null>(null); const nav=useNavigate();
  useEffect(()=>{api('/auth/me').then(setMe).catch(()=>nav('/login'))},[]);
  function out(){localStorage.removeItem('token'); nav('/login')}
  return <div className="app"><aside className="side"><Link className="logo" to="/"><CheckSquare/> Todo<span>Tasks</span></Link><Link to="/"><LayoutGrid/> Tablero</Link><Link to="/new"><Plus/> Crear tarea</Link><button onClick={out}><LogOut/> Cerrar sesión</button></aside><header><nav><Link to="/"><LayoutGrid/> Tablero</Link><Link to="/new"><Plus/> Crear tarea</Link></nav><div className="profile"><span>{me?.name?.slice(0,2) || 'CV'}</span><b>{me?.name}</b></div></header><main className="content">{children}</main></div>
}

function Board(){
  const [tasks,setTasks]=useState<Task[]>([]), [err,setErr]=useState(''), [dragging,setDragging]=useState<number|null>(null), [blockMove,setBlockMove]=useState<{taskId:number;comment:string}|null>(null);
  const load=()=>api('/tasks').then(setTasks).catch((ex:any)=>setErr(ex.message));
  useEffect(()=>{void load()},[]);
  async function moveTask(taskId:number,status:Status,comment=''){
    const previous=tasks;
    setTasks(tasks.map(t=>t.id===taskId?{...t,status,updatedAt:new Date().toISOString()}:t));
    try{await api(`/tasks/${taskId}/status`,{method:'PATCH',body:JSON.stringify({status,comment})});}
    catch(ex:any){setTasks(previous); setErr(ex.message || 'No se pudo mover la tarea');}
    finally{setDragging(null);}
  }
  function dropTask(taskId:number,status:Status){if(status==='BLOCKED') setBlockMove({taskId,comment:''}); else void moveTask(taskId,status)}
  return <section className="board-page"><div className="topline"><h2>Tablero</h2><Link className="primary" to="/new"><Plus/> Nueva tarea</Link></div>{err&&<div className="error">{err}</div>}<div className="kanban">{statuses.map(([s,label])=>{const items=tasks.filter(t=>t.status===s);return <section className={`col ${s} ${dragging?'drop-ready':''}`} key={s} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); const id=Number(e.dataTransfer.getData('text/task-id')); if(id) dropTask(id,s)}}><h3><span></span>{label}<em>{items.length}</em></h3>{items.map(t=><TaskCard key={t.id} task={t} onDragStart={()=>setDragging(t.id)}/>)}</section>})}</div>{blockMove&&<div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault(); if(!blockMove.comment.trim()){setErr('Para bloquear una tarea debes indicar el motivo.'); return;} void moveTask(blockMove.taskId,'BLOCKED',blockMove.comment.trim()); setBlockMove(null);}}><h3>Motivo de bloqueo</h3><textarea autoFocus value={blockMove.comment} onChange={e=>setBlockMove({...blockMove,comment:e.target.value})} placeholder="Describe por qué queda bloqueada"/><div className="actions"><button type="button" className="secondary" onClick={()=>{setBlockMove(null); setDragging(null)}}>Cancelar</button><button type="submit">Bloquear tarea</button></div></form></div>}</section>
}
function TaskCard({task,onDragStart}:{task:Task;onDragStart:()=>void}){return <Link className="task-card" to={`/tasks/${task.id}`} draggable onDragStart={e=>{e.dataTransfer.setData('text/task-id',String(task.id)); onDragStart();}}><h4>{task.title}</h4><div className={`chip ${task.status}`}>{statuses.find(s=>s[0]===task.status)?.[1]}</div><p>TT-{String(task.id).padStart(6,'0')}</p><div className="people"><small>Creada por<br/><b>{task.createdBy.name}</b></small><small>Asignada a<br/><b>{task.assignedTo.name}</b></small></div><footer><span><Calendar size={15}/>{new Date(task.createdAt).toLocaleDateString()}</span><span><MessageCircle size={15}/>{task.comments?.length||0}</span><span><Paperclip size={15}/>{task.attachments?.length||0}</span></footer></Link>}

function Editor({value,onChange}:{value:string;onChange:(v:string)=>void}){
  const textareaRef=useRef<HTMLTextAreaElement|null>(null);
  const editorRef=useRef<any>(null);
  const idRef=useRef(`tinymce-${Math.random().toString(36).slice(2)}`);
  const [editorReady,setEditorReady]=useState(false);
  const [editorError,setEditorError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    let fallbackTimer:number|undefined;
    function loadTinyMce(){
      if((window as any).tinymce) return Promise.resolve();
      return new Promise<void>((resolve,reject)=>{
        const cdn='https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js';
        const existing=document.querySelector('script[data-tinymce]');
        if(existing){
          if((existing as HTMLScriptElement).src !== cdn) existing.remove();
          else {
          let checks=0;
          const interval=window.setInterval(()=>{checks++; if((window as any).tinymce){window.clearInterval(interval); resolve();} if(checks>80){window.clearInterval(interval); reject(new Error('TinyMCE fue descargado pero no quedó disponible en window.tinymce'));}},50);
          existing.addEventListener('load',()=>resolve(),{once:true});
          existing.addEventListener('error',()=>reject(new Error('No se pudo cargar TinyMCE')),{once:true});
          return;
          }
        }
        const script=document.createElement('script');
        script.src=cdn;
        script.referrerPolicy='origin';
        script.dataset.tinymce='true';
        script.onload=()=>{if((window as any).tinymce) resolve(); else reject(new Error('TinyMCE descargó, pero no inicializó el global tinymce'));};
        script.onerror=()=>reject(new Error('No se pudo cargar TinyMCE'));
        document.head.appendChild(script);
      });
    }
    fallbackTimer=window.setTimeout(()=>setEditorError('TinyMCE tardó demasiado en cargar. Puedes escribir HTML en el campo alterno.'),6000);
    loadTinyMce().then(()=>{
      if(cancelled || !textareaRef.current) return;
      const tinymce=(window as any).tinymce;
      tinymce.init({
        target: textareaRef.current,
        base_url: 'https://cdn.jsdelivr.net/npm/tinymce@7',
        suffix: '.min',
        license_key: 'gpl',
        menubar: false,
        branding: false,
        promotion: false,
        height: 420,
        plugins: 'autolink lists link image table code autoresize',
        toolbar: 'undo redo | blocks | bold italic underline | bullist numlist blockquote | alignleft aligncenter alignright | link image table | removeformat code',
        paste_data_images: true,
        automatic_uploads: true,
        images_upload_handler: (blobInfo:any) => Promise.resolve(`data:${blobInfo.blob().type};base64,${blobInfo.base64()}`),
        content_style: 'body{font-family:Inter,system-ui,Arial,sans-serif;font-size:15px;line-height:1.55;color:#07133d} img{max-width:100%;height:auto;border-radius:8px} table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:8px}th{background:#f2f6fd}',
        setup: (editor:any) => {
          editorRef.current=editor;
          editor.on('Change KeyUp Paste Drop SetContent',()=>onChange(editor.getContent()));
          editor.on('init',()=>{if(fallbackTimer) window.clearTimeout(fallbackTimer); setEditorReady(true); setEditorError('');});
        },
        init_instance_callback: (editor:any) => {
          editor.setContent(value || '');
          onChange(editor.getContent());
          if(fallbackTimer) window.clearTimeout(fallbackTimer);
          setEditorReady(true);
          setEditorError('');
        },
      });
    }).catch((error:Error)=>{if(fallbackTimer) window.clearTimeout(fallbackTimer); setEditorError(error.message);});
    return()=>{cancelled=true; if(fallbackTimer) window.clearTimeout(fallbackTimer); if(editorRef.current){editorRef.current.remove(); editorRef.current=null;}};
  },[]);
  useEffect(()=>{if(editorRef.current && value!==editorRef.current.getContent()) editorRef.current.setContent(value || '');},[value]);
  return <div className="editor tinymce-editor">{!editorReady&&!editorError&&<div className="editor-status">Cargando TinyMCE...</div>}{editorError&&<div className="error">TinyMCE no cargó: {editorError}</div>}<textarea id={idRef.current} ref={textareaRef} value={value} onChange={e=>onChange(e.target.value)} placeholder="Escribe el detalle de la tarea"/></div>
}

function TaskForm(){
  const [users,setUsers]=useState<UserT[]>([]), [title,setTitle]=useState(''), [detail,setDetail]=useState(''), [assigned,setAssigned]=useState(''), [files,setFiles]=useState<FileList|null>(null), [err,setErr]=useState(''); const nav=useNavigate();
  const previews=useMemo(()=>Array.from(files||[]).map(file=>({file,url:imageTypes.has(file.type)?URL.createObjectURL(file):''})),[files]);
  useEffect(()=>()=>previews.forEach(item=>item.url&&URL.revokeObjectURL(item.url)),[previews]);
  useEffect(()=>{api('/users').then((u)=>{setUsers(u); setAssigned(String(u[0]?.id||''))})},[]);
  async function submit(e:React.FormEvent){e.preventDefault(); setErr(''); const fd=new FormData(); fd.append('title',title); fd.append('detailHtml',detail); fd.append('assignedToId',assigned); Array.from(files||[]).forEach(f=>fd.append('attachments',f)); try{const t=await api('/tasks',{method:'POST',body:fd}); nav(`/tasks/${t.id}`)}catch(ex:any){setErr(ex.message)}}
  return <form className="panel form" onSubmit={submit}><h2>Crear tarea</h2><label>Título *<input maxLength={150} required value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Detalle *</label><Editor value={detail} onChange={setDetail}/><div className="grid2"><label>Usuario asignado *<select value={assigned} onChange={e=>setAssigned(e.target.value)}>{users.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label><label>Estado inicial<input disabled value="TODO"/></label></div><label>Adjuntos<input type="file" multiple onChange={e=>setFiles(e.target.files)}/><small>Máximo 10 MB. PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, PNG, JPG.</small></label>{previews.length>0&&<div className="preview-grid">{previews.map(({file,url})=><div className="preview" key={`${file.name}-${file.size}`}>{url?<img src={url} alt={file.name}/>:<Paperclip/>}<b>{file.name}</b><small>{Math.round(file.size/1024)} KB</small></div>)}</div>}{err&&<div className="error">{err}</div>}<div className="actions"><Link className="secondary" to="/">Cancelar</Link><button><Save size={18}/> Guardar tarea</button></div></form>
}

function AttachmentPreview({att}:{att:any}){
  const [src,setSrc]=useState('');
  useEffect(()=>{if(!imageTypes.has(att.mimeType))return; let active=true; fetch(`${API}/attachments/${att.id}/download`,{headers:{Authorization:`Bearer ${token()}`}}).then(r=>r.blob()).then(blob=>{if(!active)return; setSrc(URL.createObjectURL(blob));}); return()=>{active=false; if(src) URL.revokeObjectURL(src)}},[att.id,att.mimeType]);
  if(!imageTypes.has(att.mimeType)) return null;
  return src ? <img className="attachment-thumb" src={src} alt={att.originalName}/> : <div className="attachment-thumb loading-thumb">Cargando imagen...</div>;
}

function TaskDetail(){
  const {id}=useParams(); const [task,setTask]=useState<Task|null>(null); const [comment,setComment]=useState(''); const [status,setStatus]=useState<Status>('TODO'); const [statusComment,setStatusComment]=useState(''); const [err,setErr]=useState('');
  const clean=useMemo(()=>DOMPurify.sanitize(task?.detailHtml || ''),[task?.detailHtml]);
  const load=()=>api(`/tasks/${id}`).then((t)=>{setTask(t); setStatus(t.status); setErr('')}).catch((ex:any)=>setErr(ex.message || 'No se pudo abrir la tarea')); useEffect(()=>{void load()},[id]); if(err) return <article className="detail"><Link to="/" className="back"><ArrowLeft/> Volver</Link><div className="panel error">{err}</div></article>; if(!task) return <div className="panel loading">Cargando tarea...</div>;
  async function change(){await api(`/tasks/${id}/status`,{method:'PATCH',body:JSON.stringify({status,comment:statusComment})}); setStatusComment(''); load()}
  async function addComment(){if(!comment.trim())return; await api(`/tasks/${id}/comments`,{method:'POST',body:JSON.stringify({content:comment})}); setComment(''); load()}
  async function delAtt(att:any){if(confirm('¿Eliminar este archivo?')){await api(`/attachments/${att.id}`,{method:'DELETE'}); load()}}
  async function download(att:any){const res=await fetch(`${API}/attachments/${att.id}/download`,{headers:{Authorization:`Bearer ${token()}`}}); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=att.originalName; a.click(); URL.revokeObjectURL(url)}
  async function share(){await navigator.clipboard?.writeText(window.location.href);}
  return <article className="detail"><div className="detail-actions"><Link to="/" className="back"><ArrowLeft/> Volver</Link><button type="button" className="secondary" onClick={share}><Share2 size={17}/> Compartir</button></div><section className="panel"><small>CÓDIGO DE TAREA</small><h2>TT-{String(task.id).padStart(6,'0')}</h2><h1>{task.title}</h1><div className={`chip ${task.status}`}>{statuses.find(s=>s[0]===task.status)?.[1]}</div></section><section className="panel meta"><div><User/>Creada por <b>{task.createdBy?.name || 'Sin usuario'}</b></div><div><User/>Asignada a <b>{task.assignedTo?.name || 'Sin usuario'}</b></div><div><Calendar/>Creación <b>{new Date(task.createdAt).toLocaleString()}</b></div><div><Calendar/>Actualización <b>{new Date(task.updatedAt).toLocaleString()}</b></div></section><section className="panel"><h3>Descripción</h3><div className="html" dangerouslySetInnerHTML={{__html:clean}}/></section><section className="panel"><h3>Archivos adjuntos</h3>{task.attachments?.length?task.attachments.map(a=><div className="file" key={a.id}><AttachmentPreview att={a}/><div className="file-info"><Paperclip/> <b>{a.originalName}</b> <small>{Math.round(a.fileSize/1024)} KB</small></div><button onClick={()=>download(a)}><FileDown/></button><button onClick={()=>delAtt(a)}>×</button></div>):<p className="empty">Sin archivos adjuntos</p>}</section><section className="panel"><h3>Cambiar estado</h3><div className="row"><select value={status} onChange={e=>setStatus(e.target.value as Status)}>{statuses.map(s=><option value={s[0]} key={s[0]}>{s[1]}</option>)}</select><input placeholder="Comentario, obligatorio si bloquea" value={statusComment} onChange={e=>setStatusComment(e.target.value)}/><button onClick={change}>Cambiar</button></div></section><section className="panel"><h3>Historial de estados</h3>{task.history?.length?task.history.map(h=><p key={h.id}><b>{statuses.find(s=>s[0]===h.newStatus)?.[1]}</b> - {h.changedBy?.name || 'Sistema'} <small>{new Date(h.createdAt).toLocaleString()}</small> {h.comment}</p>):<p className="empty">Sin historial</p>}</section><section className="panel"><h3>Comentarios</h3>{task.comments?.map(c=><p className="comment" key={c.id}><b>{c.user?.name || 'Usuario'}</b><br/>{c.content}<br/><small>{new Date(c.createdAt).toLocaleString()}</small></p>)}<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Agregar comentario"/><button onClick={addComment}><MessageCircle/> Comentar</button></section></article>
}

createRoot(document.getElementById('root')!).render(<App/>);
