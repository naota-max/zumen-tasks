import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const INIT_REQUESTERS = ["友田","野村","三好","大北","水田","吉田","小坂","加藤宝","加藤敏"];
const INIT_ASSIGNEES  = ["星","江川"];
const INIT_EMAILS = {};

const PRIORITIES  = ["高","中","低"];
const STATUSES    = ["未着手","作成・修正中","完了"];
const DESC_PRESETS = ["白図（作成・修正）","天伏（作成・修正）","MD図（作成・修正）","現状図（作成・修正）"];

const STATUS_META = {
  "未着手":      { bg:"#f1f5f9", text:"#64748b", dot:"#94a3b8", border:"#e2e8f0" },
  "作成・修正中": { bg:"#fff7ed", text:"#ea580c", dot:"#f97316", border:"#fed7aa" },
  "完了":        { bg:"#f0fdf4", text:"#16a34a", dot:"#22c55e", border:"#bbf7d0" },
};
const PRIORITY_META = {
  "高":{ color:"#ef4444", bg:"#fef2f2" },
  "中":{ color:"#f59e0b", bg:"#fffbeb" },
  "低":{ color:"#6b7280", bg:"#f8fafc" },
};
const ASSIGNEE_PALETTE = [
  ["#dbeafe","#1d4ed8"],["#fef3c7","#b45309"],["#fce7f3","#be185d"],
  ["#dcfce7","#15803d"],["#ede9fe","#6d28d9"],["#fef9c3","#a16207"],
];
function assigneeColor(name, list) {
  const i = list.indexOf(name);
  return ASSIGNEE_PALETTE[i >= 0 ? i % ASSIGNEE_PALETTE.length : 0];
}

// Supabase row → app object
function rowToTask(r) {
  return {
    id: r.id,
    title: r.title,
    descs: r.descs || [],
    customDesc: r.custom_desc || "",
    requester: r.requester || "",
    assignee: r.assignee || "",
    priority: r.priority || "中",
    status: r.status || "未着手",
    due: r.due || "",
    memo: r.memo || "",
    archived: r.archived || false,
    relayedFrom: r.relayed_from || "",
    relayedAt: r.relayed_at || "",
    relayHistory: typeof r.relay_history === 'string' ? JSON.parse(r.relay_history) : (r.relay_history || []),
  };
}

// app object → Supabase row
function taskToRow(t) {
  return {
    title: t.title,
    descs: t.descs,
    custom_desc: t.customDesc,
    requester: t.requester,
    assignee: t.assignee,
    priority: t.priority,
    status: t.status,
    due: t.due || null,
    memo: t.memo,
    archived: t.archived,
    relayed_from: t.relayedFrom || "",
    relay_history: t.relayHistory || [],
  };
}

function sortTasks(list) {
  const po = {"高":0,"中":1,"低":2};
  return [...list].sort((a,b)=>{
    const da=a.due||"9999", db=b.due||"9999";
    if(da!==db) return da<db?-1:1;
    return po[a.priority]-po[b.priority];
  });
}

function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function openMailto({ subject, body, to }) {
  if (!to) return false;
  // GmailのURL形式で直接開く
  const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, "_blank");
  return true;
}

function buildMail(task, type, signature="") {
  const descs = [...task.descs, ...(task.customDesc?[task.customDesc]:[])].join("、");
  const assignee = task.assignee || "未定";
  const requester = task.requester || "―";
  const due = task.due || "未設定";
  const now = nowStr();
  const sig = signature ? `\n\n${signature}` : "";  // -- を削除
  const APP_URL = "https://zumen-tasks.vercel.app";
  if (type === "new") return { subject:`【図面タスク新規】${task.title}`, body:`${assignee} さん\n\n以下のタスクが登録されました。ご確認ください。\n\n■ 件名：${task.title}\n■ 図面種別：${descs}\n■ 依頼者：${requester}\n■ 優先度：${task.priority}\n■ 期日：${due}\n■ ステータス：${task.status}${task.memo?`\n■ メモ：${task.memo}`:""}\n\n登録日時：${now}\n\n図面タスク管理：${APP_URL}\n\nよろしくお願いします。${sig}` };
  if (type === "relay") return { subject:`【引継ぎ】${task.title}`, body:`お疲れ様です。\n\n本日の作業状況をご共有します。\n\n■ 件名：${task.title}\n■ 図面種別：${descs}\n■ 依頼者：${requester}\n■ 優先度：${task.priority}\n■ 期日：${due}\n\n${task.memo||"（記載なし）"}\n\n【続きをお願いできる方へ】\n上記の続きからご対応をお願いします。\n\n対応者：${assignee}\n\n図面タスク管理：${APP_URL}\n\nよろしくお願いします。${sig}` };
  if (type === "status") return { subject:`【ステータス変更】${task.title}`, body:`${assignee} さん\n\n以下のタスクのステータスが変更されました。\n\n■ 件名：${task.title}\n■ 図面種別：${descs}\n■ 対応者：${assignee}\n■ 依頼者：${requester}\n■ ステータス：${task.status}\n■ 期日：${due}\n\n更新日時：${now}\n\n図面タスク管理：${APP_URL}\n\nよろしくお願いします。${sig}` };
  if (type === "complete") return { subject:`【完了報告】${task.title}`, body:`${requester} さん\n\n以下のタスクが完了しました。ご確認ください。\n\n■ 件名：${task.title}\n■ 図面種別：${descs}\n■ 対応者：${assignee}\n■ 完了日時：${now}\n\n図面タスク管理：${APP_URL}\n\nよろしくお願いします。${sig}` };
  return { subject:"", body:"" };
}

