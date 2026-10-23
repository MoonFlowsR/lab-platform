import PersonName from './PersonName.jsx';
import { formatDate } from '../../app/formatters.js';
import RecentRecords from './RecentRecords.jsx';

export default function SupplierChangeHistory({ row }) {
  const history = row.supplier_change_history || [];
  if (!history.length) return null;
  return <details className="platform-supplier-history">
    <summary>采购渠道修改记录（{history.length}）</summary>
    <RecentRecords rows={history}>{shown => shown.map(change => <div className="platform-supplier-change" key={change.id}>
      <p><span>修改前：{change.before || '未填写'}</span><strong>修改后：{change.after || '未填写'}</strong></p>
      <p><strong className="platform-identity"><PersonName value={change.operator_name || change.operator_username} /></strong><time>{formatDate(change.created_at)}</time></p>
      <p>原因：{change.reason}</p>
      {change.synced_at && <p className="platform-supplier-sync-note">补同步于 {formatDate(change.synced_at)}</p>}
    </div>)}</RecentRecords>
  </details>;
}
