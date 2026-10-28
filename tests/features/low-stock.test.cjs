const test = require('node:test');
const assert = require('node:assert/strict');

let inventoryStockIndex, stockGroupFor, lowStockGroups, buildTaskCenter, selectReportData, reportSummaryRows, materialKey;
test.before(async () => {
  ({ inventoryStockIndex, stockGroupFor, lowStockGroups } = await import('../../src/features/inventory/low-stock.js'));
  ({ buildTaskCenter } = await import('../../src/features/tasks/task-model.js'));
  ({ selectReportData } = await import('../../src/features/reports/report-data.js'));
  ({ reportSummaryRows } = await import('../../src/features/dashboard/dashboard-metrics.js'));
  ({ materialKey } = await import('../../src/shared/lib/dropdown-normalize.js'));
});

const batch = (id, overrides = {}) => ({
  _id: String(id), material_id: 'material-a', material_name: '示例材料', spec: 'Mn-200', unit: 'g',
  current_qty: 1, min_qty: 2, storage_room: '101', purchaser_username: 'student-a',
  created_by_username: 'student-a', inbound_by_username: 'teacher-a', created_at: '2026-10-20T02:00:00Z',
  ...overrides,
});
const ids = rows => rows.map(row => String(row._id)).sort();
const snapshot = rows => Object.freeze(rows.map(row => Object.freeze(row)));
const lowSummary = data => {
  const row = reportSummaryRows(data, '2026-10-28').find(([label]) => label.includes('低库存'));
  assert.ok(row, 'the report includes a low-stock summary');
  return row.slice(1);
};

test('empty batches are harmless and stock in another room prevents an alias or specification variant warning', () => {
  assert.deepEqual(inventoryStockIndex().groups, []);
  assert.deepEqual(lowStockGroups([]), []);
  const rows = snapshot([
    batch('empty', { material_name: ' ＳＡＭＰＬＥ ', spec: 'Ｍｎ２００', current_qty: 0, min_qty: 3 }),
    batch('other-room', { material_name: 'sample', spec: 'mn - 200', current_qty: 8, min_qty: 3,
      storage_room: '202', purchaser_username: 'student-b' }),
  ]);
  const index = inventoryStockIndex(rows);
  assert.equal(index.groups.length, 1);
  const group = stockGroupFor(index, rows[0]);
  assert.strictEqual(stockGroupFor(index, rows[1]), group);
  assert.equal(materialKey(group.material_name), materialKey('sample'));
  assert.equal(group.spec, 'Mn-200');
  assert.equal(group.unit, 'g');
  assert.equal(group.current_qty, 8);
  assert.equal(group.min_qty, 3);
  assert.equal(group.low, false);
  assert.deepEqual(ids(group.batches), ['empty', 'other-room']);
  assert.deepEqual(lowStockGroups([rows[0]], index), []);
  const [configuredAlias] = Object.entries(require('../../src/config/dropdown-options.json').purchaseNameAliases || {});
  if (configuredAlias) {
    const [alias, canonical] = configuredAlias;
    const aliasRows = snapshot([
      batch('configured-alias', { material_name: alias, current_qty: 0, min_qty: 3 }),
      batch('configured-canonical', { material_name: canonical, current_qty: 8, min_qty: 3, storage_room: '202' }),
    ]);
    const aliasIndex = inventoryStockIndex(aliasRows);
    assert.equal(aliasIndex.groups.length, 1);
    assert.strictEqual(stockGroupFor(aliasIndex, aliasRows[0]), stockGroupFor(aliasIndex, aliasRows[1]));
    assert.equal(aliasIndex.groups[0].material_name, canonical);
    assert.equal(aliasIndex.groups[0].current_qty, 8);
    assert.equal(aliasIndex.groups[0].low, false);
  }
});

test('a stock group uses the highest threshold once and warns at the inclusive quantity boundary', () => {
  const enough = snapshot([batch('a', { current_qty: 3, min_qty: 3 }), batch('b', { current_qty: 3, min_qty: 4 })]);
  const enoughGroup = inventoryStockIndex(enough).groups[0];
  assert.equal(enoughGroup.current_qty, 6);
  assert.equal(enoughGroup.min_qty, 4);
  assert.equal(enoughGroup.low, false, 'thresholds are not summed to seven');
  const boundary = snapshot(enough.map(row => ({ ...row, current_qty: 2 })));
  const boundaryIndex = inventoryStockIndex(boundary);
  assert.equal(boundaryIndex.groups[0].current_qty, 4);
  assert.equal(boundaryIndex.groups[0].low, true);
  assert.equal(lowStockGroups(boundary, boundaryIndex).length, 1);
});

