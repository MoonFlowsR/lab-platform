import ExportButton from '../../shared/components/ExportButton.jsx';
import { useState } from 'react';
import RecentRecords from '../../shared/components/RecentRecords.jsx';
import RecordActions from '../../shared/components/RecordActions.jsx';
import { canCompleteStockRequest, stockApprovalExemptionText, stockRequestIsPurchaserSelf } from './stock-out-policy.js';
import { formatPublicNumber } from '../../shared/lib/public-number.js';
import './stock-out-requests.css';
export default function StockOutRequests({ rows = [], currentUser, batches = [], purchaseRequests = [], attachments = [], onReview, onComplete, onWithdraw, onDelete, onDownload, onExport, styles, formatDate, Badge }) {
  const [busy,setBusy] = useState('');
  const ongoing = rows.filter(row => ['待采购人审批','已同意待出库'].includes(row.status));
  const history = rows.filter(row => !['待采购人审批','已同意待出库'].includes(row.status));
  const operate = async (row,callback) => { if (busy) return; setBusy(row._id); try { await callback?.(); } finally { setBusy(''); } };
  const card = row => {
    const finance = currentUser?.account_type === 'finance';
    const mine = !finance && row.applicant_username === currentUser?.username, reviewer = !finance && row.purchaser_username === currentUser?.username, photo = attachments.find(file => String(file._id) === String(row.photo_attachment_id));
    const selfPurchase = stockRequestIsPurchaserSelf(row, batches, purchaseRequests);
    const canComplete = !finance && canCompleteStockRequest(row, currentUser, batches, purchaseRequests);
    const statusLabel = selfPurchase && row.status === '待采购人审批' ? '待出库登记' : row.status;
    const canWithdraw = mine && ['待采购人审批','已同意待出库','已驳回'].includes(row.status);
    return <article key={row._id} className="platform-stock-request" aria-label={`出库申请 ${formatPublicNumber(row.public_id)}`}>
      <div className="platform-stock-request-heading"><div><h3 style={styles.h3}>{row.material_name}</h3><p style={styles.meta}>{formatPublicNumber(row.public_id)} · 申请人：<strong className="platform-identity">{row.applicant_name}</strong> · {row.approval_delegated ? "受托审批人" : "采购人"}：<strong className="platform-identity">{row.purchaser_name}</strong> · {formatDate(row.created_at)}</p></div><Badge text={statusLabel} /></div>
      <dl className="platform-stock-request-grid">{[['批次',formatPublicNumber(row.batch_code)],['申请数量',`${row.quantity} ${row.unit}`],['登记地点',row.storage_location],['用途 / 备注',row.usage_reason || '—']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {row.reviewed_at && <p style={styles.meta}>审批人：<strong className="platform-identity">{row.reviewed_by}</strong> · {formatDate(row.reviewed_at)}{row.review_note && <> · 意见：{row.review_note}</>}</p>}
      {(stockApprovalExemptionText(row) || (selfPurchase && ['待采购人审批','已同意待出库'].includes(row.status))) && <p className="platform-stock-request-note">{stockApprovalExemptionText(row) || (row.approval_delegated ? '受托审批人本人，无需审批' : '采购人本人，无需审批')}。</p>}
      {row.completed_at && <p style={styles.meta}>出库完成：{formatDate(row.completed_at)} · {formatPublicNumber(row.transaction_public_id)}</p>}
      {mine && canComplete && <p className="platform-stock-request-note">{!selfPurchase && '采购人已同意。'}完成出库登记后才扣减库存。</p>}
      <RecordActions dangerous={(canWithdraw || currentUser?.account_type === 'admin') && <>{canWithdraw && <button type="button" disabled={Boolean(busy)} style={styles.warningButton} onClick={()=>operate(row,()=>onWithdraw(row))}>撤回出库申请</button>}{currentUser?.account_type === 'admin' && <button type="button" disabled={Boolean(busy)} style={styles.dangerButton} onClick={()=>onDelete?.('lab_stock_out_requests',row)}>永久删除申请</button>}</>}>
        {photo && <button type="button" style={styles.lightButton} onClick={()=>onDownload?.(photo)}>物品特写</button>}
        {reviewer && row.applicant_username !== row.purchaser_username && row.status === '待采购人审批' && <><button type="button" disabled={Boolean(busy)} style={styles.successButton} onClick={()=>operate(row,()=>onReview(row,'同意'))}>同意出库</button><button type="button" disabled={Boolean(busy)} style={styles.dangerButton} onClick={()=>operate(row,()=>onReview(row,'驳回'))}>驳回出库</button></>}
        {canComplete && <button type="button" disabled={Boolean(busy)} style={styles.successButton} onClick={()=>operate(row,()=>onComplete(row))}>{busy===row._id ? '处理中…' : '完成出库登记'}</button>}
      </RecordActions>
    </article>;
  };
  return <>
    <section className="platform-section-pending" style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>私用/项目用物品出库申请（{ongoing.length}）</h2><ExportButton subject="出库申请" onExport={()=>onExport?.(rows)} /></div><p style={styles.muted}>采购人本人可直接登记；其他人经采购人审批后完成出库。完成登记时扣减库存。</p>{ongoing.length ? <RecentRecords rows={ongoing}>{shown => shown.map(card)}</RecentRecords> : <p style={styles.muted}>当前范围暂无待处理出库申请。</p>}</section>
    {history.length>0 && <section style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>出库申请历史（{history.length}）</h2></div><RecentRecords rows={history}>{shown => shown.map(card)}</RecentRecords></section>}
  </>;
}
