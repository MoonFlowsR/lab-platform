const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let savedOptions, workOptions, platformSettings;
before(async () => {
  ({ savedOptions } = await import('../../src/shared/lib/saved-options.js'));
  ({ workOptions } = await import('../../src/features/work/work-options.js'));
  ({ platformSettings } = await import('../../src/shared/lib/platform-settings.js'));
});

test('all saved storage sources contribute rooms without changing configured defaults or records', () => {
  const records = {
    purchases: [{ storage_room: ' A103 ', status: '已完成' }],
    batches: [{ storage_room: 'A104' }],
    stockTransactions: [{ storage_room: '侧楼试剂柜（上层）' }],
    stockOutRequests: [{ storage_room: 'A105', status: '待审批' }],
  };
  const before = JSON.stringify(records);
  assert.deepEqual(savedOptions(records).storageRooms, [...platformSettings.rooms, 'A103', 'A104', '侧楼试剂柜（上层）', 'A105']);
  assert.equal(JSON.stringify(records), before);
});

test('rooms deduplicate saved values, exclude deleted rows and placeholders, and never parse descriptions', () => {
  const rooms = savedOptions({
    purchases: [{ storage_room: 'A103' }, { storage_room: ' a103 ' }, { storage_room: '__other_room__' }, { storage_room: '其它' }],
    batches: [{ storage_room: '不可见已删除房间', deleted_at: '2026-01-01' }, { storage_location: '说明文字 · 并非房间' }],
    stockTransactions: [{ storage_room: 'Ａ１０３' }, { storage_room: '' }, null],
  }).storageRooms;
  assert.deepEqual(rooms, [...platformSettings.rooms, 'A103']);
});

test('material units combine saved purchasing, inbound, inventory and movement values', () => {
  const units = savedOptions({
    purchases: [{ unit: '自定义袋', actual_received_unit: '自定义箱' }],
    batches: [{ unit: '自定义架' }],
    materials: [{ default_unit: '自定义桶' }],
    stockTransactions: [{ unit: '自定义包' }],
    stockOutRequests: [{ unit: '自定义盘' }],
    materialCatalog: [{ units: ['自定义袋', '自定义瓶'] }],
    units: [{ unit_type: '测试单位', unit_name: '机构不是计量单位' }],
  }).materialUnits;
  for (const unit of ['自定义袋', '自定义箱', '自定义架', '自定义桶', '自定义包', '自定义盘', '自定义瓶']) assert(units.includes(unit), unit);
  assert.equal(units.filter(unit => unit === '自定义袋').length, 1);
  assert(!units.includes('机构不是计量单位'));
});

test('purchasing channels share saved purchases, inventory and purchasing-unit entries only', () => {
  const suppliers = savedOptions({
    purchases: [{ preferred_supplier: '采购保存渠道' }],
    batches: [{ supplier: '建库保存渠道' }, { supplier: '已删除渠道', deleted_at: '2026-01-01' }],
    materialCatalog: [{ suppliers: ['目录保存渠道'] }],
    units: [
      { unit_type: '采购单位', unit_name: '采购单位库渠道' },
      { unit_type: '其他', unit_name: '通用单位库渠道' },
      { unit_type: '测试单位', unit_name: '仅测试机构' },
      { unit_type: '采购单位', unit_name: '删除的单位', deleted_at: '2026-01-01' },
    ],
  }).purchaseSuppliers;
  for (const supplier of ['采购保存渠道', '建库保存渠道', '目录保存渠道', '采购单位库渠道', '通用单位库渠道']) assert(suppliers.includes(supplier), supplier);
  for (const supplier of ['已删除渠道', '仅测试机构', '删除的单位']) assert(!suppliers.includes(supplier), supplier);
});

test('only a newly synchronized saved snapshot extends shared options', () => {
  const snapshot = { purchases: [{ storage_room: 'A103', unit: '保存单位', preferred_supplier: '保存渠道' }] };
  const first = savedOptions(snapshot);
  const draft = { storage_room: '草稿房间', unit: '草稿单位', preferred_supplier: '草稿渠道' };
  assert(!first.storageRooms.includes(draft.storage_room));
  assert(!first.materialUnits.includes(draft.unit));
  assert(!first.purchaseSuppliers.includes(draft.preferred_supplier));
  snapshot.purchases.push(draft);
  const synchronized = savedOptions(snapshot);
  assert(synchronized.storageRooms.includes(draft.storage_room));
  assert(synchronized.materialUnits.includes(draft.unit));
  assert(synchronized.purchaseSuppliers.includes(draft.preferred_supplier));
  assert(!first.storageRooms.includes(draft.storage_room), 'Earlier derived lists remain immutable');
});

test('saved work choices remain available after withdrawal and stay isolated by work type', () => {
  for (const type of ['测试', '加工', '维修']) {
    const other = type === '测试' ? '加工' : '测试';
    const history = [
      { request_type: type, status: '已撤回', work_content: '保存名称' + type, external_unit: '保存渠道' + type, workload_unit: '保存计量' + type },
      { request_type: other, work_content: '其它类型名称', external_unit: '其它类型渠道', workload_unit: '其它类型计量' },
      { request_type: type, work_content: '已删除名称', external_unit: '已删除渠道', workload_unit: '已删除计量', deleted_at: '2026-01-01' },
    ];
    const options = workOptions(type, history);
    assert(options.names.includes('保存名称' + type));
    assert(options.channels.includes('保存渠道' + type));
    assert(options.billing.includes('保存计量' + type));
    assert(!options.names.includes('其它类型名称'));
    assert(!options.channels.includes('其它类型渠道'));
    assert(!options.billing.includes('其它类型计量'));
    assert(!options.names.includes('已删除名称'));
    assert(!options.channels.includes('已删除渠道'));
    assert(!options.billing.includes('已删除计量'));
  }
});
