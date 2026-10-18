const assert = require('node:assert/strict');
const { before, test } = require('node:test');
let createAdminRecordFilter;
before(async () => { ({ createAdminRecordFilter } = await import('../../src/shared/lib/admin-record-filter.js')); });
const at = '2026-10-16T04:00:00.000Z';
const accounts = [
  { id: 1, username: 'student-a', account_type: 'student', created_at: at, student_profile: { responsible_teacher_username: 'teacher-a', guiding_teacher_username: 'teacher-a' } },
  { id: 2, username: 'student-b', account_type: 'student', created_at: at, student_profile: { responsible_teacher_username: 'teacher-b', guiding_teacher_username: 'teacher-b' } },
  { id: 3, username: 'teacher-a', account_type: 'teacher', created_at: at },
  { id: 4, username: 'teacher-b', account_type: 'teacher', created_at: at },
  { id: 5, username: 'admin', account_type: 'admin', created_at: at },
];
const log = (id, values) => ({ id, created_at: at, operator_username: 'admin', before_json: '', after_json: '', ...values });
const snapshot = value => JSON.stringify(value);
const selected = (data, options) => {
  const filter = createAdminRecordFilter({ accounts, ...data }, options);
  return data.auditLogs.filter(filter.auditMatches).map(row => row.id);
};
const batch = { _id: 81, batch_code: 'BATCH-SHARED', purchaser_username: 'student-a', created_by_username: 'student-a', last_modified_username: 'student-b' };

