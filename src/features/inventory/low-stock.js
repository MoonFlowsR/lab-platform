import { canonicalMaterialName, materialKey } from '../../shared/lib/dropdown-normalize.js';
import { materialSpecification } from './material-summary.js';

const clean = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const indexes = new WeakMap(), anonymousIds = new WeakMap();
const batchId = batch => batch._id ?? batch.id ?? batch.public_id ?? batch.batch_code;
let nextAnonymousId = 0;
function stockKey(batch) {
  const name = materialKey(batch.material_name);
  if (!name && !batch.material_id) {
    const id = batch._id ?? batch.id ?? batch.batch_code ?? batch.public_id;
    if (id != null) return JSON.stringify(['unknown-batch', String(id)]);
    if (!anonymousIds.has(batch)) anonymousIds.set(batch, ++nextAnonymousId);
    return JSON.stringify(['unknown-batch-object', anonymousIds.get(batch)]);
  }
  return JSON.stringify([name ? 'name' : 'material-id', name || String(batch.material_id), materialSpecification(batch.spec), clean(batch.unit)]);
}

// Build this index from the account's complete accessible snapshot, before list filters.
// A batch threshold is a minimum stock level, so repeated thresholds are never added.
export function inventoryStockIndex(batches = []) {
  if (indexes.has(batches)) return indexes.get(batches);
  const byKey = new Map(), byId = new Map(), byBatch = new WeakMap();
  for (const batch of batches) {
    if (batch.deleted_at) continue;
    const key = stockKey(batch);
    const group = byKey.get(key) || { key, material_name: canonicalMaterialName(batch.material_name), spec: materialSpecification(batch.spec), unit: clean(batch.unit), current_qty: 0, min_qty: 0, batches: [] };
    group.current_qty += number(batch.current_qty);
    group.min_qty = Math.max(group.min_qty, number(batch.min_qty));
    group.batches.push(batch);
    byKey.set(key, group);
    byBatch.set(batch, group);
    const id = batchId(batch);
    if (id != null) byId.set(String(id), group);
  }
  const groups = [...byKey.values()];
  for (const group of groups) {
    group.current_qty = Number(group.current_qty.toFixed(8));
    group.low = group.current_qty <= group.min_qty;
  }
  const index = { groups, byKey, byId, byBatch };
  indexes.set(batches, index);
  return index;
}

export function stockGroupFor(index, batch) {
  if (batch.deleted_at) return undefined;
  const id = batchId(batch);
  return index.byBatch.get(batch) || (id != null ? index.byId.get(String(id)) : undefined);
}

// Filters select relevant groups, but cannot hide stock and create a new warning.
export function lowStockGroups(batches = [], index = inventoryStockIndex(batches)) {
  const selected = new Set(batches.map(batch => stockGroupFor(index, batch)).filter(group => group?.low));
  return [...selected];
}
