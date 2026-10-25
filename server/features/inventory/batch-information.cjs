const { syncPurchaseSupplier } = require('./purchase-supplier.cjs');
const options = require('../../../src/config/dropdown-options.json');
const { createBatchEditPolicy, BATCH_EDIT_DENIED } = require('../../../src/features/inventory/batch-edit-policy.js');

module.exports = function updateBatchInformation(context) {
  const { db, req, account, payload, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO, requiredPurchaseExpiryDate, storageDetails, requireItemPhoto, bindStockEvidence } = context;
  const clean = value => String(value ?? '').trim();
  const before = getRecord('lab_material_batches', payload.id);
  if (!before) throw new Error('未找到材料批次。');
  if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('该批次已被更新，请关闭窗口并刷新库存后再修改。');
  const reason = clean(payload.reason);
  if (!reason || reason.length > 2000) throw new Error('请填写修改原因（不超过2000字）。');
  const values = Object.fromEntries(['material_name','purchase_category','spec','unit','supplier','purchase_purpose','safety_notes','remark'].map(field => [field, clean(payload[field])]));
  const key = value => clean(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  const aliases = new Map(Object.entries(options.purchaseNameAliases || {}).map(([alias, name]) => [key(alias), name]));
  values.material_name = aliases.get(key(values.material_name)) || values.material_name;
  if (!values.material_name || values.material_name.length > 200 || ['其它','其他','__custom_option__'].includes(values.material_name)) throw new Error('请填写具体材料名称（不超过200字）。');
  if (!['试剂原料','耗材'].includes(values.purchase_category)) throw new Error('请选择材料类别。');
  if (!values.spec || values.spec.length > 200) throw new Error('请填写规格 / 型号（不超过200字）。');
  if (!values.unit || values.unit.length > 30 || ['其它','其他','__custom_option__'].includes(values.unit)) throw new Error('请填写具体计量单位（不超过30字）。');
  if (!['私用/项目用（出库需采购人审批）','公用'].includes(values.purchase_purpose)) throw new Error('请选择使用目的。');
  if (values.supplier.length > 200 || values.safety_notes.length > 2000 || values.remark.length > 2000) throw new Error('采购渠道最多200字，安全事项及备注最多2000字。');
  for (const field of ['current_qty','min_qty']) {
    if (!['string','number'].includes(typeof payload[field]) || clean(payload[field]) === '' || !Number.isFinite(Number(payload[field])) || Number(payload[field]) < 0) throw new Error('库存数量及最低预警数量须为不小于0的有效数字。');
    values[field] = Number(payload[field]);
  }
  Object.assign(values, storageDetails(payload));
  values.expiry_date = requiredPurchaseExpiryDate(payload.expiry_date);
  return db.transaction(() => {
    if (!createBatchEditPolicy(listRecords('lab_purchase_requests')).canEdit(account, before, Date.parse(nowISO()))) throw new Error(BATCH_EDIT_DENIED);
    if (getRecord('lab_material_batches', before._id)?.updated_at !== before.updated_at) throw new Error('该批次已被更新，请关闭窗口并刷新库存后再修改。');
    const photo = payload.photo_attachment_id ? requireItemPhoto(account, payload) : null;
    const originalMaterial = getRecord('lab_materials', before.material_id);
    let material = listRecords('lab_materials', row => key(row.name_cn || row.name) === key(values.material_name))[0];
    if (!material && originalMaterial && !listRecords('lab_material_batches', row => String(row.material_id) === String(originalMaterial._id) && String(row._id) !== String(before._id)).length) {
      material = updateRecord('lab_materials', originalMaterial._id, { name: values.material_name, name_cn: values.material_name, category: values.purchase_category, default_unit: values.unit });
      addAudit(req, account, 'updateMaterialBatchInformation', 'lab_materials', material._id, originalMaterial, material);
    } else if (!material) {
      const id = nextPublicId('MAT');
      material = insertRecord('lab_materials', { ...id, material_code: id.public_id, name: values.material_name, name_cn: values.material_name, category: values.purchase_category, default_unit: values.unit, min_stock: 0, created_by_username: account.username, created_by_name: account.display_name, created_at: nowISO(), updated_at: nowISO(), source: account.account_type === 'admin' ? 'admin_information_correction' : 'student_information_correction' });
      addAudit(req, account, 'updateMaterialBatchInformation', 'lab_materials', material._id, null, material);
    }
    const supplierHistory = syncPurchaseSupplier(context, before, values.supplier, reason);
    const after = updateRecord('lab_material_batches', before._id, { ...values, ...supplierHistory, material_id: material._id,
      ...(photo ? { inbound_photo_attachment_id: photo._id } : {}),
      last_modified_by: account.display_name, last_modified_username: account.username, last_modified_at: nowISO(), last_modification_reason: reason,
      last_information_modified_at: nowISO(), last_information_modified_by: account.display_name,
    });
    if (String(material._id) === String(originalMaterial?._id) && !listRecords('lab_material_batches', row => String(row.material_id) === String(material._id) && String(row._id) !== String(before._id)).length) {
      const updatedMaterial = updateRecord('lab_materials', material._id, { category: values.purchase_category, default_unit: values.unit });
      addAudit(req, account, 'updateMaterialBatchInformation', 'lab_materials', material._id, material, updatedMaterial);
    }
    for (const inbound of listRecords('lab_stock_transactions', row => row.transaction_type === '入库' && String(row.batch_id) === String(after._id))) {
      if (String(inbound.material_id) === String(after.material_id) && inbound.material_name === after.material_name && (inbound.spec || '') === (after.spec || '')) continue;
      const corrected = updateRecord('lab_stock_transactions', inbound._id, { material_id: after.material_id, material_name: after.material_name, spec: after.spec || '' });
      addAudit(req, account, 'alignInboundMaterial', 'lab_stock_transactions', inbound._id, inbound, corrected);
    }
    const transaction = insertRecord('lab_stock_transactions', { ...nextPublicId('IO'), transaction_type: '调整', batch_id: after._id, batch_code: after.batch_code, material_id: after.material_id, material_name: after.material_name, quantity: Math.abs(values.current_qty - Number(before.current_qty || 0)), unit: values.unit,
      stock_before: Number(before.current_qty || 0), stock_after: values.current_qty, ...(before.unit !== values.unit ? { previous_unit: before.unit } : {}),
      operator_name: account.display_name, operator_username: account.username, operator_account_type: account.account_type,
      ...(supplierHistory.supplier_change_history ? { supplier_before: clean(before.supplier), supplier_after: values.supplier } : {}),
      modification_reason: reason, usage_reason: '物品信息修改' + (before.unit !== values.unit ? `（单位由${before.unit}改为${values.unit}）` : '') + '：' + reason, information_modified: true,
      storage_location: after.storage_location, storage_room: after.storage_room, storage_detail: after.storage_detail, purchase_purpose: after.purchase_purpose,
      ...(photo ? { photo_attachment_id: photo._id } : {}), created_at: nowISO(), updated_at: nowISO(),
    });
    if (photo) bindStockEvidence(photo, transaction);
    addAudit(req, account, 'updateMaterialBatchInformation', 'lab_material_batches', before._id, before, after);
    addAudit(req, account, 'updateMaterialBatchInformation', 'lab_stock_transactions', transaction._id, null, transaction);
    return { record: after, transaction };
  }).immediate();
};
