module.exports = function completeWorkValues(before, payload, account, billingMethods, completedAt) {
  if (account.account_type !== 'student' || before.applicant_username !== account.username) throw new Error('只有学生申请人可以确认本人测试、加工或维修工单完成。');
  if (before.status !== '已通过') throw new Error('只有审核通过且尚未完成的工单可以确认完成。');
  if (payload.confirmed !== true) throw new Error('请先核对最终工作量和费用，再确认完成。');
  if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('工单信息已更新，请刷新后重新核对。');
  const key = require('../../../src/config/work-types.json').find(item => item.name === before.request_type)?.feeKey;
  if (!key) throw new Error('不支持的申请类型。');
  const settlement = typeof payload.settlement_status === 'string' ? payload.settlement_status.trim() : '';
  if (!['已开票', '已挂账'].includes(settlement)) throw new Error('请选择订单状态：已开票或已挂账。');
  const input = payload.patch;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写最终工作量、计量单位和总费用。');
  const allowed = ['workload_quantity', 'workload_unit', key];
  if (Object.keys(input).some(field => !allowed.includes(field))) throw new Error('完结时只能修改工作量、计量单位和总费用。');
  const parse = (value, label, positive) => {
    if (!['number','string'].includes(typeof value) || String(value).trim() === '') throw new Error('请填写' + label + '。');
    const result = Number(value);
    if (!Number.isFinite(result) || (positive ? result <= 0 : result < 0)) throw new Error(label + (positive ? '必须大于 0。' : '必须为不小于 0 的有效金额。'));
    return result;
  };
  const quantity = parse(input.workload_quantity, '最终工作量', true), fee = parse(input[key], '最终总' + before.request_type + '费', false);
  const unit = String(input.workload_unit || '').trim();
  if (typeof input.workload_unit !== 'string' || !unit || unit.length > 60 || ['其它','其他','__custom_option__'].includes(unit)) throw new Error('请选择或填写具体计量单位（不超过60字）。');
  const note = String(payload.completion_note || '').trim();
  if (note.length > 2000) throw new Error('完成备注不能超过2000字。');
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const oldFee = before.request_type === '加工' ? numeric(before.cost_processing ?? (numeric(before.cost_test) + numeric(before.cost_material))) : numeric(before[key]);
  const original = {workload_quantity:numeric(before.workload_quantity), workload_unit:String(before.workload_unit || ''), [key]:oldFee};
  const final = {workload_quantity:quantity, workload_unit:unit, [key]:fee};
  const labels = {workload_quantity:'工作量', workload_unit:'计量单位', [key]:'总'+before.request_type+'费（元）'};
  const changes = allowed.filter(field => original[field] !== final[field]).map(field => ({field, label:labels[field], before:original[field], after:final[field]}));
  return {...final, cost_test:before.request_type === '测试' ? fee : 0, cost_processing:before.request_type === '加工' ? fee : 0, cost_repair:before.request_type === '维修' ? fee : 0, cost_material:0,
    status:'已完成', settlement_status:settlement, completion_note:note, completion_original:original, completion_changes:changes, completion_modified:changes.length > 0,
    completed_by:account.display_name || account.username, completed_username:account.username, completed_at:completedAt};
};
