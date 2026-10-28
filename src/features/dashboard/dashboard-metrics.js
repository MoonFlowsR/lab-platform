import { purchaseWasModified, purchaseAmount, hasFinalPurchaseAmount, isReceivedPurchase } from '../purchases/purchase-values.js';
import { splitReviewedWorkSections, splitReviewedPurchaseSections } from '../../shared/lib/request-sections.js';
import { completedWorkFee, isCompletedWork, workFee } from '../work/work-values.js';
import { expiryWarnings } from '../reports/report-data.js';
import { reimbursementMetrics } from '../finance/reimbursement.js';
import { inventoryStockIndex, lowStockGroups } from '../inventory/low-stock.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (rows, get) => rows.reduce((total, row) => total + number(get(row)), 0);

export function businessMetrics(workRequests = [], purchases = []) {
  return ['测试', '加工', '维修', '采购'].map(type => {
    const rows = type === '采购' ? purchases : workRequests.filter(row => row.request_type === type);
    const sections = type === '采购' ? splitReviewedPurchaseSections(rows) : splitReviewedWorkSections(rows);
    const sectionCounts = Object.fromEntries(Object.entries(sections).map(([key, items]) => [key, items.length]));
    const completed = rows.filter(row => type === '采购' ? isReceivedPurchase(row) : isCompletedWork(row));
    const finished = new Set(completed);
    const active = rows.filter(row => !finished.has(row));
    const pending = active.filter(row => row.status === '待教师审核');
    const ready = active.filter(row => type === '采购' ? ['待入库', '已通过'].includes(row.status) : ['已通过', '已实施'].includes(row.status));
    const revise = active.filter(row => ['需修改', '已驳回'].includes(row.status));
    const withdrawn = active.filter(row => row.status === '已撤回');
    const closed = active.filter(row => row.status === '已关闭');
    return {
      type, total: rows.length, sections: sectionCounts, pending: pending.length, ready: ready.length, revise: revise.length,
      completed: completed.length, withdrawn: withdrawn.length, closed: closed.length,
      other: rows.length - completed.length - pending.length - ready.length - revise.length - withdrawn.length - closed.length,
      ongoing: rows.length - completed.length - closed.length,
      modified: completed.filter(row => type === '采购' ? purchaseWasModified(row) : row.completion_modified === true).length,
      legacyEstimatedCount: type === '采购' ? completed.filter(row => !hasFinalPurchaseAmount(row)).length : 0,
      completedAmount: sum(completed, type === '采购' ? purchaseAmount : completedWorkFee),
      readyAmount: sum(ready, type === '采购' ? row => row.estimated_price : workFee),
      pendingAmount: sum(pending, type === '采购' ? row => row.estimated_price : workFee),
    };
  });
}

export function inventoryMetrics(batches = [], today, stockIndex = inventoryStockIndex(batches)) {
  const warnings = expiryWarnings(batches, today);
  return {
    total: batches.length,
    low: lowStockGroups(batches, stockIndex).length,
    expiring: warnings.filter(row => row.daysRemaining >= 0).length,
    expired: warnings.filter(row => row.daysRemaining < 0).length,
  };
}

export function reportSummaryRows(data, today) {
  const summary = [];
  const reimbursement = reimbursementMetrics(data.workRequests, data.purchases);
  for (const metric of businessMetrics(data.workRequests, data.purchases)) {
    const { type } = metric;
    for (const [label, value] of [
      ['申请总数', metric.total], ['待审批', metric.sections.pending], ['已审批', metric.sections.reviewed],
      ['已完成', metric.sections.completed], ['完成时修改', metric.sections.modified],
      ['其中待教师审核', metric.pending],
      [type === '采购' ? '待入库' : '待学生完结', metric.ready],
      ['其中驳回/需修改', metric.revise], [type === '采购' ? '实际已入库' : '实际完成', metric.completed],
      ['其中已撤回', metric.withdrawn], ['其中已关闭', metric.closed], ...(metric.other ? [['其它状态', metric.other]] : []),
    ]) summary.push([type + label, value, '条']);
    if (type === '采购') {
      summary.push(['采购已入库金额', metric.completedAmount, '元'], ['采购待入库预计金额', metric.readyAmount, '元'], ['采购待审核预计金额', metric.pendingAmount, '元']);
      if (metric.legacyEstimatedCount) summary.push(['采购沿用预计金额的旧记录', metric.legacyEstimatedCount, '条']);
    } else {
      summary.push([type + '已完成最终费用', metric.completedAmount, '元']);
    }
    const paid = reimbursement.byType.find(row => row.type === type);
    summary.push([type + '已报销工单数', paid.reimbursed.count, '条'], [type + '已报销金额', paid.reimbursed.amount, '元'], [type + '待报销工单数', paid.pending.count, '条'], [type + '待报销金额', paid.pending.amount, '元']);
  }
  summary.push(['已报销工单合计', reimbursement.reimbursed.count, '条'], ['已报销金额合计', reimbursement.reimbursed.amount, '元'], ['待报销工单合计', reimbursement.pending.count, '条'], ['待报销金额合计', reimbursement.pending.amount, '元']);
  const stock = data.stockTransactions || [];
  summary.push(['出入退库记录数', stock.length, '条']);
  for (const type of ['入库', '出库', '退库']) summary.push([type + '记录数', stock.filter(row => row.transaction_type === type).length, '条']);
  summary.push(['库存修正记录数', stock.filter(row => !['入库', '出库', '退库'].includes(row.transaction_type)).length, '条']);
  const inventory = inventoryMetrics(data.batches, today, data.inventoryStock);
  summary.push(['相关库存批次', inventory.total, '批'], ['低库存材料规格单位组', inventory.low, '组'], ['临期批次（30天内）', inventory.expiring, '批'], ['已过期批次', inventory.expired, '批'], ['审批记录数', (data.reviewLogs || []).length, '条']);
  return summary.map(([label, value, unit]) => [label, unit === '元' ? Number(value.toFixed(2)) : value, unit]);
}
