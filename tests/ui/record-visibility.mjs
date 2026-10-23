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
  for (const width of [1440, 390, 320]) for (const user of [...users, { ...teacher, account_type: 'finance' }]) {
    const account = { ...user, profile_required: false, session_token: 'visibility-fixture' };
    const total = account.account_type === 'teacher' ? 3 : 4, remaining = total - 1;
    const page = await browser.newPage({ viewport: { width, height: 960 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: [teacher] } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account, lab_work_requests: records }, revision: 'visibility-fixture' } });
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
    assert.equal(await withdrawn.count(), account.account_type === 'teacher' ? 0 : 1);
    if (account.account_type === 'student') assert.equal(await section.getByRole('button', { name: '修改/重新提交', exact: true }).count(), 1);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
    const workbook = await readWorkbookText(await (await download).path());
    assert.equal(workbook.includes('撤回测试核对'), account.account_type !== 'teacher');
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
    }
    assert.deepEqual(errors, []);
    results.push({ recordVisibility: true, role: account.account_type, width, topAndBottomExpand: true, withdrawnTests: true, keyboard: true, filteredCount: true, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors });
    await page.close();
  }
  return results;
}
