import ExportButton from '../../shared/components/ExportButton.jsx';
import { useEffect, useState } from 'react';
import { apiPost } from '../../app/api.js';
import { styles } from '../../app/styles.js';
import { formatDate } from '../../app/formatters.js';
import { accountTypeLabels } from '../../app/config.js';
import { actionName, clientName } from '../../shared/lib/audit-labels.js';
import { downloadTable } from '../../shared/lib/table-export.js';
import { DataTable } from '../../shared/components/ui.jsx';
const PAGE_SIZE = 10;
export default function AuditLog({account,student,teacher,range,query,revision}) {
 const [offset,setOffset]=useState(0),[result,setResult]=useState({rows:[],total:0}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const filter=JSON.stringify({student,teacher,range,query});
 useEffect(()=>{setOffset(0);},[filter]);
 useEffect(()=>{const abort=new AbortController();const timer=setTimeout(async()=>{setBusy(true);setError('');try{const data=await apiPost('ops/listAudit',{...JSON.parse(filter),offset,limit:PAGE_SIZE},account.session_token,{signal:abort.signal});if(!abort.signal.aborted){setResult(data);const lastOffset=Math.max(0,Math.ceil(data.total/PAGE_SIZE)-1)*PAGE_SIZE;if(offset>lastOffset)setOffset(lastOffset);}}catch(e){if(!abort.signal.aborted)setError(e.message);}finally{if(!abort.signal.aborted)setBusy(false);}},180);return()=>{clearTimeout(timer);abort.abort();};},[filter,offset,account.session_token,revision]);
 async function exportLogs(){setBusy(true);try{const data=await apiPost('ops/listAudit',{...JSON.parse(filter),all:true},account.session_token);await downloadTable('audit',data.rows);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section style={styles.card} aria-label="最近操作日志">
  <div style={styles.cardHeader}><h2 style={styles.h2}>最近操作日志</h2><ExportButton subject="日志" disabled={busy} onExport={exportLogs} /></div>
  <p><a href="/help#comment-audit">帮助评论操作记录</a></p>
  {error&&<p role="alert" style={styles.warningBox}>{error}</p>}
  {busy&&<p role="status" style={styles.muted}>正在读取日志…</p>}
  <DataTable mobileColumns={['时间','操作人','操作端','动作','对象']} columns={['时间','操作人','操作端','身份','动作','对象','IP']} rows={result.rows.map(row=>[formatDate(row.created_at),row.operator_username,row.client_label||clientName(row.client_type),accountTypeLabels[row.operator_role]||(row.operator_role==='system'?'系统维护':row.operator_role),actionName(row.action),row.object_label,row.ip_address||'—'])}/>
  {result.total>0&&<div className="platform-report-pagination" aria-label="日志翻页" style={{marginTop:10}}>
   <span>第 {Math.floor(offset/PAGE_SIZE)+1} / {Math.ceil(result.total/PAGE_SIZE)} 页，共 {result.total} 条，每页 {PAGE_SIZE} 条</span>
   <div><button disabled={offset===0||busy} onClick={()=>{setBusy(true);setOffset(Math.max(0,offset-PAGE_SIZE));}}>上一页</button><button disabled={offset+PAGE_SIZE>=result.total||busy} onClick={()=>{setBusy(true);setOffset(offset+PAGE_SIZE);}}>下一页</button></div>
  </div>}
 </section>;
}
