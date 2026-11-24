const assert = require('node:assert/strict');
const test = require('node:test');

test('batch numbers identify active stock across materials, dates and units', async () => {
  const { stockBatchChoices } = await import('../../src/features/stock/batch-picker.js');
  const first = { _id: 1, batch_code: 'BATCH-20261012-000123', material_name: '示例原料甲', spec: '100 mL', storage_room: 'A101', current_qty: 0, unit: '瓶' };
  const second = { ...first, _id: 2, batch_code: '', public_id: 'BATCH-261012-000124', material_name: '示例原料乙', current_qty: 7, unit: '袋' };
  const deleted = { ...second, _id: 3, public_id: 'BATCH-261012-000125', deleted_at: '2026-10-12' };
  const { options, resolveInput } = stockBatchChoices([first, second, deleted]);
  assert.deepEqual(options.map(row => [row.value, row.label]), [['1','BATCH-261012-000123'], ['2','BATCH-261012-000124']]);
  assert.match(options[0].detail, /示例原料甲.*库存 0 瓶/);
  for (const text of ['BATCH-261012-000123', '  batch-20261012-000123  ', 'ＢＡＴＣＨ－２６１０１２－０００１２３']) assert.equal(resolveInput(text), '1');
  assert.equal(resolveInput('BATCH-20261012-000124'), '2');
  for (const text of ['000123', first.material_name, 'BATCH-261012-000125', '']) assert.equal(resolveInput(text), undefined);
  const duplicate = { ...first, _id: 4, batch_code:'BATCH-261012-000123' };
  assert.equal(stockBatchChoices([first, duplicate]).resolveInput(first.batch_code), null);
});
