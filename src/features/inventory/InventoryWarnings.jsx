import RecentRecords from '../../shared/components/RecentRecords.jsx';
import { expiryWarnings } from '../reports/report-data.js';
import { inventoryMetrics } from '../dashboard/dashboard-metrics.js';
import { InventoryMetrics } from '../dashboard/DashboardMetrics.jsx';

export default function InventoryWarnings({ batches, Table, cardStyle, renderPhoto }) {
  const expiry = new Map(expiryWarnings(batches).map(row => [row._id, row.daysRemaining]));
  const rows = batches.filter(row => Number(row.current_qty || 0) <= Number(row.min_qty || 0) || expiry.has(row._id))
    .sort((a, b) => (expiry.get(a._id) ?? Infinity) - (expiry.get(b._id) ?? Infinity));
  const tableRow = row => {
    const days = expiry.get(row._id), low = Number(row.current_qty || 0) <= Number(row.min_qty || 0);
    const tags = [...(days < 0 ? ['已过期'] : days !== undefined ? [days === 0 ? '今日到期' : '临期'] : []), ...(low ? ['低库存'] : [])];
    return [<div className="platform-warning-tags" key={row._id}>{tags.map(tag => <strong className={tag === '临期' || tag === '今日到期' ? 'is-warning' : 'is-danger'} key={tag}>{tag}</strong>)}</div>, row.material_name, row.spec || '无', row.batch_code,
      `${row.current_qty} ${row.unit || ''}`, `${row.min_qty || 0} ${row.unit || ''}`, row.expiry_date || '未登记',
      row.storage_room || row.storage_location || '未登记', row.storage_detail || '未登记',
      row.purchaser_name || row.purchaser_username || '未登记', row.inbound_by_name || row.created_by_name || row.inbound_by_username || row.created_by_username || '未登记', renderPhoto(row)];
  };
  return <>
    <InventoryMetrics inventory={inventoryMetrics(batches)} label="当前筛选库存" />
    <section aria-label="库存预警明细" style={cardStyle}>
      <div className="platform-warning-heading"><h2>库存预警（{rows.length} 批）</h2><small>低库存：余量≤预警值；临期：30天内到期且有库存</small></div>
      {rows.length ? <>
        <RecentRecords rows={rows} preserveOrder>{shown => <Table mobileColumns={['预警', '材料', '规格', '当前库存', '有效期', '存放房间', '具体位置简述']} columns={['预警', '材料', '规格', '批次', '当前库存', '预警值', '有效期', '存放房间', '具体位置简述', '采购人', '入库人', '入库证明']} rows={shown.map(tableRow)} />}</RecentRecords>
      </> : <p className="platform-metric-scope">当前筛选范围内暂无低库存、临期或过期批次。</p>}
    </section>
  </>;
}
