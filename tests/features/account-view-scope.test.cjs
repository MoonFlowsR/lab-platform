const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const createScope = require('../../server/features/accounts/view-scope.cjs');
const fs = require('node:fs'), path = require('node:path');

test('account scope is isolated by ID and only enables the all-record default for teachers', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE platform_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
    const read = createScope({ db });
    const account = { id: 1, username: 'example-finance', account_type: 'teacher' };
    assert.equal(read(account), 'mine');
    db.prepare('INSERT INTO platform_settings VALUES(?,?,?)').run('account_view_scope:1', 'all', 'example');
    assert.equal(read(account), 'all');
    assert.equal(createScope({ db })(account), 'all');
    assert.equal(read({ ...account, id: 2 }), 'mine');
    for (const role of ['student', 'admin']) assert.equal(read({ ...account, account_type: role }), 'mine');
    db.prepare('UPDATE platform_settings SET value=?').run('invalid');
    assert.equal(read(account), 'mine');
  } finally { db.close(); }
});

test('all-record default changes visibility but never assigned-reviewer authorization', async () => {
  const { defaultViewScope, usesTeamOverview, workScopeMatches, teacherScopeMatches, canReviewAssignedRequest } = await import('../../src/shared/lib/review-scope.js');
  const account = { username: 'finance-teacher', account_type: 'teacher', default_view_scope: 'all' };
  const other = { applicant_username: 'student-a', review_teacher_username: 'other-teacher' };
  assert.equal(defaultViewScope(account), 'all');
  assert.equal(usesTeamOverview(account), true);
  assert.equal(workScopeMatches(other, account, defaultViewScope(account)), true);
  assert.equal(teacherScopeMatches(other, account, 'mine'), false);
  assert.equal(canReviewAssignedRequest(other, account), false);
  assert.equal(canReviewAssignedRequest({ ...other, review_teacher_username: account.username }, account), true);
  assert.equal(defaultViewScope({ ...account, default_view_scope: undefined }), 'mine');
  assert.equal(defaultViewScope({ ...account, account_type: 'student' }), 'mine');
  assert.equal(usesTeamOverview({ account_type: 'admin' }), true);
});

test('account responses refresh the preference while backend review authorization stays restricted', () => {
  const root = path.resolve(__dirname, '../..'), temporary = fs.mkdtempSync(path.join(root, '.tmp-account-scope-'));
  let runtime;
  try {
    fs.cpSync(path.join(root, 'server'), path.join(temporary, 'server'), { recursive: true, filter: source => !['data', 'uploads', 'logs', 'backups'].includes(path.relative(path.join(root, 'server'), source).split(path.sep)[0]) });
    fs.cpSync(path.join(root, 'src'), path.join(temporary, 'src'), { recursive: true });
    runtime = require(path.join(temporary, 'server/runtime.cjs'))();
    runtime.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('example-finance', '示例财务教师', 'teacher', 'active', 'unused', runtime.nowISO(), runtime.nowISO());
    const account = runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get('example-finance');
    assert.equal(runtime.publicAccount(account).default_view_scope, 'mine');
    runtime.db.prepare('INSERT INTO platform_settings(key,value,updated_at) VALUES(?,?,?)').run('account_view_scope:' + account.id, 'all', runtime.nowISO());
    const safe = runtime.publicAccount(account);
    assert.equal(safe.default_view_scope, 'all');
    assert.equal(safe.password_hash, undefined);
    assert.throws(() => runtime.requireAssignedReviewer({ review_teacher_username: 'other-teacher' }, safe), /仅被指定/);
    assert.doesNotThrow(() => runtime.requireAssignedReviewer({ review_teacher_username: account.username }, safe));
  } finally {
    runtime?.db.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('withdrawn requests leave every role display without changing the stored record', async () => {
  const { requestRecordVisible } = await import('../../src/shared/lib/review-scope.js');
  const withdrawn = Object.freeze({ request_type: '测试', status: '已撤回' });
  for (const request_type of ['测试', '加工', '维修', '采购', undefined]) assert.equal(requestRecordVisible({ ...withdrawn, request_type }), false);
  for (const status of ['待教师审核', '已驳回', '已通过', '已完成', '已关闭', '待采购人审批', '已同意待出库', '已出库']) assert.equal(requestRecordVisible({ ...withdrawn, status }), true);
  assert.equal(withdrawn.status, '已撤回');
});
