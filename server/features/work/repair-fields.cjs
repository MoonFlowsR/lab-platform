// Repair-specific inputs; equipment and organization retain the shared work fields.
module.exports = function repairFields(source, requestType) {
  if (requestType !== '维修') return {};
  const personnel = typeof source.repair_personnel === 'string' ? source.repair_personnel.trim() : '';
  if (!personnel || personnel.length > 100) throw new Error('请填写维修人员（不超过100字）。');
  if (String(source.workload_unit || '').trim() !== '次') throw new Error('维修计量单位只能为“次”。');
  return { repair_personnel: personnel };
};