// ── Avatar ──
function Avatar({ name, assignees, size=28 }) {
  if (!name) return <div style={{width:size,height:size,borderRadius:"50%",background:"#f1f5f9",color:"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.4,flexShrink:0,border:"2px solid white"}}>−</div>;
  const [bg,tc] = assigneeColor(name, assignees);
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:tc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.45,fontWeight:800,flexShrink:0,border:"2px solid white"}}>{name[0]}</div>;
}

function Chip({ label }) {
  return <span style={{background:"#eef2ff",color:"#4f46e5",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}

function MasterModal({ title, items, onAdd, onRemove, onClose }) {
  const [input, setInput] = useState("");
  const add = () => { const v=input.trim(); if(v&&!items.includes(v)){onAdd(v);setInput("");} };
  const inp = {padding:"8px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,color:"#1e293b",outline:"none",fontFamily:"inherit",background:"#f8fafc",flex:1};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:18,padding:24,maxWidth:360,width:"90%",boxShadow:"0 24px 80px rgba(0,0,0,0.18)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:900,fontSize:15,color:"#0f172a"}}>{title}の管理</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input style={inp} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="追加する名前を入力" />
          <button onClick={add} style={{background:"#3b82f6",color:"white",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>追加</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {items.map(item=>(
            <span key={item} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f1f5f9",color:"#0f172a",fontSize:13,padding:"4px 10px",borderRadius:20,fontWeight:600}}>
              {item}
              <button onClick={()=>onRemove(item)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,padding:0,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#94a3b8"}>✕</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ task, onConfirm, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(3px)"}} onClick={onCancel}>
      <div style={{background:"white",borderRadius:18,padding:"26px 30px",maxWidth:360,width:"90%",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:36,marginBottom:10}}>🗑️</div>
        <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:8}}>タスクを削除しますか？</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:22}}>「{task.title}」を削除します。<br/>この操作は元に戻せません。</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onCancel} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={onConfirm} style={{background:"#ef4444",color:"white",border:"none",borderRadius:10,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>削除する</button>
        </div>
      </div>
    </div>
  );
}

function EmailSettingsModal({ requesters, assignees, emails, signature, onSave, onSaveSignature, onClose }) {
  const [local, setLocal] = useState({...emails});
  const [localSig, setLocalSig] = useState(signature||"");
  const allNames = [...assignees, ...requesters.filter(r=>!assignees.includes(r))];
  const set = (name, val) => setLocal(e=>({...e,[name]:val}));
  const registered = allNames.filter(n=>local[n]&&local[n].includes("@")).length;
  const inp = {padding:"7px 11px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:13,color:"#1e293b",outline:"none",fontFamily:"inherit",background:"#f8fafc",width:"100%",boxSizing:"border-box"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:20,padding:26,width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontWeight:900,fontSize:16,color:"#0f172a"}}>📧 メールアドレス設定</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <p style={{fontSize:12,color:"#64748b",marginBottom:16,marginTop:0}}>登録したアドレス全員にBCCで一斉送信されます。現在 <strong style={{color:"#3b82f6"}}>{registered}名</strong> 登録済み。</p>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:8}}>対応者</div>
          {assignees.map(name=>(
            <div key={name} style={{display:"grid",gridTemplateColumns:"80px 1fr",gap:10,alignItems:"center",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{name}</div>
              <input style={inp} type="email" value={local[name]||""} onChange={e=>set(name,e.target.value)} placeholder="xxx@example.com" />
            </div>
          ))}
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:8}}>依頼者</div>
          {requesters.map(name=>(
            <div key={name} style={{display:"grid",gridTemplateColumns:"80px 1fr",gap:10,alignItems:"center",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{name}</div>
              <input style={inp} type="email" value={local[name]||""} onChange={e=>set(name,e.target.value)} placeholder="xxx@example.com" />
            </div>
          ))}
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:8}}>署名</div>
          <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={localSig} onChange={e=>setLocalSig(e.target.value)} placeholder={"例：\n株式会社〇〇\n対応：山田太郎\nTEL: 03-XXXX-XXXX"} />
          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>メール本文の末尾に自動で追加されます</div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={()=>{onSave(local);onSaveSignature(localSig);onClose();}} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"9px 22px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>保存する</button>
        </div>
      </div>
    </div>
  );
}

function SendConfirmModal({ task, type, emails, signature, onClose }) {
  const { subject: initSubject, body: initBody } = buildMail(task, type, signature);
  const allEmailEntries = Object.entries(emails).filter(([,v])=>v&&v.includes("@"));
  const noEmail = allEmailEntries.length === 0;
  const [selected, setSelected] = useState(() => Object.fromEntries(allEmailEntries.map(([k])=>[k,false])));
  const [editSubject, setEditSubject] = useState(initSubject);
  const [editBody, setEditBody] = useState(initBody);
  const [sent, setSent] = useState(false);
  const TYPE_LABELS = { new:"新規作成通知", relay:"引継ぎ依頼", status:"ステータス変更通知", complete:"完了報告" };
  const ta = {padding:"11px 13px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:12,color:"#1e293b",outline:"none",fontFamily:"monospace",background:"white",width:"100%",boxSizing:"border-box",resize:"vertical",lineHeight:1.7};
  const inp = {padding:"8px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:13,color:"#1e293b",outline:"none",fontFamily:"inherit",background:"white",width:"100%",boxSizing:"border-box"};

  const selectedEmails = allEmailEntries.filter(([k])=>selected[k]).map(([,v])=>v);
  const to = selectedEmails.join(",");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:20,padding:26,width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontWeight:900,fontSize:16,color:"#0f172a"}}>✉️ {TYPE_LABELS[type]}</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {noEmail ? (
          <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:"#b91c1c"}}>⚠️ メールアドレスが未登録です。ヘッダーの「📧 メール設定」から登録してください。</div>
        ) : (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:8}}>送信先を選択</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {allEmailEntries.map(([name])=>(
                <label key={name} style={{display:"inline-flex",alignItems:"center",gap:6,background:selected[name]?"#eff6ff":"#f8fafc",border:`1.5px solid ${selected[name]?"#3b82f6":"#e2e8f0"}`,borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700,color:selected[name]?"#1d4ed8":"#64748b",transition:"all 0.15s"}}>
                  <input type="checkbox" checked={!!selected[name]} onChange={e=>setSelected(s=>({...s,[name]:e.target.checked}))} style={{accentColor:"#3b82f6"}} />
                  {name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:4}}>件名（編集可）</div>
          <input style={inp} value={editSubject} onChange={e=>setEditSubject(e.target.value)} />
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:4}}>本文（編集可）</div>
          <textarea style={{...ta,minHeight:220}} value={editBody} onChange={e=>setEditBody(e.target.value)} />
        </div>
        {sent && <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"9px 13px",marginBottom:14,fontSize:13,color:"#15803d",fontWeight:700}}>✓ メールアプリが開きました。</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>閉じる</button>
          {!noEmail && selectedEmails.length>0 && (
            <button onClick={()=>{openMailto({subject:editSubject,body:editBody,to});setSent(true);}} style={{background:sent?"#22c55e":"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"9px 22px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",minWidth:140}}>
              {sent?"✓ 起動済み":"📨 メールアプリで開く"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── メール送信確認（送る？送らない？）──
function MailConfirmModal({ task, type, onSend, onSkip }) {
  const TYPE_LABELS = { new:"新規作成通知", relay:"引継ぎ依頼", status:"ステータス変更通知", complete:"完了報告" };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:180,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(3px)"}}>
      <div style={{background:"white",borderRadius:18,padding:"26px 28px",maxWidth:380,width:"90%",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:10}}>✉️</div>
        <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:8}}>メールを送りますか？</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:22}}>
          「{task.title}」の<br/>
          <strong style={{color:"#0f172a"}}>{TYPE_LABELS[type]}</strong>を送信できます。
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onSkip} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>送らない</button>
          <button onClick={onSend} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>✉️ 送る</button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ initial, requesters, assignees, onSave, onClose }) {
  const isEdit = !!initial;
  const prevAssignee = initial?.assignee || "";
  const [form, setForm] = useState(initial ? {...initial} : { title:"", descs:[], customDesc:"", requester:"", assignee:"", priority:"中", status:"未着手", due:"", memo:"", archived:false });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleDesc = d => set("descs", form.descs.includes(d)?form.descs.filter(x=>x!==d):[...form.descs,d]);
  const canSave = form.title.trim().length > 0;
  const assigneeChanged = isEdit && prevAssignee !== form.assignee;
  const inp = {padding:"9px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,color:"#1e293b",outline:"none",fontFamily:"inherit",background:"#f8fafc",width:"100%",boxSizing:"border-box"};
  const lbl = {fontSize:11,fontWeight:800,color:"#64748b",marginBottom:5,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:20,padding:28,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.18)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontWeight:900,fontSize:17,color:"#0f172a"}}>{isEdit?"タスクを編集":"新しいタスク"}</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{marginBottom:14}}><label style={lbl}>件名 *</label><input style={inp} value={form.title} onChange={e=>set("title",e.target.value)} placeholder="例：A棟2F平面図" /></div>
        <div style={{marginBottom:14}}>
          <label style={lbl}>図面種別 *（複数選択可）</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
            {DESC_PRESETS.map(d=>(
              <button key={d} onClick={()=>toggleDesc(d)} style={{padding:"5px 13px",borderRadius:20,border:"2px solid",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",borderColor:form.descs.includes(d)?"#4f46e5":"#e2e8f0",background:form.descs.includes(d)?"#eef2ff":"#f8fafc",color:form.descs.includes(d)?"#4f46e5":"#94a3b8"}}>
                {form.descs.includes(d)?"✓ ":""}{d}
              </button>
            ))}
          </div>
          <input style={inp} value={form.customDesc} onChange={e=>set("customDesc",e.target.value)} placeholder="その他・備考を自由入力..." />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={lbl}>依頼者</label><select style={inp} value={form.requester} onChange={e=>set("requester",e.target.value)}><option value="">―</option>{requesters.map(r=><option key={r}>{r}</option>)}</select></div>
          <div><label style={lbl}>対応者</label><select style={inp} value={form.assignee} onChange={e=>set("assignee",e.target.value)}><option value="">未定</option>{assignees.map(a=><option key={a}>{a}</option>)}</select></div>
        </div>
        {assigneeChanged && (
          <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#92400e",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0}}>🔁</span>
            <div><div style={{fontWeight:800,marginBottom:2}}>対応者が変わります（引継ぎ）</div><div style={{fontSize:12}}>{prevAssignee||"未定"} → {form.assignee||"未定"}　保存後に引継ぎメールを送れます。</div></div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={lbl}>優先度</label><select style={inp} value={form.priority} onChange={e=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={lbl}>ステータス</label><select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={lbl}>期日</label><input type="date" style={inp} value={form.due} onChange={e=>set("due",e.target.value)} /></div>
        </div>
        {form.status==="作成・修正中" && (
          <div style={{marginBottom:14}}>
            <label style={{...lbl,color:assigneeChanged?"#b45309":"#64748b"}}>{assigneeChanged?"🔁 引継ぎメモ（次の対応者へ）":"作業メモ"}</label>
            <textarea style={{...inp,minHeight:72,resize:"vertical"}} value={form.memo} onChange={e=>set("memo",e.target.value)} placeholder="例：2ページまで完了。△△の修正が残っています。" />
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"10px 20px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={()=>canSave&&onSave(form)} style={{background:canSave?"linear-gradient(135deg,#3b82f6,#6366f1)":"#cbd5e1",color:"white",border:"none",borderRadius:10,padding:"10px 24px",cursor:canSave?"pointer":"default",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>保存する</button>
        </div>
      </div>
    </div>
  );
}

// ── 引継ぎ専用モーダル ──
function RelayModal({ task, assignees, onRelay, onContinue, onClose }) {
  const [myself, setMyself] = useState("");
  const [memo, setMemo] = useState(task.memo||"");
  const inp = {padding:"9px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,color:"#1e293b",outline:"none",fontFamily:"inherit",background:"#f8fafc",width:"100%",boxSizing:"border-box"};
  const lbl = {fontSize:11,fontWeight:800,color:"#64748b",marginBottom:5,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:20,padding:28,width:"100%",maxWidth:480,boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontWeight:900,fontSize:17,color:"#0f172a"}}>🔁 引継ぎ</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#92400e"}}>
          現在の対応：<strong>{task.assignee||"未定"}</strong>
        </div>

        <div style={{marginBottom:14}}>
          <label style={lbl}>自分の名前 *</label>
          <select style={inp} value={myself} onChange={e=>setMyself(e.target.value)}>
            <option value="">選択してください</option>
            {assignees.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{marginBottom:20}}>
          <label style={lbl}>ここまで完了しました（メール本文に入ります）</label>
          <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例：108号室の白図まで完了。209号室からお願いします。" />
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={()=>myself&&onContinue(myself,memo)}
            style={{background:myself?"linear-gradient(135deg,#22c55e,#16a34a)":"#cbd5e1",color:"white",border:"none",borderRadius:10,padding:"10px 18px",cursor:myself?"pointer":"default",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
            ✅ 引き続き作業します
          </button>
          <button onClick={()=>myself&&onRelay(myself,memo)}
            style={{background:myself?"linear-gradient(135deg,#f97316,#ea580c)":"#cbd5e1",color:"white",border:"none",borderRadius:10,padding:"10px 18px",cursor:myself?"pointer":"default",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
            📨 引継ぎをお願いします
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, assignees, onDoubleClick, onDeleteClick, onStatusChange, onMailClick, onRelayClick }) {
  const sm = STATUS_META[task.status];
  const pm = PRIORITY_META[task.priority];
  const isOverdue = task.status!=="完了" && task.due && new Date(task.due)<new Date();
  const allDescs = [...task.descs,...(task.customDesc?[task.customDesc]:[])];
  return (
    <div onDoubleClick={()=>onDoubleClick(task)}
      style={{background:"white",borderRadius:14,padding:"13px 15px",border:`1px solid ${sm.border}`,marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",cursor:"pointer",transition:"box-shadow 0.2s,transform 0.15s",userSelect:"none"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.10)";e.currentTarget.style.transform="translateY(-1px)"}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.04)";e.currentTarget.style.transform=""}}
      title="ダブルクリックで編集">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{fontWeight:800,fontSize:14,color:"#0f172a",lineHeight:1.4,flex:1}}>{task.title}</div>
        <div style={{display:"flex",gap:2,flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onMailClick(task,task.status==="完了"?"complete":task.status==="作成・修正中"?"relay":"new");}} style={{background:"none",border:"none",cursor:"pointer",color:"#cbd5e1",fontSize:13,padding:"2px 3px",borderRadius:5,lineHeight:1,transition:"color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.color="#3b82f6"} onMouseLeave={e=>e.currentTarget.style.color="#cbd5e1"} title="メールを送る">✉️</button>
          <button onClick={e=>{e.stopPropagation();onDeleteClick(task);}} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:14,padding:"2px 4px",borderRadius:6,lineHeight:1,transition:"color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"} title="削除">✕</button>
        </div>
      </div>
      {allDescs.length>0 && <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>{allDescs.map((d,i)=><Chip key={i} label={d} />)}</div>}
      {task.memo && task.status==="作成・修正中" && <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"6px 10px",fontSize:12,color:"#92400e",marginBottom:8,lineHeight:1.5}}>📝 {task.memo}</div>}
      {task.relayedFrom && <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#0369a1",marginBottom:8}}>🔁 {task.relayedFrom} → {task.assignee||"未定"}{task.relayedAt?` （${task.relayedAt}）`:""}</div>}
      {task.relayHistory && task.relayHistory.length > 0 && (
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#64748b",marginBottom:8}}>
          <div style={{fontWeight:800,marginBottom:6,color:"#475569"}}>📋 引継ぎ履歴</div>
          {task.relayHistory.map((h,i)=>(
            <div key={i} style={{background:"white",border:"1px solid #e2e8f0",borderRadius:6,padding:"6px 10px",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{fontWeight:800,color:"#0f172a"}}>{h.from}</span>
                <span style={{color:"#94a3b8"}}>→</span>
                <span style={{fontWeight:800,color:"#0f172a"}}>{h.to}</span>
                <span style={{marginLeft:"auto",color:"#94a3b8",fontSize:10}}>{h.at}</span>
              </div>
              {h.memo && <div style={{color:"#64748b",fontSize:11,marginTop:2}}>💬 {h.memo}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6,marginBottom:9}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <Avatar name={task.assignee} assignees={assignees} size={24} />
          <span style={{fontSize:12,color:"#0f172a",fontWeight:800}}>{task.assignee||"未定"}</span>
          {task.requester && <span style={{fontSize:11,color:"#94a3b8"}}>← {task.requester}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,fontWeight:800,color:pm.color,background:pm.bg,padding:"2px 8px",borderRadius:20}}>{task.priority}</span>
          {task.due && <span style={{fontSize:11,color:isOverdue?"#ef4444":"#94a3b8",fontWeight:isOverdue?800:400}}>{isOverdue?"⚠️ ":""}{task.due}</span>}
        </div>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
        {STATUSES.map(s=>(
          <button key={s} onClick={e=>{e.stopPropagation();onStatusChange(task.id,s);}} style={{fontSize:11,padding:"3px 10px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontFamily:"inherit",transition:"all 0.15s",background:task.status===s?STATUS_META[s].bg:"#f8fafc",color:task.status===s?STATUS_META[s].text:"#94a3b8",outline:task.status===s?`2px solid ${STATUS_META[s].dot}`:"none"}}>{s}</button>
        ))}
        {task.status==="作成・修正中" && (
          <button onClick={e=>{e.stopPropagation();onRelayClick(task);}} style={{marginLeft:"auto",fontSize:11,padding:"3px 11px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontFamily:"inherit",background:"#fff7ed",color:"#ea580c",outline:"1px solid #fed7aa"}} onMouseEnter={e=>e.currentTarget.style.background="#ffedd5"} onMouseLeave={e=>e.currentTarget.style.background="#fff7ed"}>🔁 引継ぎ</button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [requesters, setRequesters] = useState(INIT_REQUESTERS);
  const [assignees,  setAssignees]  = useState(INIT_ASSIGNEES);
  const [emails,     setEmails]     = useState(INIT_EMAILS);
  const [signature,  setSignature]  = useState("");

  const [showModal,         setShowModal]         = useState(false);
  const [editTask,          setEditTask]           = useState(null);
  const [delTarget,         setDelTarget]          = useState(null);
  const [masterModal,       setMasterModal]        = useState(null);
  const [showEmailSettings, setShowEmailSettings]  = useState(false);
  const [pendingMail,       setPendingMail]        = useState(null);
  const [mailConfirm,       setMailConfirm]        = useState(null);
  const [relayTarget,       setRelayTarget]        = useState(null);

  const [tab,    setTab]    = useState("board");
  const [fa,     setFa]     = useState("すべて");
  const [fr,     setFr]     = useState("すべて");
  const [fp,     setFp]     = useState("すべて");
  const [fs,     setFs]     = useState("すべて");
  const [search, setSearch] = useState("");

  // ── Supabaseからデータ取得 ──
  useEffect(() => {
    fetchTasks();
    // リアルタイム購読（再接続対応）
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setTimeout(() => fetchTasks(), 3000);
        }
      });
    // 30秒ごとに自動更新（フォールバック）
    const interval = setInterval(fetchTasks, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  async function fetchTasks() {
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: true });
    if (!error && data) setTasks(data.map(rowToTask));
    setLoading(false);
  }

  const active   = tasks.filter(t=>!t.archived);
  const archived = tasks.filter(t=>t.archived);

  const filtered = sortTasks(active.filter(t=>{
    if(fa!=="すべて" && t.assignee!==fa)    return false;
    if(fr!=="すべて" && t.requester!==fr)   return false;
    if(fp!=="すべて" && t.priority!==fp)    return false;
    if(search && !t.title.includes(search)) return false;
    return true;
  }));

  const stats = {
    notStarted: active.filter(t=>t.status==="未着手").length,
    wip:        active.filter(t=>t.status==="作成・修正中").length,
    done:       active.filter(t=>t.status==="完了").length,
    overdue:    active.filter(t=>t.status!=="完了"&&t.due&&new Date(t.due)<new Date()).length,
  };
  const emailCount = Object.values(emails).filter(e=>e&&e.includes("@")).length;

  const handleStatClick = fval => {
    if(fval==="archive"){setTab("archive");return;}
    setTab("board"); setFs(fval);
  };

  const handleSave = async (form) => {
    const isNew = !editTask;
    const prevTask = editTask;
    if (isNew) {
      await supabase.from('tasks').insert([taskToRow(form)]).select().single();
    } else {
      const updatedForm = prevTask.assignee !== form.assignee
        ? { ...form, relayedFrom: prevTask.assignee || "未定" }
        : form;
      await supabase.from('tasks').update(taskToRow(updatedForm)).eq('id', editTask.id);
    }
    setShowModal(false); setEditTask(null);
  };

  const openEdit = task => { setEditTask(task); setShowModal(true); };

  const handleStatus = async (id, s) => {
    await supabase.from('tasks').update({ status: s }).eq('id', id);
  };

  const doDelete = async () => {
    if (delTarget) await supabase.from('tasks').delete().eq('id', delTarget.id);
    setDelTarget(null);
  };

  const archive = async (id) => {
    await supabase.from('tasks').update({ archived: true, status: "完了" }).eq('id', id);
  };

  const restore = async (id) => {
    await supabase.from('tasks').update({ archived: false }).eq('id', id);
  };

  const handleRelay = async (myself, memo) => {
    if (!relayTarget) return;
    const now = nowStr();
    const from = relayTarget.assignee || "未定";
    const { error } = await supabase.from('tasks').update({
      assignee: myself,
      memo: memo,
      relayed_from: from,
      relayed_at: now,
    }).eq('id', relayTarget.id);
    if (error) console.error('relay error:', error);
    const updated = {...relayTarget, assignee: myself, memo, relayedFrom: from, relayedAt: now};
    setPendingMail({ task: updated, type: "relay" });
    setRelayTarget(null);
  };

  const handleContinue = async (myself, memo) => {
    if (!relayTarget) return;
    const now = nowStr();
    const from = relayTarget.assignee || "未定";
    const prevHistory = Array.isArray(relayTarget.relayHistory) ? relayTarget.relayHistory : [];
    const newHistory = [...prevHistory, { from, to: myself, at: now, memo }];
    const { error } = await supabase.from('tasks').update({
      assignee: myself,
      memo: memo,
      relayed_from: from,
      relayed_at: now,
      relay_history: newHistory,
    }).eq('id', relayTarget.id);
    if (error) console.error('continue error:', error);
    setRelayTarget(null);
  };

  const tabBtn = (label, mode, badge) => (
    <button onClick={()=>setTab(mode)} style={{background:tab===mode?"#0f172a":"transparent",color:tab===mode?"white":"#64748b",border:"none",borderRadius:8,padding:"7px 15px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
      {label}{badge!=null && <span style={{background:tab===mode?"#ffffff30":"#e2e8f0",color:tab===mode?"white":"#94a3b8",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:800}}>{badge}</span>}
    </button>
  );
  const fBtn = (label, cur, val, setter) => (
    <button onClick={()=>setter(val)} style={{background:cur===val?"#0ea5e9":"#f1f5f9",color:cur===val?"white":"#64748b",border:"none",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit",transition:"all 0.15s"}}>{label||"未定"}</button>
  );
  const inp = {padding:"8px 13px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,outline:"none",color:"#1e293b",background:"#f8fafc",fontFamily:"inherit"};

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f4f8",fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:16}}>📐</div>
        <div style={{fontSize:16,color:"#64748b",fontWeight:700}}>読み込み中...</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8",fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif"}}>
      <div style={{background:"#0f172a",padding:"0 28px"}}>
        <div style={{maxWidth:1300,margin:"0 auto",display:"flex",alignItems:"center",height:54,gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
            <div style={{width:30,height:30,background:"linear-gradient(135deg,#38bdf8,#818cf8)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📐</div>
            <span style={{fontWeight:900,fontSize:18,color:"white",letterSpacing:-0.5}}>図面タスク管理</span>
          </div>
          <button onClick={()=>setShowEmailSettings(true)} style={{display:"flex",alignItems:"center",gap:6,background:emailCount>0?"#1e3a5f":"#1e293b",color:emailCount>0?"#7dd3fc":"#64748b",border:`1px solid ${emailCount>0?"#2d6a9f":"#334155"}`,borderRadius:10,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
            📧 メール設定
            {emailCount>0 ? <span style={{background:"#22c55e",color:"white",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:900}}>{emailCount}名</span> : <span style={{background:"#ef4444",color:"white",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:900}}>未設定</span>}
          </button>
        </div>
      </div>

      <div style={{maxWidth:1300,margin:"0 auto",padding:"20px 28px"}}>
        {/* 統計カード */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
          {[
            {label:"未着手",val:stats.notStarted,icon:"📋",color:"#64748b",bg:"#f1f5f9",fval:"未着手"},
            {label:"作成・修正中",val:stats.wip,icon:"⚡",color:"#ea580c",bg:"#fff7ed",fval:"作成・修正中"},
            {label:"完了",val:stats.done,icon:"✅",color:"#16a34a",bg:"#f0fdf4",fval:"完了"},
            {label:"期日超過",val:stats.overdue,icon:"⚠️",color:"#ef4444",bg:"#fef2f2",fval:null},
            {label:"アーカイブ",val:archived.length,icon:"📦",color:"#8b5cf6",bg:"#f5f3ff",fval:"archive"},
          ].map((s,i)=>(
            <div key={i} onClick={()=>s.fval&&handleStatClick(s.fval)}
              style={{background:"white",borderRadius:12,padding:"13px 16px",border:(tab==="board"&&s.fval&&s.fval!=="archive"&&fs===s.fval)||(tab==="archive"&&s.fval==="archive")?"2px solid "+s.color:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:11,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",cursor:s.fval?"pointer":"default",transition:"all 0.15s"}}
              onMouseEnter={e=>{if(s.fval){e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)";e.currentTarget.style.transform="translateY(-1px)"}}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)";e.currentTarget.style.transform=""}}>
              <div style={{width:38,height:38,background:s.bg,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</div>
              <div>
                <div style={{fontSize:20,fontWeight:900,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginTop:2}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ツールバー */}
        <div style={{background:"white",borderRadius:14,padding:"11px 15px",border:"1px solid #e2e8f0",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",gap:2,background:"#f8fafc",borderRadius:10,padding:3}}>
            {tabBtn("ボード","board")}
            {tabBtn("リスト","list")}
            {tabBtn("アーカイブ","archive",archived.length)}
          </div>
          <input style={{...inp,flex:1,minWidth:160}} placeholder="🔍 件名で検索..." value={search} onChange={e=>setSearch(e.target.value)} />
          <button onClick={()=>setMasterModal("requester")} style={{background:"#f8fafc",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 13px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>依頼者 ⚙️</button>
          <button onClick={()=>setMasterModal("assignee")}  style={{background:"#f8fafc",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 13px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>対応者 ⚙️</button>
          <button onClick={()=>{setEditTask(null);setShowModal(true);}} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"9px 18px",cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:"inherit"}}>＋ 新規タスク</button>
        </div>

        {/* フィルター */}
        {tab!=="archive" && (
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,color:"#94a3b8",fontWeight:800}}>対応：</span>{fBtn("すべて",fa,"すべて",setFa)}{assignees.map(a=>fBtn(a,fa,a,setFa))}
            <span style={{fontSize:11,color:"#94a3b8",fontWeight:800,marginLeft:8}}>優先度：</span>{fBtn("すべて",fp,"すべて",setFp)}{PRIORITIES.map(p=>fBtn(p,fp,p,setFp))}
            <span style={{fontSize:11,color:"#94a3b8",fontWeight:800,marginLeft:8}}>依頼者：</span>{fBtn("すべて",fr,"すべて",setFr)}{requesters.map(r=>fBtn(r,fr,r,setFr))}
          </div>
        )}

        {/* ボード */}
        {tab==="board" && (
          <>
          {fs!=="すべて" && (
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"9px 16px",background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10}}>
              <span style={{fontSize:13,color:"#1d4ed8",fontWeight:700}}>🔍 「{fs}」で絞り込み中</span>
              <button onClick={()=>setFs("すべて")} style={{marginLeft:"auto",background:"#1d4ed8",color:"white",border:"none",borderRadius:8,padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>✕ 全表示に戻る</button>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:fs==="すべて"?"repeat(3,1fr)":"1fr",gap:16}}>
            {STATUSES.filter(s=>fs==="すべて"||s===fs).map(status=>{
              const col = filtered.filter(t=>t.status===status);
              return (
                <div key={status}>
                  {col.map(t=>(
                    <TaskCard key={t.id} task={t} assignees={assignees} onDoubleClick={openEdit} onDeleteClick={setDelTarget} onStatusChange={handleStatus} onMailClick={(task,type)=>setPendingMail({task,type})} onRelayClick={setRelayTarget} />
                  ))}
                  {col.length===0 && <div style={{textAlign:"center",color:"#cbd5e1",fontSize:12,padding:"20px 0",background:"white",borderRadius:12,border:"1px dashed #e2e8f0"}}>タスクなし</div>}
                  {status==="完了" && col.length>0 && (
                    <div style={{marginTop:6,textAlign:"center"}}>
                      <button onClick={()=>col.forEach(t=>archive(t.id))} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>📦 完了タスクをアーカイブ</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* リスト */}
        {tab==="list" && (
          <div style={{background:"white",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.6fr 0.9fr 0.7fr 70px 100px 90px 100px",padding:"10px 16px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",fontSize:11,fontWeight:800,color:"#94a3b8"}}>
              <span>件名 / 図面種別</span><span>依頼者</span><span>対応</span><span>優先度</span><span>ステータス</span><span>期日</span><span>操作</span>
            </div>
            {filtered.length===0 && <div style={{textAlign:"center",padding:40,color:"#cbd5e1",fontSize:13}}>タスクが見つかりません</div>}
            {filtered.map((t,i)=>{
              const sm=STATUS_META[t.status], pm=PRIORITY_META[t.priority];
              const isOverdue=t.status!=="完了"&&t.due&&new Date(t.due)<new Date();
              const allDescs=[...t.descs,...(t.customDesc?[t.customDesc]:[])];
              return (
                <div key={t.id} onDoubleClick={()=>openEdit(t)}
                  style={{display:"grid",gridTemplateColumns:"1.6fr 0.9fr 0.7fr 70px 100px 90px 100px",padding:"11px 16px",borderBottom:i<filtered.length-1?"1px solid #f1f5f9":"none",alignItems:"center",cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="transparent"} title="ダブルクリックで編集">
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{t.title}</div>
                    <div style={{display:"flex",gap:3,marginTop:3,flexWrap:"wrap"}}>{allDescs.map((d,j)=><Chip key={j} label={d} />)}</div>
                    {t.memo&&t.status==="作成・修正中"&&<div style={{fontSize:11,color:"#92400e",background:"#fff7ed",borderRadius:6,padding:"2px 7px",marginTop:4,display:"inline-block"}}>📝 {t.memo.slice(0,32)}{t.memo.length>32?"…":""}</div>}
                  </div>
                  <span style={{fontSize:12,color:"#475569"}}>{t.requester}</span>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><Avatar name={t.assignee} assignees={assignees} size={22} /><span style={{fontSize:12,fontWeight:800,color:"#0f172a"}}>{t.assignee||"未定"}</span></div>
                  <span style={{fontSize:12,fontWeight:800,color:pm.color}}>{t.priority}</span>
                  <span style={{fontSize:11,fontWeight:700,color:sm.text,background:sm.bg,padding:"3px 8px",borderRadius:20,display:"inline-block",whiteSpace:"nowrap"}}>{t.status}</span>
                  <span style={{fontSize:12,color:isOverdue?"#ef4444":"#94a3b8",fontWeight:isOverdue?800:400}}>{isOverdue?"⚠️ ":""}{t.due}</span>
                  <div style={{display:"flex",gap:3}}>
                    <button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{background:"#eff6ff",border:"none",borderRadius:7,width:28,height:27,cursor:"pointer",fontSize:12,color:"#3b82f6"}} title="編集">✏️</button>
                    <button onClick={e=>{e.stopPropagation();setPendingMail({task:t,type:t.status==="完了"?"complete":t.status==="作成・修正中"?"relay":"new"});}} style={{background:"#f0f9ff",border:"none",borderRadius:7,width:28,height:27,cursor:"pointer",fontSize:12,color:"#0ea5e9"}} title="メール">✉️</button>
                    <button onClick={e=>{e.stopPropagation();archive(t.id);}} style={{background:"#f0fdf4",border:"none",borderRadius:7,width:28,height:27,cursor:"pointer",fontSize:12,color:"#16a34a"}} title="アーカイブ">📦</button>
                    <button onClick={e=>{e.stopPropagation();setDelTarget(t);}} style={{background:"#fef2f2",border:"none",borderRadius:7,width:28,height:27,cursor:"pointer",fontSize:12,color:"#ef4444"}} title="削除">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* アーカイブ */}
        {tab==="archive" && (
          <div style={{background:"white",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"13px 18px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>📦</span><span style={{fontWeight:800,fontSize:14,color:"#475569"}}>アーカイブ済み</span>
              <span style={{marginLeft:"auto",fontSize:12,color:"#94a3b8"}}>{archived.length}件</span>
            </div>
            {archived.length===0 && <div style={{textAlign:"center",padding:40,color:"#cbd5e1",fontSize:13}}>アーカイブはありません</div>}
            {archived.map((t,i)=>{
              const allDescs=[...t.descs,...(t.customDesc?[t.customDesc]:[])];
              return (
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:i<archived.length-1?"1px solid #f1f5f9":"none",transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                  <Avatar name={t.assignee} assignees={assignees} size={26} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#475569"}}>{t.title}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{allDescs.join("・")}{t.requester?" ← "+t.requester:""}</div>
                  </div>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{t.due}</span>
                  <button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{background:"#eff6ff",color:"#3b82f6",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:13}}>✏️</button>
                  <button onClick={()=>restore(t.id)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>復元</button>
                  <button onClick={()=>setDelTarget(t)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>削除</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal         && <TaskModal initial={editTask} requesters={requesters} assignees={assignees} onSave={handleSave} onClose={()=>{setShowModal(false);setEditTask(null);}} />}
      {delTarget         && <DeleteConfirm task={delTarget} onConfirm={doDelete} onCancel={()=>setDelTarget(null)} />}
      {relayTarget       && <RelayModal task={relayTarget} assignees={assignees} onRelay={handleRelay} onContinue={handleContinue} onClose={()=>setRelayTarget(null)} />}
      {mailConfirm       && <MailConfirmModal task={mailConfirm.task} type={mailConfirm.type} onSend={()=>{setPendingMail(mailConfirm);setMailConfirm(null);}} onSkip={()=>setMailConfirm(null)} />}
      {pendingMail       && <SendConfirmModal task={pendingMail.task} type={pendingMail.type} emails={emails} signature={signature} onClose={()=>setPendingMail(null)} />}
      {showEmailSettings && <EmailSettingsModal requesters={requesters} assignees={assignees} emails={emails} signature={signature} onSave={setEmails} onSaveSignature={setSignature} onClose={()=>setShowEmailSettings(false)} />}
      {masterModal==="requester" && <MasterModal title="依頼者" items={requesters} onAdd={v=>setRequesters(r=>[...r,v])} onRemove={v=>setRequesters(r=>r.filter(x=>x!==v))} onClose={()=>setMasterModal(null)} />}
      {masterModal==="assignee"  && <MasterModal title="対応者" items={assignees} onAdd={v=>setAssignees(a=>[...a,v])} onRemove={v=>setAssignees(a=>a.filter(x=>x!==v))} onClose={()=>setMasterModal(null)} />}
    </div>
  );
}
