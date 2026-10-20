const test = require('node:test');
const assert = require('node:assert/strict');
let filterInventoryCategory, normalizeInventoryCategory, summarizeMaterials, groupMaterialBatches, buildExportTable, recordInDateRange, recordMatchesStudent, containsQuery, recordMatchesTeacher, createTeacherContext, inventoryMetrics, expiryWarnings;
test.before(async () => {
  ({ filterInventoryCategory, normalizeInventoryCategory } = await import('../../src/features/inventory/inventory-category.js'));
  ({ summarizeMaterials, groupMaterialBatches } = await import('../../src/features/inventory/material-summary.js'));
  ({ buildExportTable } = await import('../../src/shared/lib/export-columns.js'));
  ({ recordInDateRange } = await import('../../src/shared/lib/module-date.js'));
  ({ recordMatchesStudent } = await import('../../src/shared/lib/student-filter.js'));
  ({ containsQuery } = await import('../../src/app/formatters.js'));
  ({ recordMatchesTeacher, createTeacherContext } = await import('../../src/shared/lib/teacher-filter.js'));
  ({ inventoryMetrics } = await import('../../src/features/dashboard/dashboard-metrics.js'));
  ({ expiryWarnings } = await import('../../src/features/reports/report-data.js'));
});
const master = (id, category = '试剂原料', name = `示例材料${id}`) => ({ _id: id, name_cn: name, category, created_at: '2026-10-14T00:00:00Z' });
const batch = (id, material, overrides = {}) => ({ _id: id, material_id: material._id, material_name: material.name_cn, purchase_category: material.category, batch_code: `BATCH-SAMPLE-${id}`, current_qty: 5, min_qty: 0, unit: 'g', spec: '无', storage_room: 'A101', expiry_date: '长期', created_at: '2026-10-14T00:00:00Z', ...overrides });

