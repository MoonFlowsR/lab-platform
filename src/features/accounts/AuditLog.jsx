import ExportButton from '../../shared/components/ExportButton.jsx';
import { useEffect, useState } from 'react';
import { apiPost } from '../../app/api.js';
import { styles } from '../../app/styles.js';
import { formatDate } from '../../app/formatters.js';
import { accountTypeLabels } from '../../app/config.js';
import { actionName, clientName } from '../../shared/lib/audit-labels.js';
import { downloadTable } from '../../shared/lib/table-export.js';
import { DataTable } from '../../shared/components/ui.jsx';
export default function AuditLog({account,student,teacher,range,query,revision}) {
 const [expanded,setExpanded]=useState(false),[offset,setOffset]=useState(0),[result,setResult]=useState({rows:[],total:0}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const filter=JSON.stringify({student,teacher,range,query});
 useEffect(()=>{setOffset(0);},[filter]);
 useEffect(()=>{const abort=new AbortController();const timer=setTimeout(async()=>{setBusy(true);setError('');try{const data=await apiPost('ops/listAudit',{...JSON.parse(filter),offset,limit:expanded?50:3},account.session_token,{signal:abort.signal});if(!abort.signal.aborted)setResult(data);}catch(e){if(!abort.signal.aborted)setError(e.message);}finally{if(!abort.signal.aborted)setBusy(false);}},180);return()=>{clearTimeout(timer);abort.abort();};},[filter,offset,expanded,account.session_token,revision]);
 async function exportLogs(){setBusy(true);try{const data=await apiPost('ops/listAudit',{...JSON.parse(filter),all:true},account.session_token);await downloadTable('audit',data.rows);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section style={styles.card} aria-label="最近操作日志"><div style={styles.cardHeader}><h2 style={styles.h2}>最近操作日志</h2><div style={styles.buttonRowCompact}><button style={styles.lightButton} onClick={()=>{setExpanded(!expanded);setOffset(0);}}>{expanded?'仅显示最近3条日志':('查看全部日志（'+result.total+'）')}</button><ExportButton subject="日志" disabled={busy} onExport={exportLogs} /></div></div><p><a href="/help#comment-audit">帮助评论操作记录</a></p>{error&&<p role="alert" style={styles.warningBox}>{error}</p>}{busy&&<p role="status" style={styles.muted}>正在读取日志…</p>}<DataTable mobileColumns={['时间','操作人','操作端','动作','对象']} columns={['时间','操作人','操作端','身份','动作','对象','IP']} rows={result.rows.map(row=>[formatDate(row.created_at),row.operator_username,row.client_label||clientName(row.client_type),accountTypeLabels[row.operator_role]||(row.operator_role==='system'?'系统维护':row.operator_role),actionName(row.action),row.object_label,row.ip_address||'—'])}/>{expanded&&result.total>50&&<div className="platform-report-pagination"><span>第 {Math.floor(offset/50)+1} / {Math.ceil(result.total/50)} 页，共 {result.total} 条</span><div><button disabled={offset===0||busy} onClick={()=>setOffset(Math.max(0,offset-50))}>上一页</button><button disabled={offset+50>=result.total||busy} onClick={()=>setOffset(offset+50)}>下一页</button></div></div>}</section>;
}
