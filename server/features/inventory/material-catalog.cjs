const options = require('../../../src/config/dropdown-options.json');
const key = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, '');
const aliases = new Map(Object.entries(options.purchaseNameAliases || {}).map(([formula, name]) => [key(formula), name]));
const nameOf = value => aliases.get(key(value)) || String(value || '').trim();
const unique = values => [...new Map(values.filter(Boolean).map(value => [key(value), String(value).trim()])).values()];

module.exports = function buildMaterialCatalog(listRecords) {
  const items = new Map();
  function add(name, categories, specifications = [], suppliers = [], units = []) {
    name = nameOf(name); if (!name) return;
    const id = key(name), before = items.get(id) || { name, category: '', categories: [], specifications: [], suppliers: [], units: [] };
    const validCategories = categories.map(value => value === '原材料' ? '试剂原料' : value).filter(value => ['试剂原料', '耗材'].includes(value));
    before.categories = unique([...before.categories, ...(validCategories.length ? validCategories : before.categories.length ? [] : ['试剂原料', '耗材'])]);
    before.category = before.categories[0] || '试剂原料';
    before.specifications = unique([...before.specifications, ...specifications]);
    before.suppliers = unique([...before.suppliers, ...suppliers]);
    before.units = unique([...before.units, ...units]);
    items.set(id, before);
  }
  for (const row of options.purchaseItems) {
    const categories = row.categories || [row.category];
    add(row.name, categories, row.specifications, categories.flatMap(category => options.purchaseSuppliers[category] || []));
  }
  for (const row of listRecords('lab_purchase_requests', row => !row.deleted_at)) add(row.material_name, [row.purchase_category], [row.specification], [row.preferred_supplier], [row.unit]);
  for (const row of listRecords('lab_materials', row => !row.deleted_at)) add(row.name_cn || row.name, [row.category], [], [], [row.default_unit]);
  for (const row of listRecords('lab_material_batches', row => !row.deleted_at)) add(row.material_name, [row.purchase_category], [row.spec], [row.supplier], [row.unit]);
  return [...items.values()];
};
