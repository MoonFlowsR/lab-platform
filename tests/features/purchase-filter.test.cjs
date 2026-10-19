const test = require('node:test'), assert = require('node:assert/strict');
test('purchase supplier options deduplicate existing channels and selection matches the complete supplier', async () => {
  const { purchaseSupplierOptions, matchesPurchaseSupplier } = await import('../../src/features/purchases/purchase-filter.js');
  const rows = [{ preferred_supplier: '示例供应商' }, { preferred_supplier: ' 示例供应商 ' }, { preferred_supplier: '示例供应商分店' }, {}, { preferred_supplier: '已删除单位', deleted_at: '2026-01-01' }];
  assert.deepEqual(purchaseSupplierOptions(rows), ['示例供应商', '示例供应商分店']);
  assert.equal(rows.filter(row => matchesPurchaseSupplier(row, '示例供应商')).length, 2);
  assert.equal(matchesPurchaseSupplier({ preferred_supplier: '示例供应商分店', remark: '示例供应商' }, '示例供应商'), false);
  assert.equal(matchesPurchaseSupplier({}, ''), true);
  assert.equal(matchesPurchaseSupplier({}, '示例供应商'), false);
});
