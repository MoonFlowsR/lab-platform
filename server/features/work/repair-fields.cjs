// Repair-specific inputs; equipment and organization retain the shared work fields.
module.exports = function repairFields(source, requestType) {
  if (requestType !== '维修') return {};
  const personnel = typeof source.repair_personnel === 'string' ? source.repair_personnel.trim() : '';
  if (!personnel || personnel.length > 100) throw new Error('请填写维修人员（不超过100字）。');
  const unit = typeof source.workload_unit === 'string' ? source.workload_unit.trim() : '';
  if (!unit || unit.length > 60 || ['其它', '其他', '__custom_option__'].includes(unit)) throw new Error('请选择或填写具体计量单位（不超过60字）。');
  return { repair_personnel: personnel };
};
