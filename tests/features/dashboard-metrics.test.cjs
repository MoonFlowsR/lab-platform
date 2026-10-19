const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let businessMetrics, reportSummaryRows, inventoryMetrics;
before(async () => ({ businessMetrics, reportSummaryRows, inventoryMetrics } = await import('../../src/features/dashboard/dashboard-metrics.js')));

const cases = [
  { status: '待教师审核' }, { status: '已撤回' }, { status: '历史状态' },
  { status: '已通过' }, { status: '已实施' }, { status: '已驳回' }, { status: '需修改' },
  { status: '已完成' }, { status: '已归档' }, { status: '已关闭' },
  { status: '已完成', completion_modified: true },
  { status: '已完成', completion_modified: 'true' },
];
test('work counters use the same four exclusive sections while keeping actionable and financial totals separate', () => {
  const work = ['测试', '加工', '维修'].flatMap(request_type => cases.map(row => ({ ...row, request_type, cost_test: 10, cost_processing: 20, cost_repair: 30 })));
  for (const metric of businessMetrics(work).slice(0, 3)) {
    assert.deepEqual(metric.sections, { pending: 3, reviewed: 4, completed: 4, modified: 1 });
    assert.equal(Object.values(metric.sections).reduce((a, b) => a + b, 0), metric.total);
    assert.equal(metric.pending, 1);
    assert.equal(metric.ready, 2);
    assert.equal(metric.completed, 4, 'actual completion includes modified orders, excludes closed orders');
    const fee = { 测试: 10, 加工: 20, 维修: 30 }[metric.type];
    assert.equal(metric.completedAmount, 4 * fee);
    assert.equal(metric.readyAmount, 2 * fee);
    assert.equal(metric.pendingAmount, fee);
  }
});

test('purchase counts handle closure, legacy inbound, zero final amount and receipt modifications without double-counting', () => {
  const purchases = [
    { status: '待教师审核', estimated_price: 8 }, { status: '已撤回' },
    { status: '待入库', estimated_price: 11 }, { status: '已通过', estimated_price: 12 },
    { status: '已驳回' }, { status: '需修改' },
    { status: '已完成', actual_total_price: 0, estimated_price: 20 },
    { status: '已关闭', received_status: '已入库', actual_total_price: 900 },
    { status: '待入库', received_status: '已入库', estimated_price: 30 },
    { status: '已完成', inbound_modified: true, actual_total_price: 40 },
    { status: '已完成', quantity: 1, actual_received_qty: 2, estimated_price: 50 },
  ];
  const metric = businessMetrics([], purchases)[3];
  assert.deepEqual(metric.sections, { pending: 2, reviewed: 4, completed: 2, modified: 3 });
  assert.equal(metric.total, 11);
  assert.equal(metric.completed, 4);
  assert.equal(metric.completedAmount, 120);
  assert.equal(metric.ready, 2);
  assert.equal(metric.readyAmount, 23);
  assert.equal(metric.pendingAmount, 8);
  const summary = new Map(reportSummaryRows({ purchases }).map(([key, value]) => [key, value]));
  assert.equal(summary.get('采购申请总数'), 11);
  assert.equal(summary.get('采购已完成'), 2);
  assert.equal(summary.get('采购完成时修改'), 3);
  assert.equal(summary.get('采购实际已入库'), 4);
  assert.equal(summary.get('采购已入库金额'), 120);
});

test('empty and filtered inputs do not retain counts from previously selected records', () => {
  for (const metric of businessMetrics()) {
    assert.equal(metric.total, 0);
    assert.deepEqual(metric.sections, { pending: 0, reviewed: 0, completed: 0, modified: 0 });
  }
  const rows = [{ status: '已完成', request_type: '测试', cost_test: 7 }, { status: '已通过', request_type: '测试', cost_test: 9 }];
  assert.equal(businessMetrics(rows.slice(1))[0].completedAmount, 0);
  assert.equal(businessMetrics(rows.slice(0, 1))[0].total, 1);
});

test('inventory counts batches rather than grouped materials; expiry excludes empty and long-term batches', () => {
  const batch = (current_qty, expiry_date, min_qty = 0) => ({ material_name: '示例材料', spec: '示例规格', storage_room: 'A101', current_qty, expiry_date, min_qty });
  const batches = [batch(5, '长期'), batch(0, '2026-01-01'), batch(1, '2026-10-18', 2), batch(5, '2026-10-19'), batch(5, '2026-11-18'), batch(5, '2026-11-19')];
  assert.deepEqual(inventoryMetrics(batches, '2026-10-19'), { total: 6, low: 2, expiring: 2, expired: 1 });
});
