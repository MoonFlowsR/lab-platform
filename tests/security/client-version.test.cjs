const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const createClientVersion = require('../../server/security/client-version.cjs');

test('client versions compare numeric major, minor and patch parts', () => {
  const gate = createClientVersion({ minimum: '2.9.9' });
  for (const value of ['2.9.9', '2.9.10', '2.10.0', '3.0.0']) assert.equal(gate.accepts(value), true);
  for (const value of ['2.9.8', '2.8.99', '1.99.99']) assert.equal(gate.accepts(value), false);
  assert.equal(gate.requestVersion({ headers: { 'x-platform-ui-version': ' 2.10.0 ' } }), '2.10.0');
});

test('missing, malformed and unsafe versions cannot satisfy an enabled compatibility floor', () => {
  const gate = createClientVersion({ minimum: '2.6.0' });
  for (const value of [undefined, null, 2.6, '', '2.6', '02.6.0', 'v2.6.0', '2.6.0-rc.1', '2.6.0 extra', '99999999999999999.0.0', ['2.6.0']]) {
    assert.equal(gate.accepts(value), false);
    assert.throws(() => gate.assertToken({ client_version: value }), error => error.code === 'CLIENT_UPDATE_REQUIRED');
  }
  for (const minimum of ['2.6', 'invalid', '01.0.0']) assert.throws(() => createClientVersion({ minimum }), /PLATFORM_MIN_CLIENT_VERSION/);
});

test('an unset floor preserves legacy headers and tokens without any migration', () => {
  const gate = createClientVersion({ minimum: '' });
  assert.equal(gate.minimum, '');
  assert.equal(gate.accepts(undefined), true);
  assert.doesNotThrow(() => gate.assertToken({}));
  let next = 0;
  gate.requireCurrent({ headers: {} }, { status: () => assert.fail('Legacy clients must remain compatible') }, () => next++);
  assert.equal(next, 1);
});

test('old authentication requests receive an explicit refresh response before their handler runs', () => {
  const gate = createClientVersion({ minimum: '2.6.0' });
  let next = 0, status, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  for (const value of [undefined, '2.5.4']) {
    gate.requireCurrent({ headers: { 'x-platform-ui-version': value } }, response, () => next++);
    assert.equal(status, 409); assert.equal(body.code, 'CLIENT_UPDATE_REQUIRED');
    assert.equal(body.message, '平台已更新，请刷新页面后重新登录。');
  }
  gate.requireCurrent({ headers: { 'x-platform-ui-version': '2.6.0' } }, response, () => next++);
  assert.equal(next, 1);
});

