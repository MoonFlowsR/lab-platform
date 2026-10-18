const test = require('node:test');
const assert = require('node:assert/strict');
let splitRequestSections, splitReviewedWorkSections;
test.before(async () => {
  ({ splitRequestSections, splitReviewedWorkSections } = await import('../../src/shared/lib/request-sections.js'));
});

const row = (id, status, extra = {}) => ({ _id: id, status, request_type: '测试', ...extra });
const ids = rows => rows.map(item => item._id);

test('student test sections keep approved work ongoing until final confirmation and separate only completed changes', () => {
  const rows = [
    row(1, '待教师审核'), row(2, '已通过'), row(3, '已驳回'), row(4, '需修改'), row(5, '已撤回'),
    row(6, '已关闭'), row(7, '已完成'), row(8, '已归档'),
    row(9, '已完成', { completion_modified: true }), row(10, '已归档', { completion_modified: true }),
  ];
  const sections = splitReviewedWorkSections(rows, { manager: false });
  assert.deepEqual(ids(sections.ongoing), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(sections.history), [6, 7, 8]);
  assert.deepEqual(ids(sections.modified), [9, 10]);
});

test('teacher and administrator default sections preserve pending-only review queue and reviewed history', () => {
  const rows = [
    row(1, '待教师审核'), row(2, '已通过'), row(3, '已驳回'), row(4, '需修改'), row(5, '已撤回'),
    row(6, '已关闭'), row(7, '已完成'), row(8, '已归档'), row(9, '已完成', { completion_modified: true }),
  ];
  const sections = splitReviewedWorkSections(rows);
  assert.deepEqual(ids(sections.ongoing), [1]);
  assert.deepEqual(ids(sections.history), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(ids(sections.modified), [9]);
  assert.deepEqual(splitReviewedWorkSections(rows, { manager: true }), sections);
});

test('red section requires a genuine completion and boolean modification marker, not stale or string flags', () => {
  const rows = [
    row(1, '已通过', { completion_modified: true }), row(2, '待教师审核', { completion_modified: true }),
    row(3, '已关闭', { completion_modified: true }), row(4, '已驳回', { completion_modified: true }),
    row(5, '已完成', { completion_modified: 'true' }), row(6, '已完成', { completion_modified: 1 }),
    row(7, '已完成', { completion_modified: false }), row(8, '已完成'),
    row(9, '已完成', { completion_modified: true }),
  ];
  const student = splitReviewedWorkSections(rows, { manager: false });
  assert.deepEqual(ids(student.ongoing), [1, 2, 4]);
  assert.deepEqual(ids(student.history), [3, 5, 6, 7, 8]);
  assert.deepEqual(ids(student.modified), [9]);
  const manager = splitReviewedWorkSections(rows);
  assert.deepEqual(ids(manager.ongoing), [2]);
  assert.deepEqual(ids(manager.modified), [9]);
  assert(manager.history.includes(rows[0]), 'approved work with a stale flag must remain in reviewed history');
});

test('partitioning preserves the already-filtered input scope, every row identity, field, and relative order', () => {
  const rows = Object.freeze([
    Object.freeze(row(31, '已完成', { completion_modified: true, applicant_username: 'student-a', cost_test: 220, completion_changes: Object.freeze([]) })),
    Object.freeze(row(12, '已通过', { applicant_username: 'student-b', cost_test: 80 })),
    Object.freeze(row(24, '已关闭', { applicant_username: 'student-a', cost_test: 50 })),
    Object.freeze(row(18, '已归档', { completion_modified: true, applicant_username: 'student-b', cost_test: 130 })),
    Object.freeze(row(19, '已完成', { applicant_username: 'student-a', cost_test: 95 })),
  ]);
  const snapshot = JSON.stringify(rows);
  for (const manager of [false, true]) {
    const sections = splitReviewedWorkSections(rows, { manager });
    const shown = Object.values(sections).flat();
    assert.equal(shown.length, rows.length);
    assert.equal(new Set(shown).size, rows.length, 'a work order must appear in exactly one section');
    for (const item of rows) assert(shown.includes(item), 'row objects must be preserved without cloning identity fields');
    for (const part of Object.values(sections)) assert.deepEqual(part, rows.filter(item => part.includes(item)));
    assert.equal(JSON.stringify(rows), snapshot);
  }
  const mine = [rows[0], rows[2], rows[4]];
  assert.deepEqual(Object.values(splitReviewedWorkSections(mine, { manager: false })).flat().map(item => item.applicant_username), ['student-a', 'student-a', 'student-a']);
});

test('student processing sections separate completed changes while approved unfinished work stays ongoing', () => {
  const approved = row(1, '已通过', { request_type: '加工', completion_modified: true });
  const modified = row(2, '已完成', { request_type: '加工', completion_modified: true });
  const closed = row(3, '已关闭', { request_type: '加工', completion_modified: true });
  const archived = row(4, '已归档', { request_type: '加工', completion_modified: true });
  const unchanged = row(5, '已完成', { request_type: '加工', completion_modified: false });
  const sections = splitReviewedWorkSections([approved, modified, closed, archived, unchanged], { manager: false });
  assert.deepEqual(sections, { ongoing: [approved], history: [closed, unchanged], modified: [modified, archived] });
});

test('purchase completion and manager review classification remain independent from work completion changes', () => {
  const rows = [
    row(1, '待教师审核'), row(2, '待入库'), row(3, '已驳回'), row(4, '已完成'), row(5, '已关闭'),
    row(6, '待入库', { received_status: '已入库' }), row(7, '已归档'),
  ];
  const student = splitRequestSections(rows, { purchase: true });
  assert.deepEqual(ids(student.ongoing), [1, 2, 3]);
  assert.deepEqual(ids(student.history), [4, 5, 6, 7]);
  const manager = splitRequestSections(rows, { purchase: true, manager: true });
  assert.deepEqual(ids(manager.ongoing), [1]);
  assert.deepEqual(ids(manager.history), [2, 3, 4, 5, 6, 7]);
});

test('empty inputs produce independent empty sections without a phantom modified order', () => {
  assert.deepEqual(splitReviewedWorkSections(), { ongoing: [], history: [], modified: [] });
  assert.deepEqual(splitReviewedWorkSections([], { manager: false }), { ongoing: [], history: [], modified: [] });
  assert.deepEqual(splitRequestSections(), { ongoing: [], history: [] });
});
