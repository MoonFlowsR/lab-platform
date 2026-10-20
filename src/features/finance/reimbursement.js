import { isCompletedWork } from '../work/work-values.js';
import { isReceivedPurchase } from '../purchases/purchase-values.js';

export const reimbursementLabel = row => row.reimbursed === true ? '已报销' : '未报销';
export const isReimbursementEligible = row => (['测试','加工','维修'].includes(row.request_type) ? isCompletedWork(row) : isReceivedPurchase(row)) && ['已开票', '已挂账'].includes(row.settlement_status);
