import { workModule } from '../work/work-types.js';
import { businessMetrics } from './dashboard-metrics.js';
import { reimbursementMetrics } from '../finance/reimbursement.js';
import { ReimbursementFigures } from '../finance/ReimbursementSummary.jsx';

export default function DashboardMetrics({ workRequests, purchases, mode = 'review', money, onOpen, showReimbursement = false, types = ['测试', '加工', '维修', '采购'] }) {
  const reimbursement = showReimbursement ? reimbursementMetrics(workRequests, purchases) : null;
  return <div className={`platform-business-metrics${types.length === 1 ? " is-single" : ""}`}>
    {businessMetrics(workRequests, purchases).filter(metric => types.includes(metric.type)).map(metric => {
      const purchase = metric.type === '采购';
      const statuses = [['待审批', metric.sections.pending], ['已审批', metric.sections.reviewed], ['已完成', metric.sections.completed], ['完成时修改', metric.sections.modified]];
      return <section key={metric.type} aria-label={`${metric.type}统计`} className={`platform-business-card is-${purchase ? 'purchase' : workModule(metric.type)}`}>
        <div className="platform-business-heading"><h2>{purchase ? '采购/入库' : metric.type}</h2>{onOpen && <button type="button" onClick={() => onOpen(purchase ? 'purchases' : workModule(metric.type))}>{mode === 'review' ? '去审核' : '查看'} →</button>}</div>
        <div className="platform-business-headline"><strong>{metric.total}</strong><span>申请总数</span></div>
        <dl className="platform-business-statuses">{statuses.map(([label, value], index) => <div key={label}><dt>{label}</dt><dd>{types.length === 1 ? <button type="button" className="platform-status-jump" aria-label={`查看${label}工单，共${value}条`} onClick={() => {
          const target = document.querySelector(`main > .platform-section-${['pending', 'approved', 'reviewed', 'modified'][index]}`);
          if (target) { target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); target.focus({ preventScroll: true }); }
        }}>{value}<span aria-hidden="true">↗</span></button> : value}</dd></div>)}</dl>
        <div className="platform-business-footer">
          <span>待教师审核 <b>{metric.pending}</b> 条</span>
          <span>{purchase ? '待入库' : '待确认完成'} <b>{metric.ready}</b> 条</span>
          {metric.revise > 0 && <span>驳回/需修改 <b>{metric.revise}</b> 条</span>}
          {metric.withdrawn > 0 && <span>已撤回 <b>{metric.withdrawn}</b> 条</span>}
          {metric.closed > 0 && <span>已关闭 <b>{metric.closed}</b> 条</span>}
          {metric.other > 0 && <span>其它状态 <b>{metric.other}</b> 条</span>}
          <span className="platform-business-amount">{purchase ? '实际入库' : '实际完成'} {metric.completed} 条 · {purchase ? '金额' : '最终费用'} <b>{money(metric.completedAmount)}</b></span>
          {purchase && <><span className="platform-business-amount">待入库预计金额 <b>{money(metric.readyAmount)}</b></span><span className="platform-business-amount">待审核预计金额 <b>{money(metric.pendingAmount)}</b></span>{metric.legacyEstimatedCount > 0 && <span>{metric.legacyEstimatedCount} 条旧记录沿用预计金额</span>}</>}
        </div>
        {reimbursement && <ReimbursementFigures metric={reimbursement.byType.find(row => row.type === metric.type)} money={money} compact />}
      </section>;
    })}
  </div>;
}

export function InventoryMetrics({ inventory, label = '团队库存', onOpen }) {
  return <section className="platform-inventory-metrics" aria-label={label}>
    <div className="platform-inventory-heading"><strong>{label}</strong><small>{inventory.total} 个批次</small></div>
    <dl><div><dt>低库存</dt><dd className={inventory.low ? 'is-danger' : ''}>{inventory.low}<small> 批</small></dd></div><div><dt>临期 · 30天内</dt><dd className={inventory.expiring ? 'is-warning' : ''}>{inventory.expiring}<small> 批</small></dd></div><div><dt>已过期</dt><dd className={inventory.expired ? 'is-danger' : ''}>{inventory.expired}<small> 批</small></dd></div></dl>
    {onOpen && <button type="button" onClick={onOpen}>查看库存 →</button>}
  </section>;
}

export function MovementMetrics({ rows = [], onOpen, label = '库存流水' }) {
  const types = ['入库', '出库', '退库'];
  return <section className="platform-inventory-metrics" aria-label="库存流水统计"><div className="platform-inventory-heading"><strong>{label}</strong><small>{rows.length} 条记录</small></div><dl>{[...types, '库存修正'].map(type => <div key={type}><dt>{type}</dt><dd>{rows.filter(row => type === '库存修正' ? !types.includes(row.transaction_type) : row.transaction_type === type).length}<small> 条</small></dd></div>)}</dl>{onOpen && <button onClick={onOpen}>查看流水 →</button>}</section>;
}
