export const PURCHASE_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const BATCH_EDIT_DENIED = '学生仅可在本人采购入库后的48小时内修改物品信息。';

const id = value => String(value ?? '').trim();
const publicId = value => id(value).replace(/^PUR-20(\d{6})-/, 'PUR-$1-');

// Use the completed purchase's immutable applicant and receipt time, never a
// display name, stock-out delegate, batch update time, or client-supplied patch.
export function createBatchEditPolicy(purchases = []) {
  const byBatch = new Map();
  for (const purchase of purchases) {
    const key = id(purchase.inbound_batch_id);
    if (key) byBatch.set(key, byBatch.has(key) ? null : purchase);
  }
  function deadline(account, batch) {
    if (account?.account_type !== 'student' || !account.username || !id(batch?._id)) return null;
    const purchase = byBatch.get(id(batch._id));
    if (!purchase || purchase.applicant_username !== account.username || purchase.received_status !== '已入库'
      || !['已完成', '已入库', '已归档'].includes(purchase.status)) return null;
    if ((id(batch.related_purchase_record_id) && id(batch.related_purchase_record_id) !== id(purchase._id))
      || (publicId(batch.related_purchase_id) && publicId(batch.related_purchase_id) !== publicId(purchase.public_id))) return null;
    const stamp = purchase.completed_at;
    if (typeof stamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)) return null;
    const completedAt = Date.parse(stamp);
    return Number.isFinite(completedAt) ? completedAt + PURCHASE_EDIT_WINDOW_MS : null;
  }
  return {
    deadline,
    canEdit(account, batch, now = Date.now()) {
      if (!batch) return false;
      if (account?.account_type === 'admin') return true;
      const end = deadline(account, batch);
      return end !== null && Number.isFinite(now) && now >= end - PURCHASE_EDIT_WINDOW_MS && now < end;
    },
  };
}