test('different units, case-sensitive specifications and material identities keep separate stock groups', () => {
  const rows = snapshot([
    batch('g', { spec: '1 M' }), batch('G', { spec: '1 M', unit: 'G' }),
    batch('kg', { spec: '1 M', unit: 'kg' }), batch('lower-spec', { spec: '1 m' }),
    batch('alpha', { spec: '1 M', material_name: 'α-示例材料' }),
    batch('beta', { spec: '1 M', material_name: 'β-示例材料' }),
    batch('other', { spec: '1 M', material_name: '另一材料' }),
  ]);
  const index = inventoryStockIndex(rows);
  assert.equal(index.groups.length, rows.length);
  assert.equal(new Set(rows.map(row => stockGroupFor(index, row).key)).size, rows.length);
  assert(index.groups.every(group => group.current_qty === 1 && group.low));
});

test('unnamed materials use their material ID or individual batch ID instead of sharing an unknown group', () => {
  const rows = snapshot([
    batch('known-a1', { material_name: '', material_id: 'unnamed-a', current_qty: 1 }),
    batch('known-a2', { material_name: undefined, material_id: 'unnamed-a', current_qty: 2 }),
    batch('known-b', { material_name: '', material_id: 'unnamed-b', current_qty: 4 }),
    batch('unknown-a', { material_name: '', material_id: undefined, current_qty: 8 }),
    batch('unknown-b', { material_name: undefined, material_id: undefined, current_qty: 16 }),
  ]);
  const index = inventoryStockIndex(rows);
  assert.equal(index.groups.length, 4);
  const first = stockGroupFor(index, rows[0]);
  assert.strictEqual(stockGroupFor(index, rows[1]), first);
  assert.equal(first.current_qty, 3);
  assert.notStrictEqual(stockGroupFor(index, rows[2]), first);
  assert.notStrictEqual(stockGroupFor(index, rows[3]), stockGroupFor(index, rows[4]));
  assert.equal(stockGroupFor(index, batch('not-indexed', { material_name: '未出现材料' })), undefined);
});

test('deleted rows and invalid numbers do not inflate stock or thresholds, and quantities round to eight decimals', () => {
  const rows = [
    batch('decimal-a', { current_qty: '0.1', min_qty: '0.3' }),
    batch('decimal-b', { current_qty: 0.2, min_qty: 0.1 }),
    batch('invalid', { current_qty: 'invalid', min_qty: 'invalid' }),
    batch('infinite', { current_qty: Infinity, min_qty: Infinity }),
    batch('nan', { current_qty: NaN, min_qty: -5 }),
    batch('negative-infinite', { current_qty: -Infinity, min_qty: -Infinity }),
    batch('deleted', { current_qty: 999, min_qty: 999, deleted_at: '2026-10-21' }),
    batch('precision', { material_name: '精度材料', current_qty: 0.123456789, min_qty: undefined }),
    batch('default', { material_name: '默认阈值材料', current_qty: 'invalid', min_qty: -1 }),
  ];
  const before = structuredClone(rows);
  const index = inventoryStockIndex(rows);
  const group = stockGroupFor(index, rows[0]);
  assert.equal(group.current_qty, 0.3);
  assert.equal(group.min_qty, 0.3);
  assert.equal(group.low, true);
  assert.equal(group.batches.length, 6);
  assert(!ids(group.batches).includes('deleted'));
  const precision = stockGroupFor(index, rows[7]);
  assert.equal(precision.current_qty, 0.12345679);
  assert.equal(precision.min_qty, 0);
  assert.equal(precision.low, false);
  const defaults = stockGroupFor(index, rows[8]);
  assert.equal(defaults.current_qty, 0);
  assert.equal(defaults.min_qty, 0);
  assert.equal(defaults.low, true);
  assert.deepEqual(rows, before);
});

test('selected batches only choose intersecting low groups without changing their complete inventory context', () => {
  const rows = snapshot([
    batch('low-a', { current_qty: 1, min_qty: 5 }), batch('low-b', { current_qty: 4, min_qty: 0, storage_room: '202' }),
    batch('enough-a', { material_name: '充足材料', current_qty: 0, min_qty: 5 }),
    batch('enough-b', { material_name: '充足材料', current_qty: 20, min_qty: 5, storage_room: '202' }),
  ]);
  const index = inventoryStockIndex(rows);
  assert.deepEqual(lowStockGroups([batch('outside-snapshot', { current_qty: 0 })], index), [], 'Only original accessible batch IDs can select a warning group');
  const selected = lowStockGroups([rows[0], rows[0], rows[2]], index);
  assert.equal(selected.length, 1);
  assert.strictEqual(selected[0], stockGroupFor(index, rows[0]));
  assert.equal(selected[0].current_qty, 5);
  assert.deepEqual(ids(selected[0].batches), ['low-a', 'low-b']);
  assert.strictEqual(stockGroupFor(index, { ...rows[0], associated_teacher_names: '教师甲' }), selected[0]);
  assert.deepEqual(lowStockGroups([rows[2]], index), []);
  assert.deepEqual(lowStockGroups([], index), []);
});

