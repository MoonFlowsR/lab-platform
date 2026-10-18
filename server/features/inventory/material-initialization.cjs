const { createHash } = require('node:crypto');
const buildMaterialCatalog = require('./material-catalog.cjs');
const storageDetails = require('./storage-details.cjs');

module.exports = function initializeMaterialStock(context) {
  const { db, req, account, payload, listRecords, getRecord, insertRecord, nextPublicId, addAudit, nowISO, requireItemPhoto, bindStockEvidence } = context;
  const clean = value => String(value ?? '').trim();
  const { purchaseNameAliases = {} } = require('../../../src/config/dropdown-options.json');
  const nameKey = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, '');
  const aliases = new Map(Object.entries(purchaseNameAliases).map(([alias, name]) => [nameKey(alias), name]));
  const normalized = value => nameKey(aliases.get(nameKey(value)) || value);
  const catalogItems = buildMaterialCatalog(listRecords);
  const key = clean(payload.entry_key);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) throw new Error('录入编号无效，请刷新页面重试。');
  const fields = ['material_id','name_cn','name_en','cas','category','hazard_level','storage_condition',
    'unit','storage_location','supplier','brand','spec','purity','batch_no','received_date','expiry_date','purchase_purpose','safety_notes','remark'];
  const values = Object.fromEntries(fields.map(field => [field, clean(payload[field])]));
  Object.assign(values, storageDetails(payload));
  if (!values.name_cn) throw new Error('请填写材料名称。');
  values.name_cn = aliases.get(nameKey(values.name_cn)) || values.name_cn;
  if (!['试剂原料', '耗材'].includes(values.category)) throw new Error('请选择材料类别。');
  if (!values.spec) throw new Error('请填写规格 / 型号。');
  if (!['私用/项目用（出库需采购人审批）', '公用'].includes(values.purchase_purpose)) throw new Error('请选择使用目的：私用/项目用（出库需采购人审批）或公用。');
  if (!values.expiry_date) throw new Error('请选择有效期日期。');
  if (!values.unit || values.unit.length > 30 || ['其它', '其他', '__custom_option__'].includes(values.unit)) throw new Error('请选择单位，或填写具体计量单位（不超过30字）。');
  function amount(value, label, optional = false) {
    if (value == null || clean(value) === '') {
      if (optional) return null;
      throw new Error(`请填写${label}。`);
    }
    if (!['string','number'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error(`${label}必须为不小于 0 的有效数字。`);
    }
    return Number(value);
  }
  values.quantity = amount(payload.quantity, '现有数量');
  if (values.quantity <= 0) throw new Error('现有数量必须大于 0。');
  values.unit_price = null;
  values.min_qty = amount(payload.min_qty, '预警数量', true) ?? 0;
  for (const field of ['received_date','expiry_date']) {
    const value = values[field];
    if (field === 'expiry_date' && value === '长期') continue;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) {
      throw new Error('日期格式或日期值不正确。');
    }
  }
  if (values.received_date && values.expiry_date && values.expiry_date !== '长期' && values.expiry_date < values.received_date) throw new Error('有效期不能早于入库日期。');
  const fingerprint = createHash('sha256').update(JSON.stringify(values)).digest('hex');
  const entryKey = `${account.username}:${key}`;
  return db.transaction(() => {
    const existing = listRecords('lab_material_batches', row => row.initialization_key === entryKey)[0];
    if (existing) {
      if (existing.initialization_fingerprint !== fingerprint) throw new Error('这条录入已保存，请刷新列表后再录入下一条。');
      return { material: getRecord('lab_materials', existing.material_id), batch: existing,
        transaction: listRecords('lab_stock_transactions', row => row.initialization_key === entryKey)[0], replayed: true };
    }
    const evidence = requireItemPhoto(account, payload);
    let material = values.material_id ? getRecord('lab_materials', values.material_id) : null;
    if (values.material_id && !material) throw new Error('所选材料不存在，请刷新材料列表。');
    if (material && normalized(material.name_cn || material.name) !== normalized(values.name_cn)) throw new Error('材料名称与所选材料不一致，请重新选择。');
    if (!material) material = listRecords('lab_materials', row => normalized(row.name_cn || row.name) === normalized(values.name_cn))[0] || null;
    const materialName = material ? (material.name_cn || material.name) : values.name_cn;
    const selectedItems = catalogItems.filter(item => normalized(item.name) === normalized(materialName));
    if (selectedItems.length && !selectedItems.some(item => (item.categories || [item.category]).includes(values.category))) throw new Error('材料与采购类别不一致，请重新选择。');
    const identityFields = ['unit','storage_location','supplier','brand','spec','purity','batch_no'];
    if (material && listRecords('lab_material_batches', row => String(row.material_id) === String(material._id)
      && identityFields.every(field => nameKey(row[field]) === nameKey(values[field]))
      && clean(row.expiry_date) === values.expiry_date && clean(row.purchase_purpose) === values.purchase_purpose).length) {
      throw new Error('该材料已有相同规格、单位和渠道的库存，请勿重复建库。补充到货请在对应采购工单完成入库。');
    }
    const created = { ...(context.profileSnapshot || {}), created_by_username: account.username, created_by_name: account.display_name,
      created_at: nowISO(), updated_at: nowISO(), source: 'initial_inventory' };
    if (!material) {
      const id = nextPublicId('MAT');
      material = insertRecord('lab_materials', { ...id, material_code: id.public_id,
        name: values.name_cn, name_cn: values.name_cn, name_en: values.name_en, cas: values.cas,
        category: values.category || '其他', hazard_level: values.hazard_level, storage_condition: values.storage_condition,
        default_unit: values.unit, min_stock: 0, ...created });
      addAudit(req, account, 'initializeMaterialStock', 'lab_materials', material._id, null, material);
    }
    const id = nextPublicId('BATCH');
    const batch = insertRecord('lab_material_batches', { ...id, batch_code: id.public_id,
      material_id: material._id, material_name: material.name_cn || material.name,
      ...Object.fromEntries(identityFields.map(field => [field, values[field]])),
      storage_room: values.storage_room, storage_detail: values.storage_detail,
      initial_qty: values.quantity, current_qty: values.quantity, unit_price: values.unit_price,
      total_price: values.unit_price == null ? null : values.unit_price * values.quantity,
      min_qty: values.min_qty, received_date: values.received_date, expiry_date: values.expiry_date,
      purchaser_name: account.display_name || account.username, purchaser_username: account.username,
      inbound_by_name: account.display_name || account.username, inbound_by_username: account.username,
      inbound_photo_attachment_id: evidence._id,
      acceptance_status: '期初建库', purchase_category: values.category, purchase_purpose: values.purchase_purpose,
      safety_notes: values.safety_notes, remark: values.remark,
      initialization_key: entryKey, initialization_fingerprint: fingerprint, ...created });
    const transaction = insertRecord('lab_stock_transactions', { ...nextPublicId('IO'),
      transaction_type: '入库', material_id: material._id, material_name: material.name_cn || material.name,
      batch_id: batch._id, batch_code: batch.batch_code, quantity: values.quantity, unit: values.unit,
      stock_before: 0, stock_after: values.quantity, operator_name: account.display_name,
      operator_username: account.username, operator_account_type: account.account_type,
      photo_attachment_id: evidence._id, storage_location: values.storage_location,
      storage_room: values.storage_room, storage_detail: values.storage_detail,
      purchase_purpose: values.purchase_purpose,
      usage_reason: '期初建库：录入平台启用前现存材料', remark: values.remark,
      initialization_key: entryKey, ...created });
    addAudit(req, account, 'initializeMaterialStock', 'lab_material_batches', batch._id, null, batch);
    bindStockEvidence(evidence, transaction);
    addAudit(req, account, 'initializeMaterialStock', 'lab_stock_transactions', transaction._id, null, transaction);
    return { material, batch, transaction, replayed: false };
  })();
};
