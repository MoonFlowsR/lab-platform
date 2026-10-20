const test = require('node:test');
const assert = require('node:assert/strict');
let groupMaterialBatches, summarizeMaterials;
test.before(async () => { ({ groupMaterialBatches, summarizeMaterials } = await import('../../src/features/inventory/material-summary.js')); });

const batch = (id, overrides = {}) => ({
  _id: String(id), material_id: 'material', material_name: '示例材料', spec: 'Mn-200', storage_room: 'A102', unit: 'g',
  current_qty: 2, batch_code: `BATCH-${id}`, storage_detail: '示例柜', storage_location: 'A102 · 示例柜',
  created_at: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`, updated_at: '2026-10-13T00:00:00Z',
  inbound_photo_attachment_id: `photo-${id}`, purchaser_username: `sample-owner-${id}`, ...overrides,
});

test('same material, specification, room and unit aggregate while retaining original batches and evidence', () => {
  const source = [batch(1, { spec: 'Ｍｎ２００', current_qty: 0.1 }), batch(2, { spec: 'mn - 200', current_qty: 0.2 })];
  const before = structuredClone(source);
  const groups = groupMaterialBatches(source);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].spec, 'Mn-200');
  assert.equal(groups[0].current_qty, 0.3);
  assert.deepEqual(groups[0].batches.map(row => row._id), ['2', '1']);
  assert.strictEqual(groups[0].batches[0], source[1]);
  assert.deepEqual(groups[0].batches.map(row => row.inbound_photo_attachment_id), ['photo-2', 'photo-1']);
  assert.deepEqual(groups[0].batches.map(row => row.purchaser_username), ['sample-owner-2', 'sample-owner-1']);
  assert.deepEqual(source, before);
  assert.equal(groupMaterialBatches([...source].reverse())[0]._id, groups[0]._id);
});

test('different rooms, units and specifications stay separate without unit or particle-size conversions', () => {
  const source = [batch(1), batch(2, { storage_room: 'A101' }), batch(3, { unit: 'kg' }), batch(4, { unit: 'mL' }),
    batch(5, { spec: 'Mn-400' }), batch(6, { spec: '500nm' }), batch(7, { spec: '0.5μm' }), batch(8, { spec: '无' })];
  assert.equal(groupMaterialBatches(source).length, 8);
  const summary = summarizeMaterials([{ _id: 'material', name_cn: '示例材料' }], source)[0];
  assert.equal(summary.stock_by_spec.length, 8);
  assert.deepEqual(summary.stock_by_spec.filter(row => row.spec === 'Mn-200' && row.unit === 'g').map(row => row.storage_room).sort(), ['A101', 'A102']);
  assert.equal(summary.batch_codes.length, 8);
  assert.equal(summary.storage_locations.length, 1);
});

test('alpha and beta phases stay separate, and groups and child batches show newest creation first', () => {
  const source = [batch(1, { material_name: 'α-示例材料' }), batch(4, { material_name: 'β-示例材料' }),
    batch(2, { material_name: 'α-示例材料' }), batch(3, { deleted_at: '2026-10-13' })];
  const groups = groupMaterialBatches(source);
  assert.deepEqual(groups.map(row => row.material_name), ['β-示例材料', 'α-示例材料']);
  assert.equal(groups[0].current_qty, 2);
  assert.equal(groups[1].current_qty, 4);
  assert.equal(groups[1].latest_created_at, source[2].created_at);
  assert.deepEqual(groups[1].batches.map(row => row._id), ['2', '1']);
});

test('missing room is not guessed and different legacy locations do not combine', () => {
  const groups = groupMaterialBatches([batch(1, { storage_room: '', storage_location: '示例库房甲' }),
    batch(2, { storage_room: '', storage_location: '示例库房乙' })]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(row => row.storage_room === ''));
});

test('multi-space specification variants normalize while blank specifications remain unknown', () => {
  const groups = groupMaterialBatches([batch(1, { spec: '500   nm' }), batch(2, { spec: '500 nm' }),
    batch(3, { spec: '' }), batch(4, { spec: '无' })]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(row => [row.spec, row.current_qty]).sort(), [['500 nm', 4], ['无', 4]].sort());
});


test('case-sensitive specifications and unknown rooms do not accidentally merge', () => {
  const rows = [batch(1,{spec:'1 M'}),batch(2,{spec:'1 m'}),batch(3,{storage_room:'',storage_location:''}),batch(4,{storage_room:'',storage_location:''})];
  assert.equal(groupMaterialBatches(rows).length,4);
});


test('summary Excel exports all filtered groups and labels room and unit', async () => {
  const { buildExportTable } = await import('../../src/shared/lib/export-columns.js');
  const rows = [batch(1),batch(2,{current_qty:3}),batch(3,{storage_room:'A101'}),batch(4,{unit:'kg'})];
  const groups = groupMaterialBatches(rows);
  const result = buildExportTable('inventorySummary',groups);
  assert.equal(result.rowCount,3);
  assert.deepEqual(result.headers,['材料名称','规格','存放房间','库存合计','计量单位','批次数','批次编号']);
  assert.ok(JSON.stringify(result).includes('A102'));
  assert.ok(JSON.stringify(result).includes('A101'));
  const materials = summarizeMaterials([{_id:'material',name_cn:'示例材料'}],rows);
  const detail = buildExportTable('materials',materials);
  assert.ok(JSON.stringify(detail).includes('Mn-200 · A102'));
  assert.ok(JSON.stringify(detail).includes('Mn-200 · A101'));
});


test('inventory search matches grouped totals and aliases but preserves individual-field filtering', async () => {
  const { searchMaterialBatches } = await import('../../src/features/inventory/material-summary.js');
  const match = (row, query) => JSON.stringify(row).includes(query);
  const rows = [batch(1,{material_name:'示例材料（示例别名）',current_qty:20}),batch(2,{material_name:'示例材料（示例别名）',current_qty:30})];
  assert.equal(searchMaterialBatches(rows,'50',match).length,2);
  assert.equal(searchMaterialBatches(rows,'示例别名',match).length,2);
  assert.deepEqual(searchMaterialBatches(rows,'sample-owner-1',match).map(row => row._id),['1']);
  assert.equal(searchMaterialBatches(rows,'不存在',match).length,0);
  assert.strictEqual(searchMaterialBatches(rows,'',match),rows);
});
