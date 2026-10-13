import { completedWorkFee, isCompletedWork } from './work-values.js';
import { expiryWarnings } from './report-data.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (rows, get) => rows.reduce((total, row) => total + number(get(row)), 0);

export function businessMetrics(workRequests = [], purchases = []) {
  return ['测试', '加工', '采购'].map(type => {
    const rows = type === '采购' ? purchases : workRequests.filter(row => row.request_type === type);
    const completed = rows.filter(row => type === '采购' ? ['已完成', '已入库', '已归档'].includes(row.status) : isCompletedWork(row));
    const pending = rows.filter(row => row.status === '待教师审核');
    const ready = rows.filter(row => type === '采购' ? row.status === '待入库' : ['已通过', '已实施'].includes(row.status));
    const revise = rows.filter(row => ['需修改', '已驳回'].includes(row.status));
    const withdrawn = rows.filter(row => row.status === '已撤回');
    const closed = rows.filter(row => row.status === '已关闭');
    return {
      type, total: rows.length, pending: pending.length, ready: ready.length, revise: revise.length,
      completed: completed.length, withdrawn: withdrawn.length, closed: closed.length,
      other: rows.length - completed.length - pending.length - ready.length - revise.length - withdrawn.length - closed.length,
      ongoing: rows.length - completed.length - closed.length,
      modified: completed.filter(row => row.completion_modified).length,
      completedAmount: sum(completed, type === '采购' ? row => row.estimated_price : completedWorkFee),
      readyAmount: sum(ready, row => row.estimated_price),
      pendingAmount: sum(pending, row => row.estimated_price),
    };
  });
}

export function inventoryMetrics(batches = [], today) {
  const warnings = expiryWarnings(batches, today);
  return {
    total: batches.length,
    low: batches.filter(row => number(row.current_qty) <= number(row.min_qty)).length,
    expiring: warnings.filter(row => row.daysRemaining >= 0).length,
    expired: warnings.filter(row => row.daysRemaining < 0).length,
  };
}

export function reportSummaryRows(data, today) {
  const summary = [];
  for (const metric of businessMetrics(data.workRequests, data.purchases)) {
    const { type } = metric;
    for (const [label, value] of [
      ['申请总数', metric.total], ['待审核', metric.pending],
      [type === '采购' ? '待入库' : '待学生完结', metric.ready],
      ['驳回/需修改', metric.revise], [type === '采购' ? '已入库' : '已完成', metric.completed],
      ['已撤回', metric.withdrawn], ['已关闭', metric.closed], ...(metric.other ? [['其它状态', metric.other]] : []),
    ]) summary.push([type + label, value, '条']);
    if (type === '采购') {
      summary.push(['采购已入库预计金额', metric.completedAmount, '元'], ['采购待入库预计金额', metric.readyAmount, '元'], ['采购待审核预计金额', metric.pendingAmount, '元']);
    } else {
      summary.push([type + '已完成最终费用', metric.completedAmount, '元'], [type + '完结时修改', metric.modified, '条']);
    }
  }
  const stock = data.stockTransactions || [];
  summary.push(['出入退库记录数', stock.length, '条']);
  for (const type of ['入库', '出库', '退库']) summary.push([type + '记录数', stock.filter(row => row.transaction_type === type).length, '条']);
  summary.push(['库存修正记录数', stock.filter(row => !['入库', '出库', '退库'].includes(row.transaction_type)).length, '条']);
  const inventory = inventoryMetrics(data.batches, today);
  summary.push(['相关库存批次', inventory.total, '批'], ['低库存批次', inventory.low, '批'], ['临期批次（30天内）', inventory.expiring, '批'], ['已过期批次', inventory.expired, '批'], ['审批记录数', (data.reviewLogs || []).length, '条']);
  return summary.map(([label, value, unit]) => [label, unit === '元' ? Number(value.toFixed(2)) : value, unit]);
}
