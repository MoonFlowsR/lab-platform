const assert = require('node:assert/strict');
const { before, test } = require('node:test');
let createTeacherContext, recordMatchesTeacher, recordTeacherNames, recordMatchesSearch, recordMatchesStudent, selectReportData, buildReportExport;
before(async () => {
  ({ createTeacherContext, recordMatchesTeacher, recordTeacherNames, recordMatchesSearch } = await import('../../src/shared/lib/teacher-filter.js'));
  ({ recordMatchesStudent } = await import('../../src/shared/lib/student-filter.js'));
  ({ selectReportData } = await import('../../src/features/reports/report-data.js'));
  ({ buildReportExport } = await import('../../src/features/reports/report-export.js'));
});
const at = '2026-10-17T02:00:00Z';
const teachers = [{ username: 'teacher-a', display_name: '教师甲' }, { username: 'teacher-b', display_name: '教师乙' }];

test('work and purchase filters retain assigned reviewers and actual participants, not mentor labels', () => {
  const context = createTeacherContext({ teachers });
  const mentorOnly = { applicant_username: 'student-a', applicant_name: '学生甲（教师甲）', responsible_teacher_username: 'teacher-a', guiding_teacher_username: 'teacher-a' };
  for (const module of ['test', 'processing', 'purchases', 'requests']) {
    assert(!recordMatchesTeacher(mentorOnly, 'teacher-a', module, context));
    assert(recordMatchesTeacher({ ...mentorOnly, review_teacher_username: 'teacher-a' }, 'teacher-a', module, context));
    assert(recordMatchesTeacher({ ...mentorOnly, reviewed_username: 'teacher-a' }, 'teacher-a', module, context));
    assert(recordMatchesTeacher({ ...mentorOnly, applicant_username: 'teacher-a' }, 'teacher-a', module, context));
    assert(!recordMatchesTeacher({ ...mentorOnly, reviewed_username: 'teacher-b' }, 'teacher-a', module, context));
  }
  assert(recordMatchesStudent(mentorOnly, 'student-a', 'test'));
  assert(!recordMatchesStudent(mentorOnly, '学生甲（教师甲）', 'test'));
  assert(recordMatchesSearch(mentorOnly, '教师甲'), 'global full-text search keeps parenthesized teacher names');
});

test('inventory filters use this record participants while keeping associated teacher display unchanged', () => {
  const purchase = { _id: 1, applicant_username: 'student-a', review_teacher_username: 'teacher-a', responsible_teacher_username: 'teacher-a' };
  const batch = { _id: 2, batch_code: 'BATCH-EXAMPLE', purchaser_username: 'student-a', created_by_username: 'student-a', responsible_teacher_username: 'teacher-a', guiding_teacher_username: 'teacher-a', related_purchase_record_id: 1 };
  const stock = { _id: 3, batch_id: 2, operator_username: 'student-a', operator_name: '学生甲（教师甲）', responsible_teacher_username: 'teacher-a' };
  const context = createTeacherContext({ purchases: [purchase], batches: [batch], teachers });
  assert.equal(recordTeacherNames(batch, 'materials', context), '教师甲');
  assert.equal(recordTeacherNames(stock, 'stock', context), '教师甲');
  assert(!recordMatchesTeacher(batch, 'teacher-a', 'materials', context));
  assert(!recordMatchesTeacher(stock, 'teacher-a', 'stock', context));
  for (const field of ['purchaser_username', 'inbound_by_username', 'created_by_username', 'last_modified_username']) {
    assert(recordMatchesTeacher({ ...batch, [field]: 'teacher-a' }, 'teacher-a', 'materials', context), field);
  }
  for (const field of ['operator_username', 'reviewed_username', 'purchaser_approved_username', 'last_modified_username']) {
    assert(recordMatchesTeacher({ ...stock, [field]: 'teacher-a' }, 'teacher-a', 'stock', context), field);
  }
  assert(recordMatchesStudent(batch, 'student-a', 'materials'));
  assert(!recordMatchesStudent(batch, 'teacher-a', 'materials'));
  assert(recordMatchesSearch({ ...stock, associated_teacher_names: recordTeacherNames(stock, 'stock', context) }, '教师甲'));
});

test('report selection and CSV share direct teacher participation, exact student intersection, dates and full-text search', () => {
  const common = { created_at: at, applicant_username: 'student-a', applicant_name: '学生甲（教师甲）', responsible_teacher_username: 'teacher-a', status: '已完成', request_type: '测试' };
  const data = {
    teachers,
    workRequests: [
      { ...common, _id: 11, public_id: 'WORK-DIRECT', work_content: '本人审批测试', reviewed_username: 'teacher-a' },
      { ...common, _id: 12, public_id: 'WORK-MENTOR', work_content: '仅导师关联测试' },
      { ...common, _id: 13, public_id: 'WORK-OUTSIDE', work_content: '较早本人审批', reviewed_username: 'teacher-a', created_at: '2026-10-15T02:00:00Z' },
    ],
    purchases: [], materials: [{ _id: 1, name_cn: '示例材料' }],
    batches: [
      { _id: 21, material_id: 1, material_name: '示例材料', batch_code: 'BATCH-DIRECT', purchaser_username: 'student-a', created_by_username: 'student-a', inbound_by_username: 'teacher-a', current_qty: 5, unit: 'g', created_at: at },
      { _id: 22, material_id: 1, material_name: '示例材料', batch_code: 'BATCH-MENTOR', purchaser_username: 'student-a', created_by_username: 'student-a', responsible_teacher_username: 'teacher-a', current_qty: 7, unit: 'g', created_at: at },
    ],
    stockTransactions: [
      { _id: 31, public_id: 'IO-DIRECT', batch_id: 21, material_id: 1, material_name: '示例材料', operator_username: 'teacher-a', created_at: at },
      { _id: 32, public_id: 'IO-MENTOR', batch_id: 22, material_id: 1, material_name: '示例材料', operator_username: 'student-a', operator_name: '学生甲（教师甲）', responsible_teacher_username: 'teacher-a', created_at: at },
    ], stockOutRequests: [], reviewLogs: [], attachments: [],
  };
  const before = JSON.stringify(data);
  const options = { teacher: 'teacher-a', startDate: '2026-10-17', endDate: '2026-10-17' };
  const selected = selectReportData(data, options);
  assert.deepEqual(selected.workRequests.map(row => row._id), [11]);
  assert.deepEqual(selected.batches.map(row => row._id), [21]);
  assert.deepEqual(selected.stockTransactions.map(row => row._id), [31]);
  assert.deepEqual(selectReportData(data, { ...options, student: 'student-a' }).workRequests.map(row => row._id), [11]);
  assert.deepEqual(selectReportData(data, { ...options, student: 'student-a' }).stockTransactions, []);
  assert(selectReportData(data, { query: '教师甲' }).workRequests.some(row => row._id === 12));
  const exported = buildReportExport(data, options, new Date(at));
  const workCsv = exported.files.find(file => file.filename === '测试明细.csv').csv;
  assert(workCsv.includes('本人审批测试'));
  assert(!workCsv.includes('仅导师关联测试'));
  assert(!workCsv.includes('较早本人审批'));
  assert.equal(JSON.stringify(data), before);
});
