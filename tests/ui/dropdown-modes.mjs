import assert from 'node:assert/strict';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

async function chooseFixed(control, value, { required = false, compact = false } = {}) {
  assert.equal(await control.evaluate(element => element.tagName), 'SELECT', 'Fixed choices use a native picker, without a text keyboard');
  assert.equal(await control.getAttribute('required') !== null, required);
  if (!compact) assert((await control.boundingBox()).height >= 44, 'Picker remains easy to tap');
  await control.selectOption(value);
  assert.equal(await control.inputValue(), value);
}

async function verifySearch(page, control, term) {
  assert.equal(await control.evaluate(element => element.tagName), 'INPUT', 'Expandable lists retain typed search even with few current choices');
  await control.fill('__没有此选项__');
  const menu = page.getByRole('listbox');
  await menu.getByText('无相关内容', { exact: true }).waitFor();
  assert.equal(await menu.getByRole('option').count(), 0);
  await control.fill(term);
  const matches = menu.getByRole('option');
  assert(await matches.count() > 0);
  for (const match of await matches.all()) assert((await match.innerText()).includes(term), 'Search only displays matches');
  await matches.first().click();
  assert.equal(await page.getByRole('listbox').count(), 0, 'Choosing an option closes the search menu');
}

export async function checkDropdownModes(browser, origin, snapshot, users) {
  const student = users.find(user => user.account_type === 'student');
  const results = [];
  for (const width of [1440, 390, 320]) for (const theme of ['light', 'dark', 'mixed']) {
    const account = { ...student, profile_required: false, session_token: 'isolated-dropdown-modes' };
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ account, theme }) => {
      sessionStorage.setItem('surface_lab_account', JSON.stringify(account));
      localStorage.setItem('platform:theme', theme);
    }, { account, theme });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() !== 'GET' && !['/api/auth/me', '/api/ops/listAll'].includes(url.pathname)) writes.push(url.pathname);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'dropdown-modes' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    async function module(label) {
      await openNavigation(page);
      await page.locator('.platform-nav').getByRole('button', { name: label, exact: true }).click();
      await showModuleRecords(page);
    }
    await page.goto(origin);
    await page.getByTestId('task-total').waitFor();
    await module('测试');
    await chooseFixed(page.getByRole('combobox', { name: '查看范围', exact: true }), 'mine', { compact: true });
    const date = page.locator('.platform-module-filters').getByRole('combobox');
    await chooseFixed(date, 'custom');
    assert.equal(await page.locator('.platform-module-filters input[type=date]').count(), 2);
    await date.selectOption('all');
    assert.equal(await page.locator('.platform-module-filters input[type=date]').count(), 0);
    await page.getByRole('button', { name: '新建测试', exact: true }).click();
    await verifySearch(page, page.getByPlaceholder('选择测试名称或搜索“其它”'), '其它');
    await verifySearch(page, page.getByPlaceholder('搜索或选择审核教师'), snapshot.lab_teacher_accounts[0].display_name);

    await module('采购/入库');
    await page.getByRole('button', { name: '新建采购', exact: true }).click();
    let form = page.locator('.platform-section-create form');
    await chooseFixed(form.getByRole('combobox', { name: /采购类别/ }), '耗材', { required: true });
    await chooseFixed(form.getByRole('combobox', { name: /使用目的/ }), '公用', { required: true });
    await verifySearch(page, form.getByPlaceholder('选择物品或搜索“其它”'), '其它');

    await module('出/退库');
    await page.getByRole('button', { name: '新增记录', exact: true }).click();
    form = page.locator('.platform-section-create form');
    await chooseFixed(form.getByRole('combobox', { name: /类型/ }), '退库', { required: true });
    await verifySearch(page, form.getByPlaceholder('搜索或选择采购材料'), snapshot.lab_material_batches[0].material_name);
    await chooseFixed(form.getByRole('combobox', { name: /存放房间/ }), '__other_room__', { required: true });
    assert.equal(await form.getByLabel('其它存放房间').count(), 1);

    await module('库存');
    await page.getByRole('button', { name: '开始录入现有材料', exact: true }).click();
    form = page.locator('.platform-section-create form');
    await chooseFixed(form.getByRole('combobox', { name: /材料类别/ }), '试剂原料', { required: true });
    await chooseFixed(form.getByRole('combobox', { name: /使用目的/ }), '公用', { required: true });
    await chooseFixed(form.getByRole('combobox', { name: /存放房间/ }), '__other_room__', { required: true });
    await verifySearch(page, form.getByPlaceholder('选择材料或搜索“其它”'), '其它');

    await page.getByRole('button', { name: '账户设置', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await chooseFixed(dialog.getByRole('combobox', { name: /毕业年份/ }), '2028', { required: true });
    await verifySearch(page, dialog.getByPlaceholder('搜索或选择系统责任教师'), snapshot.lab_teacher_accounts[0].display_name);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    assert.deepEqual(writes, [], 'The picker checks do not submit business records');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ dropdownModes: true, width, theme, fixedPickers: true, searchableCatalogs: true, overflow: false, errors });
    await page.close();
  }
  return results;
}
