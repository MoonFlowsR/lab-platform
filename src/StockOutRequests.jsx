import { useState } from 'react';
import RecentRecords from './RecentRecords.jsx';
import RecordActions from './RecordActions.jsx';
import './stock-out-requests.css';
export default function StockOutRequests({ rows = [], currentUser, attachments = [], onReview, onComplete, onWithdraw, onDelete, onDownload, onExport, styles, formatDate, Badge }) {
  const [busy,setBusy] = useState('');
  const ongoing = rows.filter(row => ['待采购人审批','已同意待出库'].includes(row.status));
  const history = rows.filter(row => !['待采购人审批','已同意待出库'].includes(row.status));
  const operate = async (row,callback) => { if (busy) return; setBusy(row._id); try { await callback?.(); } finally { setBusy(''); } };
  const card = row => {
    const mine = row.applicant_username === currentUser?.username, reviewer = row.purchaser_username === currentUser?.username, photo = attachments.find(file => String(file._id) === String(row.photo_attachment_id));
    const canWithdraw = mine && ['待采购人审批','已同意待出库','已驳回'].includes(row.status);
    return <article key={row._id} className="platform-stock-request" aria-label={`出库申请 ${row.public_id}`}>
      <div className="platform-stock-request-heading"><div><h3 style={styles.h3}>{row.material_name}</h3><p style={styles.meta}>{row.public_id} · 申请人：<strong className="platform-identity">{row.applicant_name}</strong> · 采购人：<strong className="platform-identity">{row.purchaser_name}</strong> · {formatDate(row.created_at)}</p></div><Badge text={row.status} /></div>
      <dl className="platform-stock-request-grid">{[['批次',row.batch_code],['申请数量',`${row.quantity} ${row.unit}`],['责任教师',row.responsible_teacher_name || '未填写'],['指导教师',row.guiding_teacher_name || '未填写'],['登记地点',row.storage_location],['用途 / 备注',row.usage_reason || '—']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {row.reviewed_at && <p style={styles.meta}>审批人：<strong className="platform-identity">{row.reviewed_by}</strong> · {formatDate(row.reviewed_at)}{row.review_note && <> · 意见：{row.review_note}</>}</p>}
      {row.completed_at && <p style={styles.meta}>出库完成：{formatDate(row.completed_at)} · {row.transaction_public_id}</p>}
      {mine && row.status === '已同意待出库' && <p className="platform-stock-request-note">采购人已同意。完成出库登记后才扣减库存。</p>}
      <RecordActions dangerous={(canWithdraw || currentUser?.account_type === 'admin') && <>{canWithdraw && <button type="button" disabled={Boolean(busy)} style={styles.warningButton} onClick={()=>operate(row,()=>onWithdraw(row))}>撤回出库申请</button>}{currentUser?.account_type === 'admin' && <button type="button" disabled={Boolean(busy)} style={styles.dangerButton} onClick={()=>onDelete?.('lab_stock_out_requests',row)}>永久删除申请</button>}</>}>
        {photo && <button type="button" style={styles.lightButton} onClick={()=>onDownload?.(photo)}>物品特写</button>}
        {reviewer && row.status === '待采购人审批' && <><button type="button" disabled={Boolean(busy)} style={styles.successButton} onClick={()=>operate(row,()=>onReview(row,'同意'))}>同意出库</button><button type="button" disabled={Boolean(busy)} style={styles.dangerButton} onClick={()=>operate(row,()=>onReview(row,'驳回'))}>驳回出库</button></>}
        {mine && currentUser?.account_type === 'student' && row.status === '已同意待出库' && <button type="button" disabled={Boolean(busy)} style={styles.successButton} onClick={()=>operate(row,()=>onComplete(row))}>{busy===row._id ? '处理中…' : '完成出库登记'}</button>}
      </RecordActions>
    </article>;
  };
  return <>
    <section className="platform-section-pending" style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>私用/项目用物品出库申请（{ongoing.length}）</h2><button type="button" style={styles.secondaryButton} onClick={()=>onExport?.(rows)}>导出出库申请CSV</button></div><p style={styles.muted}>采购人审批 → 申请人完成出库。提交和同意均不扣库存。</p>{ongoing.length ? <RecentRecords rows={ongoing}>{shown => shown.map(card)}</RecentRecords> : <p style={styles.muted}>当前范围暂无待处理出库申请。</p>}</section>
    {history.length>0 && <section style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>出库申请历史（{history.length}）</h2></div><RecentRecords rows={history}>{shown => shown.map(card)}</RecentRecords></section>}
  </>;
}