test('transactions sharing a batch retain separate identities and event snapshots', () => {
  const data = { collections: {
    lab_material_batches: [batch],
    lab_stock_transactions: [
      { _id: 91, public_id: 'IO-A', batch_id: 81, batch_code: batch.batch_code, operator_username: 'student-a' },
      { _id: 92, public_id: 'IO-B', batch_id: 81, batch_code: batch.batch_code, operator_username: 'student-b' },
    ],
  }, auditLogs: [
    log(11, { operator_username: 'student-a', target_type: 'lab_stock_transactions', target_id: '91', after_json: snapshot({ operator_username: 'student-a', batch_code: batch.batch_code }) }),
    log(12, { operator_username: 'student-b', target_type: 'lab_stock_transactions', target_id: '92', after_json: snapshot({ operator_username: 'student-b', batch_code: batch.batch_code }) }),
    log(16, { target_type: 'lab_stock_transactions', target_id: '91' }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [11, 16]);
  assert.deepEqual(selected(data, { student: 'student-b' }), [12]);
});

test('later material modifications do not change the creator of an earlier complete event', () => {
  const data = { collections: { lab_materials: [{ _id: 82, created_by_username: 'student-a', last_modified_username: 'student-b' }] }, auditLogs: [
    log(13, { operator_username: 'student-a', target_type: 'lab_materials', target_id: '82', after_json: snapshot({ created_by_username: 'student-a' }) }),
    log(14, { operator_username: 'student-b', target_type: 'lab_materials', target_id: '82', before_json: snapshot({ created_by_username: 'student-a' }), after_json: snapshot({ created_by_username: 'student-a', last_modified_username: 'student-b' }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [13, 14]);
  assert.deepEqual(selected(data, { student: 'student-b' }), [14]);
});

test('admin quantity-only snapshots still fall back to the precise target owner', () => {
  const data = { collections: { lab_stock_transactions: [{ _id: 93, operator_username: 'student-a', last_modified_username: 'student-b' }] }, auditLogs: [
    log(17, { target_type: 'lab_stock_transactions', target_id: '93', before_json: snapshot({ quantity: 1 }), after_json: snapshot({ quantity: 2 }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [17]);
  assert.deepEqual(selected(data, { student: 'student-b' }), []);
});

test('reviewer-only and modifier-only snapshots do not suppress owner fallback', () => {
  const data = { collections: { lab_work_requests: [{ _id: 71, applicant_username: 'student-a' }] }, auditLogs: [
    log(18, { target_type: 'lab_work_requests', target_id: '71', after_json: snapshot({ review_teacher_username: 'teacher-b' }) }),
    log(19, { target_type: 'lab_work_requests', target_id: '71', after_json: snapshot({ last_modified_username: 'student-b' }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [18, 19]);
  assert.deepEqual(selected(data, { teacher: 'teacher-a' }), []);
  assert.deepEqual(selected(data, { teacher: 'teacher-b' }), []);
});

test('one historical ownership state resolves deleted targets without pooling other events', () => {
  const data = { auditLogs: [
    log(20, { target_type: 'lab_work_requests', target_id: '999' }),
    log(21, { target_type: 'lab_work_requests', target_id: '999', created_at: '2026-10-14T00:00:00Z', after_json: snapshot({ applicant_username: 'student-a' }) }),
    log(22, { target_type: 'lab_work_requests', target_id: '999', created_at: '2026-10-15T00:00:00Z', after_json: snapshot({ applicant_username: 'student-b' }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [21]);
  assert.deepEqual(selected(data, { student: 'student-b' }), [20, 22]);
});

test('self-referencing quantity snapshots cannot hide older deleted-batch ownership', () => {
  const data = { auditLogs: [
    log(23, { target_type: 'lab_material_batches', target_id: '999', after_json: snapshot({ batch_code: 'BATCH-DELETED', quantity: 5 }) }),
    log(24, { target_type: 'lab_material_batches', target_id: '999', created_at: '2026-10-15T00:00:00Z', after_json: snapshot({ _id: 999, batch_code: 'BATCH-DELETED', created_by_username: 'student-a' }) }),
    log(25, { target_type: 'lab_material_batches', target_id: '999', after_json: snapshot({ review_teacher_username: 'teacher-b' }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [23, 24, 25]);
  assert.deepEqual(selected(data, { teacher: 'teacher-b' }), []);
});

test('attachment chains resolve a specific transaction without merging its sibling transaction', () => {
  const data = { collections: {
    lab_material_batches: [batch],
    lab_stock_transactions: [
      { _id: 91, batch_id: 81, batch_code: batch.batch_code, operator_username: 'student-a' },
      { _id: 92, batch_id: 81, batch_code: batch.batch_code, operator_username: 'student-b' },
    ],
    lab_attachments: [{ _id: 101, target_collection: 'lab_stock_transactions', target_id: 91, uploaded_by_username: 'student-a' }],
  }, auditLogs: [log(26, { target_type: 'lab_attachments', target_id: '101' })] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [26]);
  assert.deepEqual(selected(data, { student: 'student-b' }), []);
});

test('current target ownership takes priority over historical participants for sparse events', () => {
  const data = { collections: { lab_materials: [{ _id: 82, created_by_username: 'student-a' }] }, auditLogs: [
    log(27, { target_type: 'lab_materials', target_id: '82' }),
    log(28, { operator_username: 'student-b', target_type: 'lab_materials', target_id: '82', after_json: snapshot({ created_by_username: 'student-b' }) }),
  ] };
  assert.deepEqual(selected(data, { student: 'student-a' }), [27]);
  assert.deepEqual(selected(data, { student: 'student-b' }), [28]);
});

test('student and teacher intersection, dates, and data immutability remain intact', () => {
  const data = { auditLogs: [
    log(29, { operator_username: 'teacher-a', target_type: 'lab_work_requests', target_id: '71', after_json: snapshot({ applicant_username: 'student-a' }), created_at: '2026-10-15T16:00:00Z' }),
    log(30, { operator_username: 'student-b', created_at: '2026-10-15T15:59:59Z' }),
  ] };
  const original = JSON.stringify(data);
  assert.deepEqual(selected(data, { student: 'student-a', teacher: 'teacher-a', range: { start: '2026-10-16', end: '2026-10-16' } }), [29]);
  assert.deepEqual(selected(data, { student: 'student-a', teacher: 'teacher-b' }), []);
  assert.equal(JSON.stringify(data), original);
});

test('account selectors match exact usernames, not mentor labels or student relationships', () => {
  const rows = accounts.map(row => ({ ...row, display_name: row.username === 'student-a' ? '学生甲（教师甲）' : row.username === 'teacher-a' ? '教师甲' : row.username }));
  const teacher = createAdminRecordFilter({ accounts: rows }, { teacher: 'teacher-a' });
  const student = createAdminRecordFilter({ accounts: rows }, { student: 'student-a' });
  assert.deepEqual(rows.filter(teacher.accountMatches).map(row => row.username), ['teacher-a']);
  assert.deepEqual(rows.filter(student.accountMatches).map(row => row.username), ['student-a']);
  assert.deepEqual(rows.filter(createAdminRecordFilter({ accounts: rows }, { teacher: 'teacher-a', student: 'student-a' }).accountMatches), []);
  assert.deepEqual(rows.filter(createAdminRecordFilter({ accounts: rows }, { teacher: '教师甲' }).accountMatches), []);
});

test('teacher audits require the actual operator or exact account target, never a business reviewer or mentor', () => {
  const data = { collections: {
    lab_work_requests: [{ _id: 71, applicant_username: 'student-a', review_teacher_username: 'teacher-a' }],
  }, auditLogs: [
    log(31, { operator_username: 'student-a', target_type: 'lab_work_requests', target_id: '71', after_json: snapshot({ applicant_username: 'student-a', review_teacher_username: 'teacher-a', responsible_teacher_username: 'teacher-a' }) }),
    log(32, { operator_username: 'teacher-a', target_type: 'lab_work_requests', target_id: '71' }),
    log(33, { target_type: 'accounts', target_id: '1', after_json: snapshot({ username: 'student-a', student_profile: { responsible_teacher_username: 'teacher-a' } }) }),
    log(34, { target_type: 'accounts', target_id: '3' }),
    log(35, { target_type: 'student_profiles', target_id: '3' }),
    log(36, { target_type: 'lab_work_requests', target_id: '3', after_json: snapshot({ review_teacher_username: 'teacher-a' }) }),
    log(37, { target_type: 'lab_attachments', target_id: 'attachment', after_json: snapshot({ uploaded_by_username: 'teacher-a', target_collection: 'lab_work_requests', target_id: '71' }) }),
    log(38, { operator_username: 'teacher-b', target_type: 'lab_work_requests', target_id: '71' }),
    log(39, { operator_username: 'teacher-a', action: 'login' }),
  ] };
  assert.deepEqual(selected(data, { teacher: 'teacher-a' }), [32, 34, 35, 39]);
  assert.deepEqual(selected(data, { student: 'student-a', teacher: 'teacher-a' }), [32]);
  assert.deepEqual(selected(data, { teacher: 'teacher-b' }), [38]);
  assert(selected(data, { student: 'student-a' }).includes(37), 'student attachment target resolution remains intact');
});

test('deleted account snapshots identify only their own username and preserve date filtering', () => {
  const data = { auditLogs: [
    log(40, { target_type: 'accounts', target_id: 'deleted', before_json: snapshot({ username: 'teacher-a' }) }),
    log(41, { target_type: 'accounts', target_id: 'deleted-student', before_json: snapshot({ username: 'student-a', student_profile: { guiding_teacher_username: 'teacher-a' } }) }),
    log(42, { target_type: 'student_profiles', target_id: 'deleted', before_json: snapshot({ username: 'teacher-a' }), created_at: '2026-10-15T15:59:59Z' }),
    log(43, { target_type: 'accounts', target_id: 'deleted', after_json: snapshot({ status: 'disabled' }) }),
    log(44, { target_type: 'lab_work_requests', target_id: 'deleted', after_json: snapshot({ quantity: 2 }) }),
  ] };
  assert.deepEqual(selected(data, { teacher: 'teacher-a' }), [40, 42, 43]);
  assert.deepEqual(selected(data, { teacher: 'teacher-a', range: { start: '2026-10-16', end: '2026-10-16' } }), [40, 43]);
});
