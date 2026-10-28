import { canonicalMaterialName, materialKey } from '../../shared/lib/dropdown-normalize.js';

const clean = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
export const materialSpecification = value => (clean(value) || '无').replace(/^Mn\s*[-‐‑‒–—−]?\s*(\d+(?:\.\d+)?)(?=$|\s|[，,;；])/iu, 'Mn-$1');
const specification = materialSpecification;
const specificationKey = value => specification(value);
const roomKey = batch => clean(batch.storage_room) || `unknown:${clean(batch.storage_location) || batch._id || batch.id || batch.batch_code || batch.public_id}`;
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const newestFirst = (left, right) => timestamp(right.created_at) - timestamp(left.created_at)
  || String(right._id || right.id || right.batch_code || '').localeCompare(String(left._id || left.id || left.batch_code || ''), 'zh-CN', { numeric: true });
const quantity = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rounded = value => Number(value.toFixed(8));
const locations = batches => [...new Set(batches.map(batch => batch.storage_location || [batch.storage_room, batch.storage_detail].filter(Boolean).join(' · ')).filter(Boolean))];
const codes = batches => [...new Set(batches.map(batch => batch.batch_code || batch.public_id).filter(Boolean))];
const batchGroups = new WeakMap();
const groupSearchRows = new WeakMap();

// Groups describe the display only. Every original batch keeps its own ID and evidence.
export function groupMaterialBatches(batches = []) {
  if (batchGroups.has(batches)) return batchGroups.get(batches);
  const groups = new Map();
  for (const batch of batches) {
    if (batch.deleted_at) continue;
    const name = canonicalMaterialName(batch.material_name);
    if (!materialKey(name)) continue;
    const key = JSON.stringify([materialKey(name), specificationKey(batch.spec), roomKey(batch), clean(batch.unit)]);
    const group = groups.get(key) || { key, batches: [] };
    group.batches.push(batch);
    groups.set(key, group);
  }
  const result = [...groups.values()].map(group => {
    const sorted = [...group.batches].sort(newestFirst), latest = sorted[0];
    const updated = [...sorted].sort((left, right) => timestamp(right.updated_at) - timestamp(left.updated_at))[0];
    return {
      _id: `inventory-group:${encodeURIComponent(group.key)}`,
      material_name: canonicalMaterialName(latest.material_name),
      spec: specification(latest.spec), storage_room: clean(latest.storage_room), unit: clean(latest.unit),
      current_qty: rounded(sorted.reduce((total, batch) => total + quantity(batch.current_qty), 0)),
      batches: sorted, latest_created_at: latest.created_at || '', latest_updated_at: updated.updated_at || '',
      batch_codes: codes(sorted), storage_locations: locations(sorted),
    };
  }).sort((left, right) => timestamp(right.latest_created_at) - timestamp(left.latest_created_at) || left._id.localeCompare(right._id));
  batchGroups.set(batches, result);
  return result;
}

// Search grouped totals as well as the original batch fields, after scope/date filters.
export function searchMaterialBatches(batches = [], query = '', matches) {
  if (!String(query).trim()) return batches;
  return groupMaterialBatches(batches).flatMap(group => {
    if (!groupSearchRows.has(group)) groupSearchRows.set(group, { material_name: group.material_name, spec: group.spec, storage_room: group.storage_room,
      unit: group.unit, current_qty: group.current_qty });
    const summary = groupSearchRows.get(group);
    return matches(summary, query) ? group.batches : group.batches.filter(batch => matches(batch, query));
  });
}

// Inventory amounts are comparable only within the same specification, room and unit.
export function summarizeMaterials(materials = [], batches = []) {
  const groups = new Map();
  const materialsById = new Map();
  for (const row of materials) {
    if (!materialsById.has(String(row._id))) materialsById.set(String(row._id), row);
    const name = canonicalMaterialName(row.name_cn || row.name);
    const key = materialKey(name);
    if (!key || row.deleted_at) continue;
    const group = groups.get(key) || { ...row, name_cn: name, material_records: [], batches: [] };
    group.material_records.push(row);
    groups.set(key, group);
  }
  for (const batch of batches) {
    if (batch.deleted_at) continue;
    const material = materialsById.get(String(batch.material_id));
    const name = canonicalMaterialName(material?.name_cn || material?.name || batch.material_name);
    const key = materialKey(name);
    if (!key) continue;
    const group = groups.get(key) || { _id: `batch-${batch.material_id || key}`, name_cn: name, material_records: [], batches: [] };
    group.batches.push(batch);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const quantities = new Map();
    for (const batch of group.batches) {
      const spec = specification(batch.spec), unit = clean(batch.unit), storage_room = clean(batch.storage_room);
      const key = JSON.stringify([specificationKey(spec), roomKey(batch), unit]);
      const item = quantities.get(key) || { spec, unit, storage_room, quantity: 0 };
      item.quantity += quantity(batch.current_qty);
      quantities.set(key, item);
    }
    return { ...group,
      batch_codes: codes(group.batches),
      storage_locations: locations(group.batches),
      stock_by_spec: [...quantities.values()].map(item => ({ ...item, quantity: rounded(item.quantity) })),
    };
  }).sort((a, b) => a.name_cn.localeCompare(b.name_cn, 'zh-CN'));
}
