import { workModule } from '../work/work-types.js';
import { businessMetrics } from './dashboard-metrics.js';

export default function DashboardMetrics({ workRequests, purchases, mode = 'review', money, onOpen, types = ['测试', '加工', '维修', '采购'] }) {
  return <div className={`platform-business-metrics${types.length === 1 ? " is-single" : ""}`}>
    {businessMetrics(workRequests, purchases).filter(metric => types.includes(metric.type)).map(metric => {
      const purchase = metric.type === '采购';
      const headline = mode === 'student' ? ['进行中', metric.ongoing] : mode === 'report' ? ['申请总数', metric.total] : ['待审核', metric.pending];
      const statuses = mode === 'student'
        ? [['待审核', metric.pending], [purchase ? '待入库' : '待确认完成', metric.ready], ['驳回/需修改', metric.revise]]
        : mode === 'report'
          ? [['待审核', metric.pending], [purchase ? '待入库' : '待学生完结', metric.ready], ['驳回/需修改', metric.revise], [purchase ? '已入库' : '已完成', metric.completed], ['已撤回', metric.withdrawn], ['已关闭', metric.closed], ...(metric.other ? [['其它状态', metric.other]] : [])]
          : [[purchase ? '待入库' : '待学生完结', metric.ready], [purchase ? '已入库' : '已完成', metric.completed], ['驳回/需修改', metric.revise]];
      return <section key={metric.type} aria-label={`${metric.type}统计`} className={`platform-business-card is-${purchase ? 'purchase' : workModule(metric.type)}`}>
        <div className="platform-business-heading"><h2>{purchase ? '采购/入库' : metric.type}</h2>{onOpen && <button type="button" onClick={() => onOpen(purchase ? 'purchases' : workModule(metric.type))}>{mode === 'review' ? '去审核' : '查看'} →</button>}</div>
        <div className="platform-business-headline"><strong>{headline[1]}</strong><span>{headline[0]}</span>{mode !== 'report' && <small>共 {metric.total} 条申请</small>}</div>
        <dl className="platform-business-statuses">{statuses.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="platform-business-footer">
          {purchase
            ? <><span>已入库 {metric.completed} 条 · 金额 <b>{money(metric.completedAmount)}</b></span><><span>待入库预计金额 <b>{money(metric.readyAmount)}</b></span><span>待审核预计金额 <b>{money(metric.pendingAmount)}</b></span><span>完成时修改 <b>{metric.modified}</b> 条</span>{metric.legacyEstimatedCount > 0 && <span>{metric.legacyEstimatedCount} 条旧记录沿用预计金额</span>}</></>
            : <><span>已完成 {metric.completed} 条 · 最终费用 <b>{money(metric.completedAmount)}</b></span><span>完结时修改 <b>{metric.modified}</b> 条</span></>}
          {mode !== 'report' && metric.closed > 0 && <span>已关闭 <b>{metric.closed}</b> 条</span>}
          {mode !== 'report' && (metric.withdrawn > 0 || metric.other > 0) && <span>已撤回 {metric.withdrawn} 条{metric.other > 0 ? ` · 其它状态 ${metric.other} 条` : ''}</span>}
        </div>
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

export function MovementMetrics({ rows = [], onOpen }) {
  const types = ['入库', '出库', '退库'];
  return <section className="platform-inventory-metrics" aria-label="库存流水统计"><div className="platform-inventory-heading"><strong>库存流水</strong><small>{rows.length} 条记录</small></div><dl>{[...types, '库存修正'].map(type => <div key={type}><dt>{type}</dt><dd>{rows.filter(row => type === '库存修正' ? !types.includes(row.transaction_type) : row.transaction_type === type).length}<small> 条</small></dd></div>)}</dl>{onOpen && <button onClick={onOpen}>查看流水 →</button>}</section>;
}