test('all inventory retains original arrays and records including unclassified legacy data', () => {
  const materials = [master(1), master(2, '耗材'), master(3, '')], batches = materials.map((row, i) => batch(i, row));
  const before = structuredClone({ materials, batches });
  const selected = filterInventoryCategory(materials, batches);
  assert.strictEqual(selected.materials, materials); assert.strictEqual(selected.batches, batches);
  assert.deepEqual({ materials, batches }, before);
  assert.equal(normalizeInventoryCategory(' 原材料 '), '试剂原料');
});
test('reagent and consumable selections do not leak the other category or unknown data', () => {
  const materials = [master(1), master(2, '耗材'), master(3, '')], batches = materials.map((row, i) => batch(i, row));
  assert.deepEqual(filterInventoryCategory(materials, batches, '耗材').batches.map(row => row._id), [1]);
  assert.deepEqual(filterInventoryCategory(materials, batches, '试剂原料').batches.map(row => row._id), [0]);
  assert.deepEqual(filterInventoryCategory(materials, batches, '耗材').materials.map(row => row._id), [2]);
});
test('legacy category and missing batch category use valid associated master fields by string ID', () => {
  const materials = [master(1, '原材料'), master(2, '耗材')];
  const batches = [batch(1, materials[0]), batch(2, materials[0], { material_id: '1', purchase_category: '' }), batch(3, materials[1], { purchase_category: '' })];
  assert.deepEqual(filterInventoryCategory(materials, batches, '试剂原料').batches.map(row => row._id), [1, 2]);
  assert.deepEqual(filterInventoryCategory(materials, batches, '耗材').batches.map(row => row._id), [3]);
});
test('batch explicit category overrides master and cross-category material totals include only selected batches', () => {
  const material = master(1), batches = [batch(1, material, { current_qty: 3 }), batch(2, material, { purchase_category: '耗材', current_qty: 7 })];
  const consumables = filterInventoryCategory([material], batches, '耗材');
  assert.deepEqual(consumables.materials.map(row => row._id), [1]);
  const summary = summarizeMaterials(consumables.materials, consumables.batches)[0];
  assert.equal(summary.stock_by_spec[0].quantity, 7); assert.deepEqual(summary.batch_codes, ['BATCH-SAMPLE-2']);
  assert.equal(groupMaterialBatches(consumables.batches)[0].current_qty, 7);
  const onlyConsumableBatch = filterInventoryCategory([material], [batches[1]], '试剂原料');
  assert.equal(onlyConsumableBatch.materials.length, 0);
});
test('missing IDs can use a unique canonical-name category but ambiguous names are not guessed', () => {
  const materials = [master(1, '耗材', '示例唯一材料'), master(2, '试剂原料', '示例同名材料'), master(3, '耗材', '示例同名材料')];
  const batches = [{ _id: 4, material_name: '示例唯一材料' }, { _id: 5, material_name: '示例同名材料' }];
  assert.deepEqual(filterInventoryCategory(materials, batches, '耗材').batches.map(row => row._id), [4]);
  assert.equal(filterInventoryCategory(materials, batches, '试剂原料').batches.length, 0);
});
test('unbatched master fallback follows the selected category and preserves no-batch records', () => {
  const materials = [master(1), master(2, '耗材'), master(3, '')];
  assert.deepEqual(filterInventoryCategory(materials, [], '耗材').materials.map(row => row._id), [2]);
  assert.deepEqual(filterInventoryCategory(materials, [], '试剂原料').materials.map(row => row._id), [1]);
});
test('category composes with student, teacher, date and text filters without changing evidence references', () => {
  const materials = [master(1), master(2, '耗材')];
  const base = { purchaser_username: '示例学生甲', responsible_teacher_username: '示例导师', inbound_by_username: '示例教师', storage_location: 'A101 · 柜甲', inbound_photo_attachment_id: 'sample-photo' };
  const batches = [batch(1, materials[1], base), batch(2, materials[0], base), batch(3, materials[1], { ...base, purchaser_username: '示例学生乙' }), batch(4, materials[1], { ...base, created_at: '2026-09-01T00:00:00Z' }), batch(5, materials[1], { ...base, inbound_by_username: '其它教师' }), batch(6, materials[1], { ...base, storage_location: '柜乙' })];
  const context = createTeacherContext({ batches });
  const category = filterInventoryCategory(materials, batches, '耗材');
  const scope = category.batches.filter(row => recordMatchesStudent(row, '示例学生甲', 'materials') && recordMatchesTeacher(row, '示例教师', 'materials', context) && recordInDateRange(row, { mode: 'custom', start: '2026-10-01', end: '2026-10-31' }) && containsQuery(row, '柜甲'));
  assert.deepEqual(scope.map(row => row._id), [1]); assert.strictEqual(scope[0], batches[0]);
  assert.equal(scope[0].inbound_photo_attachment_id, 'sample-photo');
});
test('warnings and all three inventory exports contain only the category selection', () => {
  const materials = [master(1), master(2, '耗材')], batches = [batch(1, materials[0], { current_qty: 0, min_qty: 1 }), batch(2, materials[1], { current_qty: 1, min_qty: 2, expiry_date: '2020-01-01' })];
  const chosen = filterInventoryCategory(materials, batches, '耗材');
  const metrics = inventoryMetrics(chosen.batches);
  assert.equal(metrics.total, 1); assert.equal(metrics.low, 1); assert.equal(metrics.expired, 1);
  assert.deepEqual(expiryWarnings(chosen.batches, '2026-10-14').map(row => row._id), [2]);
  const rows = [['materials', summarizeMaterials(chosen.materials, chosen.batches)], ['batches', chosen.batches], ['inventorySummary', groupMaterialBatches(chosen.batches)]];
  for (const [kind, records] of rows) { const table = buildExportTable(kind, records); assert.equal(table.rowCount, 1); assert(JSON.stringify(table).includes('示例材料2')); assert(!JSON.stringify(table).includes('示例材料1')); }
});
test('cached category selections reuse immutable arrays and refresh when a new snapshot arrives', () => {
  const materials = [master(1), master(2, '耗材')], batches = materials.map((row, index) => batch(index, row));
  const first = filterInventoryCategory(materials, batches, '耗材');
  assert.strictEqual(filterInventoryCategory(materials, batches, '耗材'), first);
  filterInventoryCategory(materials, batches, '试剂原料');
  assert.strictEqual(filterInventoryCategory(materials, batches, '耗材'), first);
  const refreshed = [...batches, batch(3, materials[1])];
  assert.equal(filterInventoryCategory(materials, refreshed, '耗材').batches.length, 2);
  assert.equal(first.batches.length, 1);
});
