const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const isCompletedWork = row => ['已完成', '已归档'].includes(row.status);
export const workFee = row => row.request_type === '加工' ? number(row.cost_processing ?? (number(row.cost_test) + number(row.cost_material))) : number(row.cost_test);
export const completedWorkFee = row => isCompletedWork(row) ? workFee(row) : 0;
export const completionChangesText = row => (row.completion_changes || []).map(change => change.label + '：' + change.before + ' → ' + change.after).join('；');
