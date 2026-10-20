import { completedWorkFee, isCompletedWork } from '../work/work-values.js';
import { hasFinalPurchaseAmount, isReceivedPurchase, purchaseAmount } from '../purchases/purchase-values.js';

export const reimbursementLabel = row => row.reimbursed === true ? '已报销' : '未报销';
export const isReimbursementEligible = row => (['测试','加工','维修'].includes(row.request_type) ? isCompletedWork(row) : isReceivedPurchase(row)) && ['已开票', '已挂账'].includes(row.settlement_status);

export function reimbursementMetrics(workRequests = [], purchases = []) {
  const empty = () => ({ reimbursed: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 }, unregisteredCount: 0, legacyEstimatedCount: 0 });
  const total = empty();
  const byType = ['测试', '加工', '维修', '采购'].map(type => {
    const metric = { type, ...empty() }, purchase = type === '采购';
    const rows = purchase ? purchases.filter(isReceivedPurchase) : workRequests.filter(row => row.request_type === type && isCompletedWork(row));
    for (const row of rows) {
      const group = row.reimbursed === true ? 'reimbursed' : 'pending';
      const amount = Number(purchase ? purchaseAmount(row) : completedWorkFee(row));
      const cents = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) : 0;
      metric[group].count++;metric[group].amount += cents;
      if (group === 'pending' && !['已开票', '已挂账'].includes(row.settlement_status)) metric.unregisteredCount++;
      if (purchase && !hasFinalPurchaseAmount(row)) metric.legacyEstimatedCount++;
    }
    for (const group of ['reimbursed', 'pending']) {
      total[group].count += metric[group].count;total[group].amount += metric[group].amount;
      metric[group].amount /= 100;
    }
    total.unregisteredCount += metric.unregisteredCount;total.legacyEstimatedCount += metric.legacyEstimatedCount;
    return metric;
  });
  for (const group of ['reimbursed', 'pending']) total[group].amount /= 100;
  return { ...total, byType };
}
