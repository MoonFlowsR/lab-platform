import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkDashboardCounts(browser, origin, out, base, users) {
  const results = [];
  const student = users.find(user => user.account_type === 'student');
  const teacher = users.find(user => user.account_type === 'teacher');
  const types = ['测试', '加工', '维修', '采购'];
  const templates = [
    { status: '待教师审核' }, { status: '已撤回' }, { status: '已通过' }, { status: '已驳回' },
    { status: '已关闭' }, { status: '已完成' }, { status: '已完成', completion_modified: true, inbound_modified: true },
  ];
  const rows = types.flatMap((type, t) => [false, true].flatMap(other => templates.map((template, i) => ({
    ...template, _id: String(10000 + t * 100 + Number(other) * 10 + i), public_id: `QA-${t}-${Number(other)}-${i}`,
    request_type: type, work_content: '核对' + type + i, material_name: '核对材料' + i,
    status: type === '采购' && template.status === '已通过' ? '待入库' : template.status,
    applicant_username: other ? 'example-other-student' : student.username,
    applicant_name: other ? '另一学生' : student.display_name,
    review_teacher_username: other ? 'example-other-teacher' : teacher.username,
    external_unit: '核对机构', preferred_supplier: '核对供应商', created_at: `2026-10-${10 + i}T00:00:00Z`,
    estimated_price: 10, actual_total_price: template.status === '已完成' ? 10 : undefined,
    cost_test: 10, cost_processing: 10, cost_repair: 10,
  }))));
  const hiddenRows = types.map((type, i) => ({ ...rows[i * 14], _id: String(20000 + i), public_id: 'QA-HIDDEN-' + i }));
  const allRows = [...rows, ...hiddenRows];
  const movements = ['入库', '出库', '退库', '库存修正', '入库'].map((transaction_type, i) => ({
    _id: String(30000 + i), transaction_type, material_name: '流水材料', operator_username: i < 3 ? student.username : 'example-other-student',
    quantity: 1, unit: '盒', created_at: '2026-10-19T00:00:00Z',
  }));
  for (const width of [1440, 390, 320]) for (const user of [...users, { ...teacher, default_view_scope: 'all' }]) {
    const account = { ...user, session_token: 'dashboard-fixture', profile_required: false };
    const role = account.account_type, team = role === 'admin' || account.default_view_scope === 'all';
    const scale = team ? 2 : 1;
    const expected = [2 * scale + (role === 'admin' ? 1 : 0), 2 * scale, 2 * scale, scale];
    const total = expected.reduce((a, b) => a + b, 0);
    const countsFor = type => role === 'teacher' && type === '测试' ? [expected[0] - scale, ...expected.slice(1)] : expected;
    const label = account.default_view_scope === 'all' ? 'finance' : role;
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: base.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, revision: 'dashboard-fixture', data: {
        ...base, current_account: account,
        lab_work_requests: allRows.filter(row => row.request_type !== '采购'), lab_purchase_requests: allRows.filter(row => row.request_type === '采购'),
        lab_stock_transactions: movements, lab_stock_out_requests: [],
        lab_user_hidden_records: hiddenRows.map(row => ({ target_collection: row.request_type === '采购' ? 'lab_purchase_requests' : 'lab_work_requests', target_id: row._id })),
        lab_material_batches: [400000, 587654].map((current_qty, i) => ({ _id: String(40000 + i), material_id: '50000', material_name: '汇总检索核对材料', spec: '相同规格', storage_room: 'A101', unit: '盒', current_qty, expiry_date: '长期', created_at: '2026-10-19T00:00:00Z' })),
      } } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0 } });
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('.platform-sync-status')?.textContent.includes('同步状态：同步完成'));
    await page.getByRole('region', { name: '我的待办', exact: true }).waitFor();
    assert.equal(await page.locator('main .platform-business-metrics').count(), 0, 'Overview does not repeat the report');
    assert.match(await page.getByRole('region', { name: '团队库存提醒', exact: true }).innerText(), /2 个批次/);
    await page.screenshot({ path: path.join(out, `counts-${label}-${width}.png`), fullPage: true });
    for (const type of types) {
      await page.getByRole('button', { name: '查看' + (type === '采购' ? '采购/入库' : type) + ' →', exact: true }).click();
      for (const [i, className] of ['pending', 'approved', 'reviewed', 'modified'].entries()) {
        const section = page.locator('main > .platform-section-' + className);
        assert.match(await section.locator('h2').innerText(), new RegExp(`（${countsFor(type)[i]}）$`));
      }
      // Leave an old, narrower institution selection. A dashboard link must reset it.
      if (role !== 'student') {
        if (width < 641) await page.getByRole('button', { name: /展开筛选/ }).click();
        const field = page.getByPlaceholder('搜索或选择' + (type === '采购' ? '采购单位' : type === '维修' ? '维修人员单位' : type + '机构'));
        await field.fill(type === '采购' ? '核对供应商' : '核对机构');
        await page.getByRole('option', { name: type === '采购' ? '核对供应商' : '核对机构', exact: true }).click();
      }
      if (role === 'student' || role === 'teacher') {
        const scope = page.getByPlaceholder('搜索或选择查看范围');
        await scope.fill(team ? '本人' : '全部');
        await page.getByRole('option', { name: team ? '本人' : '全部', exact: true }).click();
      }
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '总览', exact: true }).click();await showModuleRecords(page);
      await page.getByRole('button', { name: '查看' + (type === '采购' ? '采购/入库' : type) + ' →', exact: true }).click();
      assert.match(await page.locator('main > .platform-section-pending h2').innerText(), new RegExp(`（${countsFor(type)[0]}）$`));
      if (role !== 'student') assert.equal(await page.getByPlaceholder('搜索或选择' + (type === '采购' ? '采购单位' : type === '维修' ? '维修人员单位' : type + '机构')).inputValue(), '全部');
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '总览', exact: true }).click();await showModuleRecords(page);
    }
    await page.getByRole('searchbox', { name: '搜索记录', exact: true }).fill('987654');
    assert.match(await page.getByRole('region', { name: '团队库存提醒', exact: true }).innerText(), /2 个批次/);
    await page.getByRole('button', { name: '查看全部库存 →', exact: true }).click();
    assert.match(await page.getByRole('region', { name: '当前筛选库存', exact: true }).innerText(), /2 个批次/);
    results.push({ dashboardCounts: true, role: label, width, totalPerType: total, countersMatchSections: true, scopeReset: true, groupedInventorySearch: true, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors });
    await page.close();
  }
  return results;
}
