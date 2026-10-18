const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const createExpiry = require('../../server/security/student-graduation-expiry.cjs');
const createSessions = require('../../server/security/account-sessions.cjs');
const createChanges = require('../../server/services/record-changes.cjs');

const lastSecond = '2026-12-31T23:59:59+08:00';
const deadline = '2027-01-01T00:00:00+08:00';
function fixture({ date = lastSecond, auditFailure = () => false } = {}) {
  const db = new Database(':memory:');
  require('../../server/db/schema.cjs')(db);
  db.exec('CREATE TABLE student_profiles(account_id INTEGER PRIMARY KEY, graduation_year INTEGER)');
  const clock = { value: date }, nowISO = () => new Date(clock.value).toISOString();
  const sessions = createSessions({ db, nowISO });
  const roles = [['示例学生', 'student', 'active'], ['待审学生', 'student', 'pending'], ['另一学生', 'student', 'disabled'],
    ['示例教师', 'teacher', 'active'], ['示例管理员', 'admin', 'active'], ['未填学生', 'student', 'active'], ['未来学生', 'student', 'active']];
  for (const [username, role, status] of roles) db.prepare(`INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at)
    VALUES(?,?,?,?,'unchanged-test-hash','original-created','original-updated')`).run(username, username, role, status);
  for (const id of [1, 2, 3, 4, 5]) db.prepare('INSERT INTO student_profiles VALUES(?,2026)').run(id);
  db.prepare('INSERT INTO student_profiles VALUES(7,2028)').run();
  db.prepare("INSERT INTO records(collection,created_at,updated_at,data_json) VALUES('lab_material_batches','original','original',?)").run(JSON.stringify({ current_qty: 17, created_by_username: '示例学生', photo_attachment_id: 42 }));
  db.prepare("INSERT INTO audit_logs(action,target_type,created_at) VALUES('existingAction','records','original')").run();
  const get = id => db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
  const disconnected = [], notifications = [], errors = [], schedules = [], cancellations = [];
  function addAudit(req, actor, action, target, id, before, after) {
    if (auditFailure(id)) throw new Error('test audit failed');
    db.prepare(`INSERT INTO audit_logs(operator_username,operator_role,action,target_type,target_id,before_json,after_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(actor.username, actor.account_type, action, target, id, JSON.stringify(before), JSON.stringify(after), nowISO());
  }
  const service = createExpiry({ db, nowISO, accountSessions: sessions, addAudit,
    recordChanges: { disconnectAccount: id => disconnected.push(id), notify: () => notifications.push(true) },
    schedule: (callback, interval) => { const timer = { callback, interval, unref() { this.unreferenced = true; } }; schedules.push(timer); return timer; },
    cancel: timer => cancellations.push(timer), onError: error => errors.push(error.message),
  });
  return { db, clock, sessions, service, get, disconnected, notifications, errors, schedules, cancellations, close() { service.stop(); db.close(); } };
}

test('graduation cutoff is December 31 at 24:00 Beijing and does not depend on the host timezone', () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai']) {
      process.env.TZ = timezone;
      assert.equal(createExpiry.graduationDeadline(2026), '2026-12-31T16:00:00.000Z');
      assert.equal(createExpiry.graduationDeadline(2050), '2050-12-31T16:00:00.000Z');
      for (const invalid of [undefined, null, 2025, 2051, '2026', 2026.5]) assert.equal(createExpiry.graduationDeadline(invalid), null);
      const f = fixture();
      try {
        assert.equal(f.service.isExpired(f.get(1)), false);
        f.clock.value = deadline;
        assert.equal(f.service.isExpired(f.get(1)), true);
        assert.deepEqual(f.service.sweep(), [1, 2]);
      } finally { f.close(); }
    }
  } finally { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; }
});

test('cutoff disables active and pending students, revokes both versions, and preserves profiles and business data', () => {
  const f = fixture();
  try {
    const before = f.db.prepare('SELECT * FROM accounts').all(), profiles = f.db.prepare('SELECT * FROM student_profiles').all();
    const records = f.db.prepare('SELECT * FROM records').all(), oldAudit = f.db.prepare('SELECT * FROM audit_logs').all();
    assert.deepEqual(f.service.sweep(), []);
    f.clock.value = deadline;
    assert.deepEqual(f.service.sweep(), [1, 2]);
    for (const id of [1, 2]) {
      const after = f.get(id), original = before[id - 1];
      assert.equal(after.status, 'disabled'); assert.equal(after.session_version, 1);
      assert.deepEqual({ ...after, status: original.status, session_version: original.session_version, updated_at: original.updated_at }, original);
      assert.equal(f.sessions.matches({ session_version: 0 }, after), false);
      assert.equal(f.sessions.matches({}, after), false);
    }
    for (const id of [3, 4, 5, 6, 7]) assert.deepEqual(f.get(id), before[id - 1]);
    assert.deepEqual(f.db.prepare('SELECT * FROM student_profiles').all(), profiles);
    assert.deepEqual(f.db.prepare('SELECT * FROM records').all(), records);
    assert.deepEqual(f.db.prepare('SELECT * FROM audit_logs WHERE id=1').all(), oldAudit);
    const audits = f.db.prepare("SELECT * FROM audit_logs WHERE action='disableGraduatedStudent'").all();
    assert.equal(audits.length, 2);
    for (const audit of audits) {
      assert.equal(audit.operator_role, 'system'); assert.equal(audit.target_type, 'accounts');
      const after = JSON.parse(audit.after_json); assert.equal(after.cutoff_at, '2026-12-31T16:00:00.000Z');
      assert.equal(after.graduation_year, 2026); assert.equal(after.session_version, 1);
      assert.ok(!audit.before_json.includes('password_hash') && !audit.after_json.includes('password_hash'));
    }
    assert.deepEqual(f.disconnected, [1, 2]); assert.equal(f.notifications.length, 1);
  } finally { f.close(); }
});

test('repeat checks never rewrite disabled students or create repeated audit entries', () => {
  const f = fixture({ date: deadline });
  try {
    f.service.sweep(); const accounts = f.db.prepare('SELECT * FROM accounts').all(), auditCount = f.db.prepare('SELECT count(*) n FROM audit_logs').get().n;
    f.clock.value = '2027-01-03T12:00:00+08:00';
    assert.deepEqual(f.service.sweep(), []);
    assert.deepEqual(f.service.enforceAccount(f.get(1)), f.get(1));
    assert.deepEqual(f.db.prepare('SELECT * FROM accounts').all(), accounts);
    assert.equal(f.db.prepare('SELECT count(*) n FROM audit_logs').get().n, auditCount);
    assert.deepEqual(f.disconnected, [1, 2]);
  } finally { f.close(); }
});

test('expiry is an atomic status, session, and audit transaction and never disconnects on rollback', () => {
  const f = fixture({ date: deadline, auditFailure: id => id === '2' });
  try {
    const before = f.db.prepare('SELECT * FROM accounts').all(), oldAudits = f.db.prepare('SELECT * FROM audit_logs').all();
    assert.throws(() => f.service.sweep(), /test audit failed/);
    assert.deepEqual(f.db.prepare('SELECT * FROM accounts').all(), before);
    assert.deepEqual(f.db.prepare('SELECT * FROM audit_logs').all(), oldAudits);
    assert.deepEqual(f.disconnected, []); assert.deepEqual(f.notifications, []);
  } finally { f.close(); }
});

test('expired students cannot be enabled; moving graduation into the future requires explicit manual enabling', () => {
  const f = fixture({ date: deadline });
  try {
    f.service.sweep(); assert.throws(() => f.service.assertMayActivate(f.get(1)), /毕业年份已结束/);
    f.db.prepare('UPDATE student_profiles SET graduation_year=2028 WHERE account_id IN (1,3)').run();
    f.service.sweep(); assert.equal(f.get(1).status, 'disabled'); assert.equal(f.get(3).status, 'disabled');
    f.service.assertMayActivate(f.get(1));
    f.sessions.changeStatus(1, 'active', () => {});
    assert.equal(f.get(1).session_version, 2); assert.equal(f.sessions.matches({ session_version: 0 }, f.get(1)), false);
    assert.equal(f.sessions.matches({ session_version: 1 }, f.get(1)), false);
    assert.equal(f.sessions.matches({ session_version: 2 }, f.get(1)), true);
    assert.deepEqual(f.service.sweep(), []);
    assert.equal(f.get(1).status, 'active'); assert.equal(f.get(3).status, 'disabled');
  } finally { f.close(); }
});

test('startup catches missed cutoffs and the unreferenced minute timer checks without requests and stops cleanly', () => {
  const f = fixture();
  try {
    f.service.start(); f.service.start();
    assert.equal(f.schedules.length, 1); assert.equal(f.schedules[0].interval, 60000); assert.equal(f.schedules[0].unreferenced, true);
    assert.equal(f.get(1).status, 'active'); f.clock.value = deadline; f.schedules[0].callback();
    assert.equal(f.get(1).status, 'disabled');
    f.service.stop(); f.service.stop(); assert.equal(f.cancellations.length, 1);
  } finally { f.close(); }
  const restarted = fixture({ date: '2027-04-02T08:00:00+08:00' });
  try { restarted.service.start(); assert.equal(restarted.get(1).status, 'disabled'); assert.equal(restarted.get(2).status, 'disabled'); }
  finally { restarted.close(); }
});

test('a timer audit failure rolls back, reports once, and succeeds on a later retry', () => {
  let fail = true;
  const f = fixture({ auditFailure: () => fail });
  try {
    f.service.start(); f.clock.value = deadline; f.schedules[0].callback();
    assert.equal(f.get(1).status, 'active'); assert.deepEqual(f.errors, ['test audit failed']); assert.deepEqual(f.disconnected, []);
    fail = false; f.schedules[0].callback(); assert.equal(f.get(1).status, 'disabled');
    assert.equal(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='disableGraduatedStudent'").get().n, 2);
  } finally { f.close(); }
});

test('an invalid or missing graduation year is never guessed', () => {
  const f = fixture({ date: '2052-01-01T00:00:00+08:00' });
  try {
    f.db.prepare('UPDATE student_profiles SET graduation_year=2025 WHERE account_id=1').run();
    f.db.prepare('UPDATE student_profiles SET graduation_year=2051 WHERE account_id=2').run();
    f.service.sweep(); assert.equal(f.get(1).status, 'active'); assert.equal(f.get(2).status, 'pending'); assert.equal(f.get(6).status, 'active');
  } finally { f.close(); }
});

test('expired accounts lose live SSE sessions while other accounts remain connected', () => {
  const f = fixture({ date: deadline }), changes = createChanges(), streams = [];
  function connect(id) {
    const req = new EventEmitter(), res = new EventEmitter(); req.account = { _id: String(id) };
    res.chunks = []; res.set = () => {}; res.flushHeaders = () => {}; res.write = value => res.chunks.push(value);
    res.end = value => { if (value) res.chunks.push(value); res.writableEnded = true; res.emit('close'); };
    changes.connect(req, res); streams.push(res); return res;
  }
  try {
    const student = connect(1), teacher = connect(4);
    const service = createExpiry({ db: f.db, nowISO: () => new Date(f.clock.value).toISOString(), accountSessions: f.sessions,
      addAudit: () => {}, recordChanges: changes });
    service.sweep(); assert.equal(student.writableEnded, true); assert.ok(student.chunks.some(value => value.includes('session-expired')));
    assert.ok(!teacher.writableEnded); assert.ok(teacher.chunks.some(value => value.includes('records-changed')));
  } finally { for (const stream of streams) if (!stream.writableEnded) stream.end(); f.close(); }
});

async function httpFixture() {
  const projectRoot = path.resolve(__dirname, "../..");
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, '.tmp-security-graduation-'));
  const sourceServer = path.join(projectRoot, 'server');
  fs.cpSync(sourceServer, path.join(temporaryRoot, 'server'), { recursive: true,
    filter: source => !['data', 'uploads', 'backups', 'logs'].includes(path.relative(sourceServer, source).split(path.sep)[0]) && !source.endsWith('.test.cjs'),
  });
  fs.cpSync(path.join(projectRoot,'src'),path.join(temporaryRoot,'src'),{recursive:true});
  fs.copyFileSync(path.join(projectRoot, 'src/config/dropdown-options.json'), path.join(temporaryRoot, 'src/config/dropdown-options.json'));
  const clock = { value: lastSecond };
  const runtime = require(path.join(temporaryRoot, 'server/runtime.cjs'))({ clock: () => new Date(clock.value).toISOString() });
  require(path.join(temporaryRoot, 'server/routes/auth.cjs'))(runtime); require(path.join(temporaryRoot, 'server/routes/ops.cjs'))(runtime);
  const password = 'test-only-password', passwordHash = runtime.bcrypt.hashSync(password, 12);
  for (const [username, role] of [['示例学生', 'student'], ['登录学生', 'student'], ['资料学生', 'student'], ['示例教师', 'teacher'], ['示例管理员', 'admin']]) {
    runtime.db.prepare(`INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at)
      VALUES(?,?,?,'active',?,?,?)`).run(username, username, role, passwordHash, runtime.nowISO(), runtime.nowISO());
  }
  const get = username => runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
  for (const username of ['示例学生', '登录学生', '资料学生']) runtime.studentProfiles.save({ headers: {}, ip: 'isolated test' }, get(username),
    { responsible_teacher_username: '示例教师', guiding_teacher_username: '示例教师', graduation_year: username === '资料学生' ? 2028 : 2026 });
  const tokens = Object.fromEntries(['示例学生', '登录学生', '资料学生', '示例教师', '示例管理员'].map(name => [name, runtime.signToken(get(name))]));
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  async function request(url, body = {}, token) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  return { ...runtime, clock, get, tokens, request, password, temporaryRoot,
    async close() {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); runtime.db.close();
      for (const file of Object.keys(require.cache)) if (file.startsWith(temporaryRoot + path.sep)) delete require.cache[file];
      const relative = path.relative(projectRoot, temporaryRoot);
      assert.ok(relative.startsWith('.tmp-security-graduation-') && !relative.includes(path.sep));
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    },
  };
}

test('HTTP login, authorization, profile save and admin status enforce the same graduation deadline', async t => {
  const f = await httpFixture(); t.after(() => f.close());
  await t.test('December 31 remains usable through 23:59:59 Beijing', async () => {
    const login = await f.request('/api/auth/login', { username: '示例学生', password: f.password });
    assert.equal(login.status, 200); assert.ok(login.body.session_token);
    assert.equal((await f.request('/api/auth/me', {}, f.tokens['示例学生'])).status, 200);
  });
  f.clock.value = deadline;
  await t.test('a valid old JWT expires at the next-year midnight even before a timer sweep', async () => {
    const response = await f.request('/api/auth/me', {}, f.tokens['示例学生']);
    assert.equal(response.status, 401); assert.equal(response.body.code, 'SESSION_EXPIRED');
    assert.equal(f.get('示例学生').status, 'disabled'); assert.equal(f.get('示例学生').session_version, 1);
    assert.equal((await f.request('/api/auth/me', {}, f.tokens['示例教师'])).status, 200);
    assert.equal((await f.request('/api/auth/me', {}, f.tokens['示例管理员'])).status, 200);
  });
  await t.test('wrong passwords and nonexistent accounts share the error; status is checked after the correct password', async () => {
    const wrong = await f.request('/api/auth/login', { username: '登录学生', password: 'wrong-test-password' });
    const unknown = await f.request('/api/auth/login', { username: '不存在学生', password: 'wrong-test-password' });
    assert.equal(wrong.status, 400); assert.equal(wrong.body.message, '账号或密码错误。'); assert.equal(unknown.body.message, wrong.body.message);
    assert.equal(f.get('登录学生').status, 'active');
    const correct = await f.request('/api/auth/login', { username: '登录学生', password: f.password });
    assert.equal(correct.status, 400); assert.equal(correct.body.message, '账号已停用，请联系管理员。');
    assert.equal(f.get('登录学生').status, 'disabled'); assert.ok(!correct.body.session_token);
  });
  await t.test('admin cannot reactivate an expired student; changing the year does not revive old tokens', async () => {
    const student = f.get('示例学生');
    const denied = await f.request('/api/ops/adminSetAccountStatus', { id: student.id, status: 'active' }, f.tokens['示例管理员']);
    assert.equal(denied.status, 400); assert.match(denied.body.message, /毕业年份已结束/); assert.equal(f.get('示例学生').status, 'disabled');
    f.db.prepare('UPDATE student_profiles SET graduation_year=2028 WHERE account_id=?').run(student.id);
    f.graduationExpiry.sweep(); assert.equal(f.get('示例学生').status, 'disabled');
    const enabled = await f.request('/api/ops/adminSetAccountStatus', { id: student.id, status: 'active' }, f.tokens['示例管理员']);
    assert.equal(enabled.status, 200); assert.equal(f.get('示例学生').session_version, 2);
    assert.equal((await f.request('/api/auth/me', {}, f.tokens['示例学生'])).status, 401);
    assert.equal((await f.request('/api/auth/login', { username: '示例学生', password: f.password })).status, 200);
  });
  await t.test('saving an already elapsed graduation year immediately disables the student and retains the profile', async () => {
    const response = await f.request('/api/profile/save', { responsible_teacher_username: '示例教师', guiding_teacher_username: '示例教师', graduation_year: 2026 }, f.tokens['资料学生']);
    assert.equal(response.status, 401); assert.equal(response.body.code, 'SESSION_EXPIRED');
    assert.equal(f.get('资料学生').status, 'disabled'); assert.equal(f.get('资料学生').session_version, 1);
    assert.equal(f.studentProfiles.read(f.get('资料学生')).graduation_year, 2026);
  });
  await t.test('platform restart catches a cutoff missed during downtime', () => {
    f.db.prepare("UPDATE accounts SET status='active' WHERE username='登录学生'").run();
    f.graduationExpiry.stop(); f.graduationExpiry.start();
    assert.equal(f.get('登录学生').status, 'disabled'); assert.equal(f.get('登录学生').session_version, 2);
    f.graduationExpiry.stop();
  });
});
