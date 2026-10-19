import { isCompletedWork } from '../../features/work/work-values.js';

export function splitRequestSections(rows = [], { purchase = false, manager = false } = {}) {
  const complete = row => row.status === '已关闭' || (purchase
    ? ['已完成', '已归档'].includes(row.status) || row.received_status === '已入库'
    : isCompletedWork(row));
  const isHistory = row => manager ? row.status !== '待教师审核' : complete(row);
  return { ongoing: rows.filter(row => !isHistory(row)), history: rows.filter(isHistory) };
}

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
