import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const roles = { student: '示例提醒学生', teacher: '示例提醒教师', finance: '示例提醒财务', admin: '示例提醒管理' };
const heading = '今天出入库了吗？';

// Run the built UI and real login, receipt and notification routes on an empty throwaway database.
export async function checkInventoryReminder(browser, out) {
  const temp = fs.mkdtempSync(path.join(root, '.tmp-ui-reminder-'));
  const password = randomBytes(20).toString('hex');
  const secrets = Object.fromEntries(['JWT_SECRET', 'STUDENT_INVITE_CODE', 'TEACHER_INVITE_CODE', 'ADMIN_INVITE_CODE', 'FINANCE_INVITE_CODE'].map(key => [key, randomBytes(32).toString('hex')]));
  const oldEnv = Object.fromEntries(Object.keys(secrets).map(key => [key, process.env[key]]));
  const oldMinimum = process.env.PLATFORM_MIN_CLIENT_VERSION;
  const pages = [], errors = [];
  let runtime, server;
  try {
    Object.assign(process.env, secrets, { PLATFORM_MIN_CLIENT_VERSION: '' });
    fs.cpSync(path.join(root, 'server'), path.join(temp, 'server'), {
      recursive: true, filter: src => !['uploads','logs','backups','data'].includes(path.relative(path.join(root,'server'), src).split(path.sep)[0]),
    });
    fs.cpSync(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
    runtime = require(path.join(temp, 'server/runtime.cjs'))();
    for (const name of ['auth', 'ops', 'events']) require(path.join(temp, 'server/routes', name + '.cjs'))(runtime);
    runtime.app.use(runtime.express.static(path.join(root, 'dist')));
    server = await new Promise(resolve => { const listener = runtime.app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const hash = runtime.bcrypt.hashSync(password, 12);
    for (const [role, name] of Object.entries(roles)) {
      runtime.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?, ?,?,?,?)')
        .run(name, name, role, 'active', hash, runtime.nowISO(), runtime.nowISO());
    }
    const studentRow = runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(roles.student);
    runtime.studentProfiles.save({ headers: {}, ip: 'test' }, studentRow, {
      responsible_teacher_username: roles.teacher, guiding_teacher_username: roles.teacher, graduation_year: 2050,
    });
    const post = async (endpoint, token, data = {}) => {
      const response = await fetch(origin + '/api/' + endpoint, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(data) });
      return { status: response.status, body: await response.json() };
    };
    async function openPage(width) {
      const page = await browser.newPage({ viewport: { width, height: 860 } });
      pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      return page;
    }
    async function login(page, role) {
      await page.locator('input[autocomplete="username"]').fill(roles[role]);
      await page.locator('input[autocomplete="current-password"]').fill(password);
      const response = page.waitForResponse(r => r.url() === origin + '/api/auth/login');
      await page.locator('form button').last().click();
      const data = await (await response).json();
      assert(data.ok); return data.session_token;
    }
    const viewers = await Promise.all(['teacher', 'finance', 'admin'].map(async (role, i) => {
      const page = await openPage(i === 1 ? 390 : 1280);
      const token = await login(page, role);
      const section = page.getByRole('region', { name: '学生出入库提醒已读记录' });
      await section.getByText('暂无已读记录。').waitFor();
      assert.equal((await post('inventory-reminder/ack', token)).status, 403);
      return section;
    }));
    const desktop = await openPage(1440);
    const phone = await openPage(320);
    const desktopToken = await login(desktop, 'student');
    const phoneToken = await login(phone, 'student');
    assert.notEqual(desktopToken, phoneToken);
    for (const page of [desktop, phone]) {
      const dialog = page.getByRole('dialog', { name: heading });
      await dialog.getByText('物品用完及时出库，采购到货及时入库', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.mouse.click(2, 2);
      assert(await dialog.isVisible()); assert.equal(await page.getByRole('region', { name:'我的待办' }).count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await phone.screenshot({ path: path.join(out, 'inventory-reminder-mobile.png') });
    assert.equal((await post('ops/listAll', desktopToken)).body.code, 'INVENTORY_REMINDER_REQUIRED');
    await desktop.reload();
    await desktop.getByRole('button', { name: '已读', exact: true }).click();
    const card = desktop.getByRole('region', { name:'我的待办' });
    await card.getByText(heading, { exact:true }).waitFor();
    assert(await card.getByText(heading).evaluate(e => Number(getComputedStyle(e).fontWeight) >= 700));
    await Promise.all(viewers.map(section => section.getByText(roles.student, { exact: true }).waitFor({ timeout: 7000 })));
    assert.deepEqual(await Promise.all(viewers.map(section => section.locator('time').count())), [1,1,1]);
    assert.equal((await post('inventory-reminder/history', desktopToken)).status, 403);
    assert.equal((await post('ops/listAll', desktopToken)).status, 200);
    assert.equal((await post('ops/listAll', phoneToken)).status, 403);
    await desktop.reload();
    await card.getByText(heading, { exact:true }).waitFor();
    assert.equal(await desktop.getByRole('dialog').count(), 0);

    // Lose the first reply after the database commit. The UI stays locked, and retry returns the same receipt.
    await phone.route('**/api/inventory-reminder/ack', async route => {
      await route.fetch();
      await route.fulfill({ status: 503, json: { ok: false, message: '测试网络中断' } });
    }, { times: 1 });
    await phone.getByRole('button', { name:'已读', exact:true }).click();
    await phone.getByRole('dialog').getByRole('alert').waitFor();
    await phone.getByRole('button', { name:'已读', exact:true }).click();
    await phone.getByRole('region', { name:'我的待办' }).getByText(heading).waitFor();
    for (const section of viewers) await section.getByRole('button', { name:'查看全部（2）' }).waitFor({ timeout: 7000 });
    await viewers[0].getByRole('button', { name:'查看全部（2）' }).click();
    await viewers[0].locator('time').nth(1).waitFor();
    assert.equal(runtime.db.prepare('SELECT count(*) AS n FROM inventory_reminder_reads').get().n, 2);
    // First registration still requires both acknowledgement and the student's original profile.
    const registered = await post('auth/register', null, { username:'示例新同学', display_name:'示例新同学', account_type:'student', student_code:runtime.STUDENT_INVITE_CODE, password });
    assert.equal(registered.status, 200);
    const newToken = registered.body.session_token;
    assert.equal((await post('profile/save', newToken, {})).body.code, 'INVENTORY_REMINDER_REQUIRED');
    assert.equal((await post('inventory-reminder/ack', newToken)).status, 200);
    assert.equal((await post('ops/listAll', newToken)).body.code, 'PROFILE_REQUIRED');
    assert.equal((await post('inventory-reminder/ack', newToken)).status, 200);
    assert.equal(runtime.db.prepare('SELECT count(*) AS n FROM inventory_reminder_reads').get().n, 3);
    assert.deepEqual(errors, []);
    return [{ inventoryReminder: true, studentSessions: 2, liveViewerRoles: 3, mobileWidth: 320, retryAndRegistration: true, errors }];
  } finally {
    await Promise.all(pages.map(p => p.close()));
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    runtime?.db.close();
    for (const [key, value] of Object.entries({ ...oldEnv, PLATFORM_MIN_CLIENT_VERSION: oldMinimum })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(path.dirname(temp), root); assert(path.basename(temp).startsWith('.tmp-ui-reminder-'));
    fs.rmSync(temp, { recursive:true, force:true });
  }
}
