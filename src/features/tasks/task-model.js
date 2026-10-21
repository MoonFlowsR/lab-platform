import { canReviewAssignedRequest } from '../../shared/lib/review-scope.js';
import { WORK_DEFINITIONS } from '../work/work-types.js';
import { isCompletedWork, completedWorkFee } from '../work/work-values.js';
import { isReceivedPurchase, purchaseAmount } from '../purchases/purchase-values.js';
import { isReimbursementEligible } from '../finance/reimbursement.js';
import { canCompleteStockRequest } from '../stock/stock-out-policy.js';
import { expiryWarnings } from '../reports/report-data.js';

export const taskRecordId = row => String(row._id ?? row.id ?? row.public_id ?? '');
export const taskContains = (group, row) => !group || group.ids.has(taskRecordId(row));

// Only available actions count as personal tasks. Search and list preferences cannot hide duties.
export function buildTaskCenter({ account, workRequests = [], purchases = [], stockOutRequests = [], batches = [], accounts = [], today }) {
  const role = account?.account_type, username = account?.username;
  const groups = [];
  const add = (id, module, title, rows, options = {}) => {
    groups.push({ id, module, title, rows, ids: new Set(rows.map(taskRecordId)), count: rows.length, kind: 'action', action: '去处理', ...options });
  };
  if (!username) return { groups, total: 0, byModule: {} };
  for (const { name: type, module } of [...WORK_DEFINITIONS, { name: '采购', module: 'purchases' }]) {
    const purchase = module === 'purchases';
    const rows = purchase ? purchases : workRequests.filter(row => row.request_type === type);
    const complete = purchase ? isReceivedPurchase : isCompletedWork;
    const active = rows.filter(row => !complete(row) && row.status !== '已关闭');
    const mine = active.filter(row => row.applicant_username === username);
    const ready = row => row.status === (purchase ? '待入库' : '已通过');
    if (role === 'student') {
      add(module + '-complete', module, purchase ? '采购待到货入库' : type + '待确认完成', mine.filter(ready), { action: purchase ? '去入库' : '去确认', section: 'approved' });
      add(module + '-revise', module, type + '待修改或关闭', mine.filter(row => ['需修改', '已驳回'].includes(row.status)), { action: '查看意见', section: 'approved' });
      add(module + '-resubmit', module, type + '已撤回待重提', mine.filter(row => row.status === '已撤回'), { action: '去修改', section: 'pending' });
      add(module + '-waiting', module, type + '等待教师审核', mine.filter(row => row.status === '待教师审核'), { kind: 'tracking', action: '查看进度', section: 'pending' });
    }
    if (role === 'teacher') add(module + '-review', module, type + '待你审核', active.filter(row => row.status === '待教师审核' && canReviewAssignedRequest(row, account)), { action: '去审核', section: 'pending' });
    if (role === 'finance' || role === 'admin') {
      const eligible = rows.filter(row => isReimbursementEligible(row) && row.reimbursed !== true);
      add(module + '-reimburse', module, type + '待报销', eligible, {
        kind: role === 'finance' ? 'action' : 'tracking', action: role === 'finance' ? '去核对' : '查看进度', section: 'reviewed',
        amount: eligible.reduce((sum, row) => sum + Math.round(Number(purchase ? purchaseAmount(row) : completedWorkFee(row)) * 100), 0) / 100,
      });
      add(module + '-settlement', module, type + '待补工单状态', rows.filter(row => complete(row) && row.reimbursed !== true && !isReimbursementEligible(row)), { kind: 'tracking', action: '查看记录', section: 'reviewed' });
    }
    if (role === 'admin') {
      add(module + '-team-review', module, type + '待教师审核', active.filter(row => row.status === '待教师审核'), { kind: 'tracking', action: '查看进度', section: 'pending' });
      add(module + '-team-complete', module, purchase ? '采购待到货入库' : type + '待学生确认完成', active.filter(ready), { kind: 'tracking', action: '查看进度', section: 'approved' });
    }
  }
  if (role !== 'finance') add('stock-review', 'stock', '出库申请待你审批', stockOutRequests.filter(row => row.status === '待采购人审批' && row.purchaser_username === username && row.applicant_username !== username), { action: '去审批', section: 'pending' });
  if (role === 'student') {
    add('stock-complete', 'stock', '待完成出库登记', stockOutRequests.filter(row => canCompleteStockRequest(row, account, batches, purchases)), { action: '去登记', section: 'approved' });
    add('stock-waiting', 'stock', '出库等待采购人审批', stockOutRequests.filter(row => row.status === '待采购人审批' && row.applicant_username === username && !canCompleteStockRequest(row, account, batches, purchases)), { kind: 'tracking', action: '查看进度', section: 'pending' });
  }
  if (role === 'admin') {
    add('accounts-pending', 'admin', '待启用账号', accounts.filter(row => row.status === 'pending'), { action: '去核对启用' });
    add('stock-team-review', 'stock', '团队出库待采购人审批', stockOutRequests.filter(row => row.status === '待采购人审批'), { kind: 'tracking', action: '查看进度', section: 'pending' });
    add('stock-team-complete', 'stock', '团队待完成出库登记', stockOutRequests.filter(row => row.status === '已同意待出库'), { kind: 'tracking', action: '查看进度', section: 'approved' });
  }
  const warnings = expiryWarnings(batches, today);
  add('inventory-expired', 'materials', '已过期', warnings.filter(row => row.daysRemaining < 0), { kind: 'warning', action: '查看库存' });
  add('inventory-expiring', 'materials', '30天内到期', warnings.filter(row => row.daysRemaining >= 0), { kind: 'warning', action: '查看库存' });
  add('inventory-low', 'materials', '低库存', batches.filter(row => Number(row.current_qty || 0) <= Number(row.min_qty || 0)), { kind: 'warning', action: '查看库存' });
  const actions = groups.filter(group => group.kind === 'action'), byModule = {};
  for (const group of actions) byModule[group.module] = (byModule[group.module] || 0) + group.count;
  return { groups, total: actions.reduce((sum, group) => sum + group.count, 0), byModule };
}
