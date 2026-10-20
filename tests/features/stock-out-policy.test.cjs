const test = require('node:test');
const assert = require('node:assert/strict');
let policy, buildExportTable;
test.before(async () => {
  policy = await import('../../src/features/stock/stock-out-policy.js');
  ({ buildExportTable } = await import('../../src/shared/lib/export-columns.js'));
});
const student = { username: 'student-one', display_name: '示例学生（示例教师）', account_type: 'student' };
const batch = { _id: 23, purchaser_username: 'student-one', purchaser_name: '示例学生（示例教师）', created_by_username: 'student-other', related_purchase_record_id: 12, related_purchase_id: 'PUR-SAMPLE-12' };
const purchases = [{ _id: 12, public_id: 'PUR-SAMPLE-12', applicant_username: 'student-other', applicant_name: '另一学生' }];
const request = overrides => ({ _id: 34, batch_id: '23', applicant_username: 'student-one', purchaser_username: 'student-one', status: '待采购人审批', ...overrides });

test('self-purchaser exemption uses exact login identity rather than decorated display names', () => {
  assert.equal(policy.batchIsPurchaserSelf(batch, student, purchases), true);
  assert.equal(policy.batchIsPurchaserSelf({ ...batch, purchaser_username: 'student-other', purchaser_name: student.display_name }, student, purchases), false);
  assert.equal(policy.batchIsPurchaserSelf({ ...batch, purchaser_username: 'student-one ' }, student, purchases), false);
  assert.equal(policy.batchIsPurchaserSelf({ purchaser_name: student.display_name }, student), false);
  assert.equal(policy.batchIsPurchaserSelf(batch, null), false);
});

test('batch owner falls back through exact source ID, public ID and builder without accidental undefined matches', () => {
  const legacy = { _id: 23, related_purchase_record_id: '12', related_purchase_id: 'PUR-OTHER', created_by_username: 'builder' };
  assert.equal(policy.batchPurchaser(legacy, purchases).username, 'student-other');
  assert.equal(policy.batchPurchaser({ ...legacy, related_purchase_record_id: 999, related_purchase_id: 'PUR-SAMPLE-12' }, purchases).username, 'student-other');
  assert.equal(policy.batchPurchaser({ ...legacy, related_purchase_record_id: 999, related_purchase_id: 'unknown' }, purchases).username, 'builder');
  assert.equal(policy.batchPurchaser({ created_by_username: 'builder' }, [{ applicant_username: 'wrong' }]).username, 'builder');
  assert.equal(policy.batchPurchaser({ related_purchase_record_id: '', related_purchase_id: '', created_by_username: 'builder' }, [{ _id: '', public_id: '', applicant_username: 'wrong' }]).username, 'builder');
  assert.deepEqual(policy.batchPurchaser(null), { username: '', name: '' });
});

test('pending historical self request can complete only as original student and current purchaser', () => {
  assert.equal(policy.canCompleteStockRequest(request(), student, [batch], purchases), true);
  assert.equal(policy.canCompleteStockRequest(request(), { ...student, username: 'student-other' }, [batch], purchases), false);
  assert.equal(policy.canCompleteStockRequest(request(), { ...student, account_type: 'admin' }, [batch], purchases), false);
  assert.equal(policy.canCompleteStockRequest(request(), student, [], purchases), false);
  assert.equal(policy.canCompleteStockRequest(request(), student, [{ ...batch, purchaser_username: 'student-other' }], purchases), false);
  assert.equal(policy.canCompleteStockRequest(request({ purchaser_username: 'student-other' }), student, [batch], purchases), false);
});

test('approved requests retain completion and rejected, withdrawn or completed requests never enable it', () => {
  assert.equal(policy.canCompleteStockRequest(request({ status: '已同意待出库', purchaser_username: 'student-other' }), student, [batch], purchases), true);
  for (const status of ['已驳回', '已撤回', '已出库']) assert.equal(policy.canCompleteStockRequest(request({ status }), student, [batch], purchases), false);
});

test('Excel presents backend exemption separately without fabricating approval or losing existing history', () => {
  const evidence = { purchaser_approval_exempt: true, purchaser_approval_exempt_reason: 'purchaser_self' };
  assert.equal(policy.stockApprovalExemptionText(evidence), '采购人本人，无需审批');
  assert.equal(policy.stockApprovalExemptionText({ ...evidence, purchaser_approval_exempt: 'true' }), '');
  assert.equal(policy.stockApprovalExemptionText({ ...evidence, purchaser_approval_exempt_reason: 'other' }), '');
  for (const kind of ['stock', 'stockRequests']) {
    const row = { ...request(), ...evidence, material_name: '示例材料', status: '已出库' };
    const before = structuredClone(row), table = buildExportTable(kind, [row]);
    assert(table.headers.includes('出库审批说明')); assert(JSON.stringify(table).includes('采购人本人，无需审批'));
    assert(!table.headers.includes('审批人')); assert(!table.headers.includes('采购人审批人')); assert(!table.headers.includes('审批时间'));
    assert.deepEqual(row, before);
    const reviewed = kind === 'stock' ? { ...row, purchaser_approved_by: '原审批人', purchaser_approved_at: '2026-10-14T01:00:00Z' } : { ...row, reviewed_by: '原审批人', reviewed_at: '2026-10-14T01:00:00Z' };
    const retained = buildExportTable(kind, [reviewed]);
    assert(JSON.stringify(retained).includes('原审批人')); assert(JSON.stringify(retained).includes('采购人本人，无需审批'));
    assert(!buildExportTable(kind, [{ ...row, purchaser_approval_exempt: false }]).headers.includes('出库审批说明'));
  }
});
