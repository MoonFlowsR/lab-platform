module.exports = function inboundConfirmation(before, payload) {
  if (payload.confirmed !== true) throw new Error('请核对到货信息并确认完成采购入库。');
  if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('采购申请已更新，请刷新后重新核对到货信息。');
  const status = String(payload.settlement_status || '').trim();
  if (!['已开票', '已挂账'].includes(status)) throw new Error('请选择工单状态：已开票或已挂账。');
  const validNumber = value => ['number','string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value));
  if (!validNumber(payload.actual_total_price) || Number(payload.actual_total_price) < 0) throw new Error('请填写不小于 0 的最终总采购费。');
  if (!validNumber(payload.actual_qty) || Number(payload.actual_qty) <= 0) throw new Error('实际到货数量必须大于 0。');
  const actualQty = Number(payload.actual_qty), totalPrice = Number(payload.actual_total_price);
  if (!Number.isFinite(totalPrice / actualQty)) throw new Error('请核对到货数量和最终总采购费。');
  const unit = String(payload.unit || before.unit || '').trim();
  if (!unit || unit.length > 30) throw new Error('请填写入库单位（不超过30字）。');
  const original = { quantity: Number(before.quantity), unit: before.unit, estimated_price: Number(before.estimated_price) };
  const changes = [
    {field:'quantity',label:'到货数量',before:original.quantity,after:actualQty},
    {field:'unit',label:'计量单位',before:original.unit,after:unit},
    {field:'estimated_price',label:'总采购费（元）',before:original.estimated_price,after:totalPrice},
  ].filter(item => item.before !== item.after);
  return { actualQty, totalPrice, unit, patch: { actual_total_price: totalPrice, settlement_status: status,
    inbound_confirmed: true, inbound_original: original, inbound_modified: changes.length > 0, inbound_changes: changes,
  } };
};