test('replacing an immutable inventory snapshot recomputes stock without leaving stale warnings or changing the old index', () => {
  const original = snapshot([batch('one', { current_qty: 1, min_qty: 2 }), batch('two', { current_qty: 1, min_qty: 2 })]);
  const before = inventoryStockIndex(original);
  assert.strictEqual(inventoryStockIndex(original), before);
  assert.equal(lowStockGroups(original, before).length, 1);
  const updated = snapshot(original.map(row => row._id === 'two' ? { ...row, current_qty: 5 } : { ...row }));
  const after = inventoryStockIndex(updated);
  assert.notStrictEqual(after, before);
  assert.equal(after.groups[0].current_qty, 6);
  assert.deepEqual(lowStockGroups(updated, after), []);
  assert.equal(before.groups[0].current_qty, 2);
  assert.equal(before.groups[0].low, true);
});

test('task warnings count low groups while retaining every low-group batch and ID for navigation', () => {
  const rows = snapshot([
    batch('low-empty', { current_qty: 0, min_qty: 5 }), batch('low-stocked', { current_qty: 4, min_qty: 0, storage_room: '202' }),
    batch('low-other', { material_name: '另一低库存材料', current_qty: 0.5, min_qty: 1 }),
    batch('safe-empty', { material_name: '充足材料', current_qty: 0, min_qty: 1 }),
    batch('safe-stocked', { material_name: '充足材料', current_qty: 10, min_qty: 1 }),
    batch('deleted', { material_name: '已删除材料', current_qty: 0, min_qty: 1, deleted_at: '2026-10-21' }),
  ]);
  const center = buildTaskCenter({ account: { username: 'student-a', account_type: 'student' }, batches: rows, today: '2026-10-28' });
  const warning = center.groups.find(group => group.id === 'inventory-low');
  assert.equal(warning.count, 2);
  assert.equal(warning.unit, '组');
  assert.equal(warning.kind, 'warning');
  assert.deepEqual(ids(warning.rows), ['low-empty', 'low-other', 'low-stocked']);
  assert.deepEqual([...warning.ids].sort(), ['low-empty', 'low-other', 'low-stocked']);
  assert(warning.rows.includes(rows[1]), 'a batch above its own threshold remains in its low inventory group');
  assert.equal(center.total, 0);
  assert.equal(center.byModule.materials, undefined);
});

test('report scope and low-stock search retain the full stock index instead of recalculating from filtered batches', () => {
  const rows = snapshot([
    batch('safe-visible', { material_name: '储量充足材料', current_qty: 0, min_qty: 5, remark: '仅筛选空批' }),
    batch('safe-hidden', { material_name: '储量充足材料', current_qty: 12, min_qty: 5, storage_room: '202',
      purchaser_username: 'student-b', created_by_username: 'student-b', inbound_by_username: 'teacher-b', created_at: '2026-10-18T02:00:00Z' }),
    batch('low-visible', { material_name: '库存不足材料', current_qty: 0, min_qty: 5 }),
    batch('low-hidden', { material_name: '库存不足材料', current_qty: 4, min_qty: 0, storage_room: '202',
      purchaser_username: 'student-b', created_by_username: 'student-b', inbound_by_username: 'teacher-b', created_at: '2026-10-18T02:00:00Z' }),
  ]);
  const data = { batches: rows };
  for (const filters of [
    { student: 'student-a' }, { teacher: 'teacher-a' }, { startDate: '2026-10-20', endDate: '2026-10-20' },
  ]) {
    const selected = selectReportData(data, filters);
    assert.deepEqual(ids(selected.batches), ['low-visible', 'safe-visible']);
    assert.ok(selected.inventoryStock, 'selection carries its full inventory index into summary/export');
    assert.equal(stockGroupFor(selected.inventoryStock, selected.batches.find(row => row._id === 'safe-visible')).current_qty, 12);
    assert.deepEqual(lowSummary(selected), [1, '组']);
  }
  const emptyOnly = selectReportData(data, { query: '仅筛选空批' });
  assert.deepEqual(ids(emptyOnly.batches), ['safe-visible']);
  assert.deepEqual(lowSummary(emptyOnly), [0, '组']);
  const lowOnly = selectReportData(data, { query: '低库存' });
  assert.deepEqual(ids(lowOnly.batches), ['low-hidden', 'low-visible']);
  assert.deepEqual(lowSummary(lowOnly), [1, '组']);
  const scopedLow = selectReportData(data, { student: 'student-a', query: '低库存' });
  assert.deepEqual(ids(scopedLow.batches), ['low-visible']);
  assert.equal(stockGroupFor(scopedLow.inventoryStock, scopedLow.batches[0]).current_qty, 4);
  assert.deepEqual(lowSummary(scopedLow), [1, '组']);
});
