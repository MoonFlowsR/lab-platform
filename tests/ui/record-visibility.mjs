import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import { readWorkbookText } from './workbook.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkRecordVisibility(browser, origin, out, snapshot, users) {
  const results = [];
  const student = users.find(user => user.account_type === 'student');
  const teacher = users.find(user => user.account_type === 'teacher');
  const records = [1, 2, 3].map(id => ({
    _id: id, public_id: 'QA-VISIBILITY-' + id, request_type: '测试', work_content: '展开核对项目' + id,
    applicant_username: student.username, applicant_name: student.display_name,
    review_teacher_username: teacher.username, review_teacher_name: teacher.display_name,
    status: '待教师审核', created_at: `2026-10-${10 + id}T00:00:00Z`,
  }));
  records.push({ ...records[0], _id: 4, public_id: 'QA-WITHDRAWN-TEST', work_content: '撤回测试核对', status: '已撤回', created_at: '2026-10-14T00:00:00Z' });
  const additionalWork = ['加工', '维修'].flatMap((request_type, index) => [
    { ...records[0], _id: 101 + index * 10, public_id: 'QA-VISIBLE-' + request_type, request_type, work_content: '保留' + request_type + '核对' },
    { ...records[3], _id: 102 + index * 10, public_id: 'QA-WITHDRAWN-' + request_type, request_type, work_content: '撤回' + request_type + '核对' },
  ]);
  const purchases = [
    { ...records[0], _id: 201, public_id: 'QA-VISIBLE-PURCHASE', material_name: '保留采购核对', quantity: 1, unit: '瓶', estimated_price: 10 },
    { ...records[3], _id: 202, public_id: 'QA-WITHDRAWN-PURCHASE', material_name: '撤回采购核对', quantity: 1, unit: '瓶', estimated_price: 999 },
  ];
  const stockRequests = [
    { ...records[0], _id: 301, public_id: 'QA-VISIBLE-STOCK', material_name: '保留出库核对', status: '待采购人审批', purchaser_username: teacher.username, purchaser_name: teacher.display_name, quantity: 1, unit: '瓶' },
    { ...records[3], _id: 302, public_id: 'QA-WITHDRAWN-STOCK', material_name: '撤回出库核对', purchaser_username: teacher.username, purchaser_name: teacher.display_name, quantity: 1, unit: '瓶' },
  ];
  for (const width of [1440, 390, 320]) for (const user of [...users, { ...teacher, account_type: 'finance' }]) {
    const account = { ...user, profile_required: false, session_token: 'visibility-fixture' };
    const total = 3, remaining = total - 1;
    const page = await browser.newPage({ viewport: { width, height: 960 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: [teacher] } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account, lab_work_requests: [...records, ...additionalWork], lab_purchase_requests: purchases, lab_stock_out_requests: stockRequests }, revision: 'visibility-fixture' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0 } });
    });
    await page.goto(origin);
    await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: account.account_type === 'student' ? '测试' : account.account_type === 'teacher' ? '测试审核' : '测试记录', exact: true }).click();await showModuleRecords(page);
    const section = page.locator('main > .platform-section-pending');
    const header = section.locator(':scope > .platform-record-limit');
    const footer = section.locator(':scope > .platform-record-more');
    const expand = header.getByRole('button', { name: `展开其余 ${remaining} 条`, exact: true });
    assert.equal(await header.innerText(), `当前显示 1 条，共 ${total} 条\n展开其余 ${remaining} 条`);
    assert.equal(await section.locator('h3').count(), 1);
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    const geometry = await expand.evaluate(button => {
      const rect = button.getBoundingClientRect(), header = button.parentElement.getBoundingClientRect();
      return { height: rect.height, fullWidth: Math.abs(rect.width - header.width) < 1, fits: rect.left >= 0 && rect.right <= innerWidth };
    });
    assert(geometry.height >= 44 && geometry.fits);
    if (width < 641) assert(geometry.fullWidth, 'Phone expand control fills the row');
    await page.screenshot({ path: path.join(out, `visibility-${account.account_type}-${width}.png`), fullPage: true });
    await footer.getByRole('button', { name: `还有 ${remaining} 条记录，展开查看`, exact: true }).click();
    assert.equal(await section.locator('h3').count(), total);
    assert.equal(await footer.count(), 0);
    const collapse = header.getByRole('button', { name: '收起，仅看最新1条', exact: true });
    assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
    const withdrawn = section.getByRole('heading', { name: '撤回测试核对', exact: true });
    assert.equal(await withdrawn.count(), 0);
    if (account.account_type === 'student') assert.equal(await section.getByRole('button', { name: '修改/重新提交', exact: true }).count(), 0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
    const workbook = await readWorkbookText(await (await download).path());
    assert.equal(workbook.includes('撤回测试核对'), false);
    await collapse.click();
    assert.equal(await section.locator('h3').count(), 1);
    await expand.focus(); await page.keyboard.press('Enter');
    assert.equal(await section.locator('h3').count(), total, 'Keyboard can expand the records');
    await collapse.click();
    await page.getByRole('searchbox', { name: '搜索记录', exact: true }).fill('展开核对项目1');
    await page.waitForFunction(() => document.querySelector('main > .platform-section-pending h2')?.textContent.endsWith('（1）'));
    assert.equal(await header.innerText(), '共 1 条');
    assert.equal(await header.getByRole('button').count(), 0);
    assert.equal(await footer.count(), 0);
    await page.getByRole('searchbox', { name: '搜索记录', exact: true }).fill('无匹配的示例');
    await page.waitForFunction(() => document.querySelector('main > .platform-section-pending h2')?.textContent.endsWith('（0）'));
    assert.equal(await header.count(), 0);
    assert.equal(await section.locator('h3').count(), 0);
    if (account.account_type === 'teacher') {
      await page.getByRole('searchbox', { name: '搜索记录', exact: true }).fill('');
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '总览', exact: true }).click();await showModuleRecords(page);
      await page.locator('[data-task="test-review"]').click();
      const taskRecords = page.locator('main > .platform-section-pending');
      assert.equal(await taskRecords.locator('h3').count(), 3);
      assert.equal(await taskRecords.getByText('撤回测试核对', { exact: true }).count(), 0);
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '数据报表', exact: true }).click();await showModuleRecords(page);
      const details = page.locator('#report-detail-panel');
      await details.getByRole('button', { name: '展开其余 2 条', exact: true }).click();
      assert.equal(await details.locator('tbody tr').count(), 3);
      assert.equal(await details.getByText('撤回测试核对', { exact: true }).count(), 0);
      records[3].status = '待教师审核';
      await page.reload();
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '测试审核', exact: true }).click();await showModuleRecords(page);
      await page.getByRole('heading', { name: '待审批测试工单（4）', exact: true }).waitFor();
      await section.getByRole('button', { name: '展开其余 3 条', exact: true }).click();
      assert.equal(await section.getByRole('heading', { name: '撤回测试核对', exact: true }).count(), 1, 'Resubmission restores the teacher queue');
      records[3].status = '已撤回';
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.platform-sync-status')?.textContent.includes('同步状态：同步完成'));
    }
    const role = account.account_type;
    await page.getByRole('searchbox', { name: '搜索记录', exact: true }).fill('');
    for (const type of ['加工', '维修', '采购', '出库']) {
      const label = type === '出库' ? role === 'student' ? '出/退库' : '出入退库'
        : type === '采购' ? role === 'student' ? '采购/入库' : role === 'teacher' ? '采购审核' : '采购记录'
        : type + (role === 'teacher' ? '审核' : role === 'student' ? '' : '记录');
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: label, exact: true }).click();await showModuleRecords(page);
      const list = page.locator('main > .platform-section-pending');
      assert.equal(await list.getByRole('heading', { name: '保留' + type + '核对', exact: true }).count(), 1, role + ' retains active ' + type);
      assert.equal(await page.locator('main').getByText('撤回' + type + '核对', { exact: true }).count(), 0, role + ' hides withdrawn ' + type);
      assert.equal(await page.locator('main').getByText('已撤回', { exact: true }).count(), 0);
      if (type !== '出库') assert.equal(await page.locator('.platform-business-headline strong').innerText(), '1');
      const exporting = page.waitForEvent('download');
      await (type === '出库' ? list : page.locator('main')).getByRole('button', { name: /导出.*Excel/ }).first().click();
      const output = await readWorkbookText(await (await exporting).path());
      assert(output.includes('保留' + type + '核对'));
      assert(!output.includes('撤回' + type + '核对'));
    }
    if (role !== 'student') {
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button', { name: '数据报表', exact: true }).click();await showModuleRecords(page);
      for (const [tab, count] of [['tests', 3], ['processing', 1], ['repair', 1], ['purchases', 1], ['stockRequests', 1]]) assert.equal(await page.locator('#report-tab-' + tab + ' span').innerText(), String(count));
      const exporting = page.waitForEvent('download');await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
      const output = await readWorkbookText(await (await exporting).path());
      for (const type of ['测试', '加工', '维修', '采购', '出库']) assert(!output.includes('撤回' + type + '核对'));
      assert(output.includes('保留出库核对'));
    }
    assert.equal(records[3].status, '已撤回');assert.equal(purchases[1].status, '已撤回');assert.equal(stockRequests[1].status, '已撤回');
    assert.deepEqual(errors, []);
    results.push({ recordVisibility: true, role: account.account_type, width, topAndBottomExpand: true, withdrawnTests: true, keyboard: true, filteredCount: true, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors });
    await page.close();
  }
  return results;
}
