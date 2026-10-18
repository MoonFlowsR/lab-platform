import { canonicalMaterialName, materialKey } from '../../shared/lib/dropdown-normalize.js';

const categories = new Set(['试剂原料', '耗材']);
const categorySelections = new WeakMap();
const nameKey = row => materialKey(canonicalMaterialName(row.name_cn || row.name || row.material_name));
export const inventoryCategoryOptions = [{ value: '', label: '全部' }, { value: '试剂原料', label: '试剂原料' }, { value: '耗材', label: '耗材' }];

export function normalizeInventoryCategory(value) {
  const category = String(value ?? '').normalize('NFKC').trim();
  return category === '原材料' ? '试剂原料' : category;
}
const knownCategory = value => {
  const category = normalizeInventoryCategory(value);
  return categories.has(category) ? category : '';
};

// Immutable snapshots keep the same arrays between searches; reuse each category selection.
export function filterInventoryCategory(materials = [], batches = [], selected = '') {
  let batchSelections = categorySelections.get(materials);
  if (!batchSelections) { batchSelections = new WeakMap(); categorySelections.set(materials, batchSelections); }
  let selections = batchSelections.get(batches);
  if (!selections) {
    selections = new Map([['', { materials, batches }]]);
    batchSelections.set(batches, selections);
  }
  const category = normalizeInventoryCategory(selected);
  if (selections.has(category)) return selections.get(category);

  const materialById = new Map(), categoriesByName = new Map();
  for (const row of materials) {
    if (row.deleted_at) continue;
    materialById.set(String(row._id), row);
    const key = nameKey(row), ownCategory = knownCategory(row.category) || knownCategory(row.purchase_category);
    if (key && ownCategory) {
      const names = categoriesByName.get(key) || new Set();
      names.add(ownCategory); categoriesByName.set(key, names);
    }
  }
  const batchCategory = row => {
    const explicit = knownCategory(row.purchase_category) || knownCategory(row.category);
    if (explicit) return explicit;
    const material = materialById.get(String(row.material_id));
    const related = knownCategory(material?.category) || knownCategory(material?.purchase_category);
    if (related) return related;
    const named = categoriesByName.get(nameKey(row));
    return named?.size === 1 ? [...named][0] : '';
  };
  const selectedBatches = batches.filter(row => !row.deleted_at && batchCategory(row) === category);
  const selectedIds = new Set(selectedBatches.map(row => String(row.material_id)));
  const batchIds = new Set(batches.filter(row => !row.deleted_at).map(row => String(row.material_id)));
  const selectedMaterials = materials.filter(row => !row.deleted_at && (selectedIds.has(String(row._id))
    || (!batchIds.has(String(row._id)) && (knownCategory(row.category) || knownCategory(row.purchase_category)) === category)));
  const result = { materials: selectedMaterials, batches: selectedBatches };
  selections.set(category, result);
  return result;
}
