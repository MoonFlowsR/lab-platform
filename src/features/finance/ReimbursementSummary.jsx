import { reimbursementMetrics } from './reimbursement.js';

export function ReimbursementFigures({ metric, money, compact = false }) {
  return <dl className={`platform-reimbursement-figures${compact ? ' is-compact' : ''}`}>
    {[['reimbursed', '已报销'], ['pending', '待报销']].map(([key, label]) => <div key={key} className={`is-${key}`}>
      <dt>{label}<span>{metric[key].count} 条</span></dt>
      <dd>{money(metric[key].amount)}</dd>
    </div>)}
  </dl>;
}

export default function ReimbursementSummary({ workRequests, purchases, money }) {
  const metric = reimbursementMetrics(workRequests, purchases);
  return <section className="platform-reimbursement-summary" aria-label="报销统计">
    <div className="platform-reimbursement-heading"><h2>报销统计</h2><details><summary>统计口径</summary><p>仅统计已完成或已入库工单，尚未标记报销的计入待报销；金额按工单最终金额计算。未确认最终金额的旧采购沿用预计金额。</p></details></div>
    <ReimbursementFigures metric={metric} money={money} />
    {(metric.unregisteredCount > 0 || metric.legacyEstimatedCount > 0) && <p className="platform-reimbursement-note">{[metric.unregisteredCount > 0 && `待报销中 ${metric.unregisteredCount} 条尚未登记工单状态`, metric.legacyEstimatedCount > 0 && `${metric.legacyEstimatedCount} 条旧采购沿用预计金额`].filter(Boolean).join('；')}。</p>}
  </section>;
}
