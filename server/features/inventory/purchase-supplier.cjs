const { randomUUID } = require('node:crypto');
const clean = value => String(value ?? '').trim();
const publicKey = value => clean(value).replace(/^PUR-20(\d{6})-/, 'PUR-$1-');

// Resolve only explicit purchase links; material names are never a relationship key.
function linkedPurchase({ getRecord, listRecords }, batch) {
  const recordId = clean(batch.related_purchase_record_id);
  const publicId = publicKey(batch.related_purchase_id);
  const direct = recordId ? getRecord('lab_purchase_requests', recordId) : null;
  const matches = listRecords('lab_purchase_requests', row =>
    (publicId && publicKey(row.public_id) === publicId) || String(row.inbound_batch_id || '') === String(batch._id));
  const candidates = new Map([...matches, ...(direct ? [direct] : [])].map(row => [String(row._id), row]));
  if (candidates.size > 1) throw new Error('批次关联的采购申请不一致，请联系管理员核对后再修改采购渠道。');
  const purchase = [...candidates.values()][0];
  if (purchase && ((recordId && recordId !== String(purchase._id)) || (publicId && publicId !== publicKey(purchase.public_id)))) {
    throw new Error('批次关联的采购申请不一致，请联系管理员核对后再修改采购渠道。');
  }
  return purchase || null;
}

// The caller holds the batch-information immediate transaction, including its audit writes.
function syncPurchaseSupplier(context, batch, supplier, reason) {
  if (!context.db.inTransaction) throw new Error('采购渠道同步必须在库存修改事务内执行。');
  const before = clean(batch.supplier), after = clean(supplier);
  if (before === after) return {};
  const purchase = linkedPurchase(context, batch);
  const change = {
    id: randomUUID(), created_at: context.nowISO(),
    operator_username: context.account.username, operator_name: context.account.display_name,
    before, after, reason, batch_id: String(batch._id), batch_code: batch.batch_code || batch.public_id,
    ...(purchase ? { purchase_id: String(purchase._id), purchase_public_id: purchase.public_id } : {}),
  };
  if (purchase && clean(purchase.preferred_supplier) !== after) {
    const updated = context.updateRecord('lab_purchase_requests', purchase._id, {
      preferred_supplier: after,
      supplier_change_history: [...(purchase.supplier_change_history || []), { ...change, before: clean(purchase.preferred_supplier) }],
    });
    context.addAudit(context.req, context.account, 'syncPurchaseSupplier', 'lab_purchase_requests', purchase._id, purchase, updated);
  }
  return { supplier_change_history: [...(batch.supplier_change_history || []), change] };
}

module.exports = { linkedPurchase, syncPurchaseSupplier };
