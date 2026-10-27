import { workModule } from '../work/work-types.js';
import { businessMetrics } from './dashboard-metrics.js';
import { reimbursementMetrics } from '../finance/reimbursement.js';
import { ReimbursementFigures } from '../finance/ReimbursementSummary.jsx';
import Icon from '../../shared/components/Icon.jsx';

export default function DashboardMetrics({ workRequests, purchases, mode = 'review', money, onOpen, actions, showReimbursement = false, types = ['测试', '加工', '维修', '采购'] }) {
  const reimbursement = showReimbursement ? reimbursementMetrics(workRequests, purchases) : null;
  return <div className={`platform-business-metrics${types.length === 1 ? " is-single" : ""}`}>
    {businessMetrics(workRequests, purchases).filter(metric => types.includes(metric.type)).map(metric => {
      const purchase = metric.type === '采购';
      const headerActions = types.length === 1 && actions;
      const statuses = [['待审批', metric.sections.pending], ['已审批', metric.sections.reviewed], ['已完成', metric.sections.completed], ['完成时修改', metric.sections.modified]];
      const counts = [
        ['待教师审核', metric.pending],
        [purchase ? '待入库' : '待确认完成', metric.ready],
        [purchase ? '实际入库' : '实际完成', metric.completed],
      ];
      const extraCounts = [
        ...(metric.revise > 0 ? [['驳回/需修改', metric.revise]] : []),
        ...(metric.withdrawn > 0 ? [['已撤回', metric.withdrawn]] : []),
        ...(metric.closed > 0 ? [['已关闭', metric.closed]] : []),
        ...(metric.other > 0 ? [['其它状态', metric.other]] : []),
      ];
      const amounts = purchase ? [
        ['待审核预计金额', metric.pendingAmount],
        ['待入库预计金额', metric.readyAmount],
        ['实际入库金额', metric.completedAmount],
      ] : [['最终费用', metric.completedAmount]];
      const heading = <div className="platform-business-heading"><h2>{purchase ? '采购/入库' : metric.type}</h2>{onOpen && <button type="button" className="platform-navigation-link" onClick={() => onOpen(purchase ? 'purchases' : workModule(metric.type))}>{mode === 'review' ? '去审核' : '查看'}<Icon name="arrowUpRight" size={16} /></button>}</div>;
      return <section key={metric.type} aria-label={`${metric.type}统计`} className={`platform-business-card is-${purchase ? 'purchase' : workModule(metric.type)}${headerActions ? ' has-header-actions' : ''}`}>
        {headerActions ? <div className="platform-business-topline">{heading}<div className="platform-statistics-actions">{headerActions}</div></div> : heading}
        <div className="platform-business-headline"><strong>{metric.total}</strong><span>申请总数</span></div>
        <dl className="platform-business-statuses">{statuses.map(([label, value], index) => <div key={label}><dt>{label}</dt><dd>{types.length === 1 ? <button type="button" className="platform-status-jump" aria-label={`查看${label}工单，共${value}条`} onClick={() => {
          const target = document.querySelector(`main > .platform-section-${['pending', 'approved', 'reviewed', 'modified'][index]}`);
          if (target) { target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); target.focus({ preventScroll: true }); }
        }}>{value}<Icon name="arrowUpRight" size={15} /></button> : value}</dd></div>)}</dl>
        <div className="platform-business-footer">
          <dl className={`platform-business-counts${purchase ? ' is-purchase' : ' is-work'}`} aria-label={`${metric.type}办理数量${purchase ? '' : '和费用'}`}>
            {counts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><b>{value}</b><small>条</small></dd></div>)}
            {!purchase && <div className="platform-business-amount"><dt>最终费用</dt><dd><b>{money(metric.completedAmount)}</b></dd></div>}
          </dl>
          {purchase && <dl className="platform-business-amounts" aria-label="采购费用">{amounts.map(([label, value]) => <div className="platform-business-amount" key={label}><dt>{label}</dt><dd><b>{money(value)}</b></dd></div>)}</dl>}
          {extraCounts.length > 0 && <dl className="platform-business-extra-counts" aria-label={`${metric.type}其它办理状态`}>{extraCounts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><b>{value}</b><small>条</small></dd></div>)}</dl>}
          {purchase && metric.legacyEstimatedCount > 0 && <p className="platform-business-legacy">{metric.legacyEstimatedCount} 条旧记录沿用预计金额</p>}
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
    {onOpen && <button type="button" className="platform-navigation-link" onClick={onOpen}>查看库存<Icon name="arrowUpRight" size={16} /></button>}
  </section>;
}

export function MovementMetrics({ rows = [], onOpen, label = '库存流水', actions }) {
  const types = ['入库', '出库', '退库'];
  const heading = <div className="platform-inventory-heading"><strong>{label}</strong><small>{rows.length} 条记录</small></div>;
  return <section className={`platform-inventory-metrics${actions ? ' has-header-actions' : ''}`} aria-label="库存流水统计">{actions ? <div className="platform-movement-topline">{heading}<div className="platform-statistics-actions">{actions}</div></div> : heading}<dl>{[...types, '库存修正'].map(type => <div key={type}><dt>{type}</dt><dd>{rows.filter(row => type === '库存修正' ? !types.includes(row.transaction_type) : row.transaction_type === type).length}<small> 条</small></dd></div>)}</dl>{onOpen && <button className="platform-navigation-link" onClick={onOpen}>查看流水<Icon name="arrowUpRight" size={16} /></button>}</section>;
}
