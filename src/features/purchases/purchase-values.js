export const isReceivedPurchase = row => row.status !== '已关闭' && (['已完成','已入库','已归档'].includes(row.status) || row.received_status === '已入库');
export const hasFinalPurchaseAmount = row => isReceivedPurchase(row) && row.actual_total_price != null && row.actual_total_price !== '' && Number.isFinite(Number(row.actual_total_price));
export const purchaseAmount = row => Number((hasFinalPurchaseAmount(row) ? row.actual_total_price : row.estimated_price) || 0);
export const purchaseAmountLabel = row => hasFinalPurchaseAmount(row) ? '最终总采购费' : '预计金额';
export const purchaseQuantityText = row => `${isReceivedPurchase(row) ? row.actual_received_qty ?? row.quantity : row.quantity} ${isReceivedPurchase(row) ? row.actual_received_unit || row.unit || '' : row.unit || ''}`;
function purchaseInboundChanges(row) {
  if (Array.isArray(row.inbound_changes)) return row.inbound_changes;
  // Older receipts already recorded actual quantities/units; use that evidence without rewriting records.
  if (!isReceivedPurchase(row)) return [];
  const changes=[];
  if (row.actual_received_qty != null && row.quantity != null && Number(row.actual_received_qty) !== Number(row.quantity)) changes.push({label:'到货数量',before:row.quantity,after:row.actual_received_qty});
  if (row.actual_received_unit && row.unit && row.actual_received_unit !== row.unit) changes.push({label:'计量单位',before:row.unit,after:row.actual_received_unit});
  if (hasFinalPurchaseAmount(row) && row.estimated_price != null && Number(row.actual_total_price) !== Number(row.estimated_price)) changes.push({label:'总采购费（元）',before:row.estimated_price,after:row.actual_total_price});
  return changes;
}
export const purchaseWasModified = row => isReceivedPurchase(row) && (row.inbound_modified === true || purchaseInboundChanges(row).length > 0);
export const inboundChangesText = row => purchaseInboundChanges(row).map(item => `${item.label}：${item.before} → ${item.after}`).join('；');
