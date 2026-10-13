import { canonicalMaterialName, materialKey } from './dropdown-normalize.js';

// Inventory amounts are comparable only within the same specification and unit.
export function summarizeMaterials(materials = [], batches = []) {
  const groups = new Map();
  for (const row of materials) {
    const name = canonicalMaterialName(row.name_cn || row.name);
    const key = materialKey(name);
    if (!key || row.deleted_at) continue;
    const group = groups.get(key) || { ...row, name_cn: name, material_records: [], batches: [] };
    group.material_records.push(row);
    groups.set(key, group);
  }
  for (const batch of batches) {
    if (batch.deleted_at) continue;
    const material = materials.find(row => String(row._id) === String(batch.material_id));
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
      const spec = String(batch.spec || '').trim() || '无', unit = String(batch.unit || '').trim();
      const key = JSON.stringify([spec, unit]);
      const item = quantities.get(key) || { spec, unit, quantity: 0 };
      item.quantity += Number(batch.current_qty) || 0;
      quantities.set(key, item);
    }
    return { ...group,
      batch_codes: [...new Set(group.batches.map(batch => batch.batch_code || batch.public_id).filter(Boolean))],
      storage_locations: [...new Set(group.batches.map(batch => batch.storage_location || [batch.storage_room, batch.storage_detail].filter(Boolean).join(" · ")).filter(Boolean))],
      stock_by_spec: [...quantities.values()].map(item => ({ ...item, quantity: Number(item.quantity.toFixed(8)) })),
    };
  }).sort((a, b) => a.name_cn.localeCompare(b.name_cn, 'zh-CN'));
}