async function withRuntime(minimum, run) {
  const root = path.resolve(__dirname, '../..');
  const temporary = fs.mkdtempSync(path.join(root, '.tmp-client-version-'));
  const names = ['PLATFORM_MIN_CLIENT_VERSION', 'JWT_SECRET', 'STUDENT_INVITE_CODE', 'TEACHER_INVITE_CODE', 'FINANCE_INVITE_CODE', 'ADMIN_INVITE_CODE'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let runtime, server;
  try {
    process.env.PLATFORM_MIN_CLIENT_VERSION = minimum;
    for (const name of names.slice(1)) process.env[name] = randomBytes(32).toString('hex');
    fs.cpSync(path.join(root, 'server'), path.join(temporary, 'server'), { recursive: true,
      filter: source => !['data', 'uploads', 'logs', 'backups'].includes(path.relative(path.join(root, 'server'), source).split(path.sep)[0]) });
    fs.cpSync(path.join(root, 'src'), path.join(temporary, 'src'), { recursive: true });
    runtime = require(path.join(temporary, 'server/runtime.cjs'))({ clock: () => '2026-10-27T00:00:00Z' });
    require(path.join(temporary, 'server/routes/auth.cjs'))(runtime);
    const at = '2026-10-27T00:00:00Z', password = 'synthetic-upgrade-password';
    runtime.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run('示例升级管理员', '示例升级管理员', 'admin', 'active', runtime.bcrypt.hashSync(password, 12), at, at);
    const account = runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get('示例升级管理员');
    let mutations = 0;
    runtime.app.post('/api/test-mutation', runtime.authMiddleware, (req, res) => { mutations++; res.json({ ok: true }); });
    server = await new Promise(resolve => { const listener = runtime.app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const call = async (route, body = {}, token, version) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(version ? { 'X-Platform-UI-Version': version } : {}) },
        body: JSON.stringify(body) });
      return { status: response.status, json: await response.json() };
    };
    await run({ runtime, account, password, call, mutations: () => mutations });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    runtime?.db.close();
    for (const name of names) if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];
    assert.equal(path.dirname(temporary), root); assert(path.basename(temporary).startsWith('.tmp-client-version-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

test('real authentication rejects legacy requests and tokens without touching accounts, audits or business state, then accepts the refreshed client', async () => {
  await withRuntime('2.6.0', async ({ runtime, account, password, call, mutations }) => {
    const credentials = { username: account.username, password };
    const registration = { username: '示例升级学生', display_name: '示例升级学生', password, account_type: 'student', student_code: runtime.STUDENT_INVITE_CODE };
    const initial = runtime.db.prepare('SELECT total_changes() AS count').get().count;
    for (const version of [undefined, '2.5.4']) for (const route of ['login', 'register']) {
      const result = await call('auth/' + route, route === 'login' ? credentials : registration, null, version);
      assert.equal(result.status, 409); assert.equal(result.json.code, 'CLIENT_UPDATE_REQUIRED');
      assert.match(result.json.message, /刷新页面后重新登录/);
    }
    for (let index = 0; index < 65; index++)
      assert.equal((await call('auth/login', credentials, null, '2.5.4')).status, 409, 'An upgrade notice is not a failed credential attempt');
    for (const route of ['AUTH/LOGIN/', 'auth/register/'])
      assert.equal((await call(route, route.toLowerCase().includes('login') ? credentials : registration)).status, 409, 'The pre-limit gate matches the authentication routes');
    for (const version of [undefined, '2.5.4']) {
      const token = runtime.signToken(account, version);
      const result = await call('auth/me', {}, token);
      assert.equal(result.status, 401); assert.equal(result.json.code, 'CLIENT_UPDATE_REQUIRED');
      assert.equal((await call('test-mutation', {}, token, '2.6.0')).status, 401, 'A forged fresh request header cannot revive an old signed token');
    }
    assert.equal(mutations(), 0);
    assert.equal(runtime.db.prepare('SELECT total_changes() AS count').get().count, initial, 'Rejected upgrade traffic performs no database writes');
    const result = await call('auth/login', credentials, null, '2.6.0');
    assert.equal(result.status, 200); assert.equal(jwt.decode(result.json.session_token).client_version, '2.6.0');
    assert.equal((await call('auth/me', {}, result.json.session_token)).status, 200);
    assert.equal((await call('test-mutation', {}, result.json.session_token)).status, 200); assert.equal(mutations(), 1);
    const registered = await call('auth/register', registration, null, '2.6.0');
    assert.equal(registered.status, 200); assert.equal(jwt.decode(registered.json.session_token).client_version, '2.6.0');
    assert.equal(runtime.db.prepare('SELECT session_version FROM accounts WHERE id=?').get(account.id).session_version, account.session_version);
  });
});

test('real authentication remains compatible with old clients when no deployment floor is configured', async () => {
  await withRuntime('', async ({ runtime, account, password, call }) => {
    const result = await call('auth/login', { username: account.username, password });
    assert.equal(result.status, 200); assert.equal(jwt.decode(result.json.session_token).client_version, undefined);
    assert.equal((await call('auth/me', {}, runtime.signToken(account))).status, 200);
  });
});

test('frontend requests send the package version without changing credentials or business payloads', async () => {
  const { requestJson } = await import('../../src/shared/api/api-request.js');
  const version = require('../../package.json').version;
  await requestJson('/synthetic', { quantity: 2 }, 'synthetic-token', { fetcher: async (url, options) => {
    assert.equal(options.headers['X-Platform-UI-Version'], version);
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.deepEqual(JSON.parse(options.body), { quantity: 2 });
    return { ok: true, json: async () => ({ ok: true }) };
  } });
});
