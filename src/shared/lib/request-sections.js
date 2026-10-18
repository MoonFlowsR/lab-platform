import { isCompletedWork } from '../../features/work/work-values.js';

export function splitRequestSections(rows = [], { purchase = false, manager = false } = {}) {
  const complete = row => row.status === '已关闭' || (purchase
    ? ['已完成', '已归档'].includes(row.status) || row.received_status === '已入库'
    : isCompletedWork(row));
  const isHistory = row => manager ? row.status !== '待教师审核' : complete(row);
  return { ongoing: rows.filter(row => !isHistory(row)), history: rows.filter(isHistory) };
}

export function splitReviewedWorkSections(rows = [], { manager = true } = {}) {
  const modifiedAfterReview = row => row.completion_modified === true && isCompletedWork(row);
  return {
    ...splitRequestSections(rows.filter(row => !modifiedAfterReview(row)), { manager }),
    modified: rows.filter(modifiedAfterReview),
  };
}
