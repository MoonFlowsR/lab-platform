import { isReceivedPurchase, purchaseWasModified } from '../../features/purchases/purchase-values.js';
import { isCompletedWork } from '../../features/work/work-values.js';

export function splitReviewedWorkSections(rows = []) {
  const sections = { pending: [], reviewed: [], completed: [], modified: [] };
  for (const row of rows) {
    const section = isCompletedWork(row)
      ? row.completion_modified === true ? 'modified' : 'completed'
      : row.status === '已关闭' ? 'completed'
      : ['已通过', '已实施', '已驳回', '需修改'].includes(row.status) ? 'reviewed' : 'pending';
    sections[section].push(row);
  }
  return sections;
}

export function splitReviewedPurchaseSections(rows = []) {
  const sections = { pending: [], reviewed: [], completed: [], modified: [] };
  for (const row of rows) {
    const key = isReceivedPurchase(row) ? purchaseWasModified(row) ? 'modified' : 'completed'
      : row.status === '已关闭' ? 'completed'
      : ['待入库','已通过','已驳回','需修改'].includes(row.status) ? 'reviewed' : 'pending';
    sections[key].push(row);
  }
  return sections;
}
