const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const labelsFor = require('../../server/features/accounts/student-name-labels.cjs');
const fs = require('node:fs');
const path = require('node:path');
let display, studentFilterOptions, recordMatchesStudent, canReviewAssignedRequest, buildCsv;
test.before(async () => {
  display = await import('../../src/features/accounts/student-name-display.js');
  ({ studentFilterOptions, recordMatchesStudent } = await import('../../src/shared/lib/student-filter.js'));
  ({ canReviewAssignedRequest } = await import('../../src/shared/lib/review-scope.js'));
  ({ buildCsv } = await import('../../src/shared/lib/csv-export.js'));
});
const labels = [
  { username: 'student-a', display_name: '示例学生', responsible_teacher_name: '示例责任教师', guiding_teacher_name: '示例指导教师' },
  { username: 'student-b', display_name: '同名学生', responsible_teacher_name: '另一责任教师', guiding_teacher_name: '另一指导教师' },
  { username: 'student-c', display_name: '同名学生', responsible_teacher_name: '示例责任教师', guiding_teacher_name: '示例指导教师' },
  { username: 'new-student', display_name: '待完善学生', responsible_teacher_name: '', guiding_teacher_name: '' },
];
const expectedName = '示例学生（示例责任教师，示例指导教师）';

test('display directory exposes only student and mentor names and does not change stored identity', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE accounts(id INTEGER PRIMARY KEY,username TEXT,display_name TEXT,account_type TEXT,password_hash TEXT);
      CREATE TABLE student_profiles(account_id INTEGER,responsible_teacher_username TEXT,guiding_teacher_username TEXT,graduation_year INTEGER);
      INSERT INTO accounts VALUES(1,'student-a','示例学生','student','not-a-real-password'),(2,'teacher-a','示例责任教师','teacher','not-a-real-password'),(3,'teacher-b','示例指导教师','teacher','not-a-real-password'),(4,'admin','示例管理员','admin','not-a-real-password');
      INSERT INTO student_profiles VALUES(1,'teacher-a','teacher-b',2028);`);
    const before = db.prepare('SELECT * FROM accounts').all();
    assert.deepEqual(labelsFor(db), [labels[0]]);
    assert.deepEqual(Object.keys(labelsFor(db)[0]).sort(), ['display_name', 'guiding_teacher_name', 'responsible_teacher_name', 'username']);
    assert.deepEqual(db.prepare('SELECT * FROM accounts').all(), before);
    db.prepare("UPDATE student_profiles SET responsible_teacher_username='teacher-b' WHERE account_id=1").run();
    assert.equal(labelsFor(db)[0].responsible_teacher_name, '示例指导教师');
  } finally { db.close(); }
});

test('student label uses responsible then guiding teacher; unknown and incomplete identities stay plain', () => {
  const index = display.createStudentNameIndex(labels);
  assert.equal(display.studentNameLabel('示例学生', 'student-a', index), expectedName);
  assert.equal(display.studentNameLabel('示例学生', 'deleted-student', index), '示例学生');
  assert.equal(display.studentNameLabel('同名学生', '', index), '同名学生');
  assert.equal(display.studentNameLabel('待完善学生', 'new-student', index), '待完善学生');
  assert.equal(display.studentNameLabel('示例教师', 'teacher-a', index), '示例教师');
  assert.equal(display.studentNameLabel('示例教师', 'student-a', index), '示例教师');
  assert.equal(display.studentNameLabel('同名学生', 'student-b', index), '同名学生（另一责任教师，另一指导教师）');
});

test('current student displays mentors before first snapshot and remains idempotent', () => {
  const account = { username: 'student-a', display_name: '示例学生', account_type: 'student', session_token: 'example-session', student_profile: { responsible_teacher_name: '示例责任教师', guiding_teacher_name: '示例指导教师' } };
  const shown = display.displayStudentAccount(account);
  assert.equal(shown.display_name, expectedName);
  assert.equal(shown.username, account.username);
  assert.equal(shown.session_token, account.session_token);
  assert.equal(display.displayStudentAccount(shown), shown);
  assert.equal(account.display_name, '示例学生');
  const teacher = { ...account, account_type: 'teacher' };
  assert.equal(display.displayStudentAccount(teacher), teacher);
});

test('one teacher in both profile roles appears once without changing either role field', () => {
  const directory = [{ ...labels[0], responsible_teacher_name: ' 示例教师 ', guiding_teacher_name: '示例教师' }];
  const index = display.createStudentNameIndex(directory);
  assert.equal(display.studentNameLabel('示例学生', 'student-a', index), '示例学生（示例教师）');
  assert.equal(directory[0].responsible_teacher_name, ' 示例教师 ');
  assert.equal(directory[0].guiding_teacher_name, '示例教师');
  const account = { username: 'student-a', display_name: '示例学生', account_type: 'student', session_token: 'example-session',
    student_profile: { responsible_teacher_username: 'teacher-a', guiding_teacher_username: 'teacher-a', responsible_teacher_name: ' 示例教师 ', guiding_teacher_name: '示例教师' } };
  const original = JSON.stringify(account), shown = display.displayStudentAccount(account);
  assert.equal(shown.display_name, '示例学生（示例教师）');
  assert.equal(shown.username, account.username); assert.equal(shown.session_token, account.session_token);
  assert.equal(shown.student_profile, account.student_profile);
  assert.equal(display.displayStudentAccount(shown), shown);
  assert.equal(JSON.stringify(account), original);
});

test('cached old duplicate mentor suffix is replaced before the first snapshot rather than appended', () => {
  const cached = { username: 'student-a', display_name: '示例学生（示例教师，示例教师）', account_type: 'student',
    student_profile: { responsible_teacher_name: '示例教师', guiding_teacher_name: '示例教师' } };
  const shown = display.displayStudentAccount(cached);
  assert.equal(shown.display_name, '示例学生（示例教师）');
  assert.equal(display.displayStudentAccount(shown), shown);
  assert.equal(cached.display_name, '示例学生（示例教师，示例教师）');
});

test('same-teacher labels propagate to records, filters, CSV, comments and cache updates', () => {
  const render = display.createStudentNameDisplay();
  const rows = [{ _id: 1, applicant_username: 'student-a', applicant_name: '示例学生', public_id: 'WORK-EXAMPLE', request_type: '测试' }];
  const original = JSON.stringify(rows);
  const directory = labels.map(row => row.username === 'student-a' ? { ...row, guiding_teacher_name: row.responsible_teacher_name } : row);
  const shown = render({ lab_student_name_labels: directory, lab_work_requests: rows,
    lab_student_accounts: [{ username: 'student-a', display_name: '示例学生' }] });
  const name = '示例学生（示例责任教师）';
  assert.equal(shown.lab_work_requests[0].applicant_name, name);
  assert.equal(studentFilterOptions(shown.lab_student_accounts)[0].label, name);
  assert.ok(buildCsv('test', shown.lab_work_requests).csv.includes(name));
  const comment = display.displayStudentComment({ author_username: 'student-a', reply_to_username: 'student-a' }, display.createStudentNameIndex(directory));
  assert.equal(comment.author_name, name); assert.equal(comment.reply_to_name, name);
  assert.equal(comment.author_username, 'student-a'); assert.equal(comment.reply_to_username, 'student-a');
  const stable = render({ lab_student_name_labels: directory, lab_work_requests: structuredClone(rows) });
  assert.equal(stable.lab_work_requests[0], shown.lab_work_requests[0]);
  const changed = render({ lab_student_name_labels: labels, lab_work_requests: rows });
  assert.equal(changed.lab_work_requests[0].applicant_name, expectedName);
  assert.notEqual(changed.lab_work_requests[0], shown.lab_work_requests[0]);
  assert.equal(changed.lab_work_requests[0].applicant_username, 'student-a');
  assert.equal(JSON.stringify(rows), original);
});

test('live name directory overrides older session profile for composer and current account display', () => {
  const rawAccount = { username: 'student-a', display_name: '示例学生', account_type: 'student', student_profile: { responsible_teacher_name: '旧责任教师', guiding_teacher_name: '旧指导教师' } };
  assert.equal(display.displayStudentAccount(rawAccount).display_name, '示例学生（旧责任教师，旧指导教师）');
  const index = display.createStudentNameIndex(labels);
  const composerAccount = display.displayStudentAccount(rawAccount, index);
  assert.equal(composerAccount.display_name, expectedName); assert.equal(composerAccount.username, rawAccount.username);
  assert.equal(rawAccount.student_profile.guiding_teacher_name, '旧指导教师');
  const render = display.createStudentNameDisplay();
  const first = render({ current_account: rawAccount, lab_student_name_labels: labels });
  assert.equal(first.current_account.display_name, expectedName);
  const updatedLabels = labels.map(row => row.username === 'student-a' ? { ...row, guiding_teacher_name: '更新指导教师' } : row);
  const next = render({ current_account: rawAccount, lab_student_name_labels: updatedLabels });
  assert.equal(next.current_account.display_name, '示例学生（示例责任教师，更新指导教师）');
  assert.equal(next.current_account.username, rawAccount.username);
});

test('snapshot decoration preserves login identifiers, owner fields, IDs and raw records', () => {
  const raw = {
    lab_student_name_labels: labels,
    lab_work_requests: [{ _id: 1, applicant_name: '示例学生', applicant_username: 'student-a', review_teacher_username: 'teacher-a', status: '待教师审核' }],
    lab_material_batches: [{ _id: 2, material_id: 7, purchaser_name: '示例学生', purchaser_username: 'student-a', inbound_by_name: '示例学生', inbound_by_username: 'student-a', current_qty: 12 }],
    lab_student_accounts: [{ username: 'student-a', display_name: '示例学生' }],
  };
  const saved = JSON.stringify(raw), shown = display.createStudentNameDisplay()(raw);
  assert.equal(shown.lab_work_requests[0].applicant_name, expectedName);
  assert.equal(shown.lab_material_batches[0].purchaser_name, expectedName);
  assert.equal(shown.lab_material_batches[0].inbound_by_name, expectedName);
  assert.equal(JSON.stringify(raw), saved);
  for (const field of ['_id', 'applicant_username', 'review_teacher_username', 'status']) assert.equal(shown.lab_work_requests[0][field], raw.lab_work_requests[0][field]);
  for (const field of ['_id', 'material_id', 'purchaser_username', 'inbound_by_username', 'current_qty']) assert.equal(shown.lab_material_batches[0][field], raw.lab_material_batches[0][field]);
  const option = studentFilterOptions(shown.lab_student_accounts)[0];
  assert.equal(option.username, 'student-a'); assert.equal(option.label, expectedName);
  assert.ok(recordMatchesStudent(shown.lab_work_requests[0], 'student-a', 'test'));
  assert.ok(!recordMatchesStudent(shown.lab_work_requests[0], expectedName, 'test'));
  assert.ok(canReviewAssignedRequest(shown.lab_work_requests[0], { account_type: 'teacher', username: 'teacher-a' }));
  assert.ok(!canReviewAssignedRequest(shown.lab_work_requests[0], { account_type: 'teacher', username: 'teacher-b' }));
});

test('unchanged snapshots reuse record identities and mentor updates invalidate only affected display rows', () => {
  const render = display.createStudentNameDisplay();
  const raw = { lab_student_name_labels: labels, lab_work_requests: [{ _id: 1, applicant_username: 'student-a', applicant_name: '示例学生' }, { _id: 2, applicant_username: 'student-b', applicant_name: '同名学生' }, { _id: 3, applicant_username: 'teacher-a', applicant_name: '示例教师' }] };
  const first = render(raw), second = render(JSON.parse(JSON.stringify(raw)));
  assert.equal(second.lab_work_requests[0], first.lab_work_requests[0]);
  assert.equal(second.lab_work_requests[1], first.lab_work_requests[1]);
  assert.equal(second.lab_work_requests[2], first.lab_work_requests[2]);
  assert.equal(display.sameRows(first.lab_work_requests, second.lab_work_requests), first.lab_work_requests);
  const changed = { ...raw, lab_student_name_labels: labels.map(row => row.username === 'student-a' ? { ...row, guiding_teacher_name: '新指导教师' } : row) };
  const third = render(changed);
  assert.equal(third.lab_work_requests[0].applicant_name, '示例学生（示例责任教师，新指导教师）');
  assert.notEqual(third.lab_work_requests[0], first.lab_work_requests[0]);
  assert.equal(third.lab_work_requests[1], first.lab_work_requests[1]);
  assert.equal(third.lab_work_requests[2], first.lab_work_requests[2]);
  const partial = render({ lab_work_requests: raw.lab_work_requests });
  assert.equal(partial.lab_work_requests[0], third.lab_work_requests[0]);
});

test('same record with changed business values is never hidden by display caches', () => {
  const render = display.createStudentNameDisplay();
  const raw = { lab_student_name_labels: labels, lab_material_batches: [{ _id: 7, purchaser_username: 'student-a', purchaser_name: '示例学生', current_qty: 2, unit: 'g' }] };
  const first = render(raw), next = render({ ...raw, lab_material_batches: [{ ...raw.lab_material_batches[0], current_qty: 3 }] });
  assert.equal(next.lab_material_batches[0].current_qty, 3); assert.notEqual(next.lab_material_batches[0], first.lab_material_batches[0]);
});

test('audit and comment display names never replace usernames used by owner checks', () => {
  const index = display.createStudentNameIndex(labels);
  const row = { id: 12, author_username: 'student-a', author_name: '示例学生', reply_to_username: 'student-b', deleted_by: 'student-a' };
  const shown = display.displayStudentComment(row, index);
  assert.equal(shown.author_name, expectedName); assert.equal(shown.author_username, 'student-a');
  assert.equal(shown.reply_to_name, '同名学生（另一责任教师，另一指导教师）'); assert.equal(shown.reply_to_username, 'student-b');
  assert.equal(shown.deleted_by, 'student-a'); assert.equal(shown.deleted_by_name, expectedName);
  const audit = display.createStudentNameDisplay()({ lab_student_name_labels: labels, audit_logs: [{ id: 1, operator_username: 'student-a', operator_role: 'student' }] }).audit_logs[0];
  assert.equal(audit.operator_name, expectedName); assert.equal(audit.operator_username, 'student-a');
  assert.equal(row.author_name, '示例学生');
});

test('Chinese CSV uses the same student display name without changing its record keys', () => {
  const raw = { lab_student_name_labels: labels, lab_stock_transactions: [{ _id: 9, public_id: 'IO-EXAMPLE', transaction_type: '出库', material_name: '示例材料', batch_code: 'BATCH-EXAMPLE', quantity: 1, unit: 'g', stock_before: 3, stock_after: 2, operator_username: 'student-a', operator_name: '示例学生' }] };
  const shown = display.createStudentNameDisplay()(raw);
  const result = buildCsv('stock', shown.lab_stock_transactions);
  assert.ok(result.csv.includes(expectedName)); assert.ok(result.csv.includes('IO-EXAMPLE'));
  assert.equal(shown.lab_stock_transactions[0].operator_username, 'student-a');
});

test('HTTP snapshots refresh mentor display metadata and anonymous help never receives the directory', async () => {
  const projectRoot = path.resolve(__dirname, "../..");
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, '.tmp-security-identity-'));
  const sourceServer = path.join(projectRoot, 'server');
  let runtime, server;
  try {
    fs.cpSync(sourceServer, path.join(temporaryRoot, 'server'), { recursive: true,
      filter: source => !['data', 'uploads', 'backups'].includes(path.relative(sourceServer, source).split(path.sep)[0]) && !source.endsWith('.test.cjs'),
    });
    fs.cpSync(path.join(projectRoot,'src'),path.join(temporaryRoot,'src'),{recursive:true});
    runtime = require(path.join(temporaryRoot, 'server/runtime.cjs'))();
    require(path.join(temporaryRoot, 'server/routes/auth.cjs'))(runtime);
    require(path.join(temporaryRoot, 'server/routes/ops.cjs'))(runtime);
    require(path.join(temporaryRoot, 'server/routes/help.cjs'))(runtime);
    for (const [username, role] of [['owner', 'student'], ['other', 'student'], ['teacher-a', 'teacher'], ['teacher-b', 'teacher']]) runtime.db.prepare(`INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,'active','unused-test-hash',?,?)`).run(username, username, role, runtime.nowISO(), runtime.nowISO());
    const owner = runtime.db.prepare("SELECT * FROM accounts WHERE username='owner'").get();
    const token = runtime.signToken(owner);
    runtime.studentProfiles.save({ headers: {}, ip: 'example-test' }, owner, { responsible_teacher_username: 'teacher-a', guiding_teacher_username: 'teacher-b', graduation_year: 2028 });
    const saved = runtime.insertRecord('lab_work_requests', { applicant_username: 'owner', applicant_name: 'owner', public_id: 'TEST-EXAMPLE', review_teacher_username: 'teacher-a', status: '待教师审核' });
    server = runtime.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (url, { authorized = false, body } = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); return response.json();
    };
    const first = await request('/api/ops/listAll', { authorized: true, body: {} });
    assert.ok(first.data.lab_student_name_labels.some(row => row.username === 'owner' && row.responsible_teacher_name === 'teacher-a'));
    assert.equal(first.data.lab_work_requests.find(row => row._id === saved._id).applicant_name, 'owner');
    const unchanged = await request('/api/ops/listAll', { authorized: true, body: { known_revision: first.revision } });
    assert.equal(unchanged.unchanged, true);
    const anonymousResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/help-comments`);
    assert.equal(anonymousResponse.status,401);
    assert.ok(!Object.hasOwn(await anonymousResponse.json(), 'student_name_labels'));
    const authorized = await request('/api/help-comments', { authorized: true });
    assert.deepEqual(authorized.student_name_labels, first.data.lab_student_name_labels);
    for (const row of authorized.student_name_labels) assert.deepEqual(Object.keys(row).sort(), ['display_name', 'guiding_teacher_name', 'responsible_teacher_name', 'username']);
    const result = await request('/api/profile/save', { authorized: true, body: { responsible_teacher_username: 'teacher-b', guiding_teacher_username: 'teacher-a', graduation_year: 2028 } });
    assert.equal(result.account.username, 'owner'); assert.equal(result.account.display_name, 'owner');
    const changed = await request('/api/ops/listAll', { authorized: true, body: { known_revision: first.revision } });
    assert.ok(!changed.unchanged);
    assert.equal(changed.data.lab_student_name_labels.find(row => row.username === 'owner').responsible_teacher_name, 'teacher-b');
    assert.equal(runtime.getRecord('lab_work_requests', saved._id).applicant_name, 'owner');
    const session = await request('/api/help-comments/session', { authorized: true });
    assert.equal(session.account.username, 'owner'); assert.ok(!Object.hasOwn(session.account, 'password_hash'));
    assert.deepEqual(session.student_name_labels, changed.data.lab_student_name_labels);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (runtime) runtime.db.close();
    for (const file of Object.keys(require.cache)) if (file.startsWith(temporaryRoot + path.sep)) delete require.cache[file];
    const relative = path.relative(projectRoot, temporaryRoot);
    assert.ok(relative.startsWith('.tmp-security-identity-') && !relative.includes(path.sep));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
