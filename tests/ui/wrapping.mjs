import assert from 'node:assert/strict';
import { assertSingleLine } from './readability.mjs';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

export async function checkWrapping(browser, origin, snapshot, users) {
  const [admin, teacher, student] = users;
  const finance = { ...teacher, account_type: 'finance', username: 'qa-wrapping-finance', display_name: '示例财务' };
  const cases = [[320, student], [320, teacher], [320, finance], [320, admin], [360, teacher], [390, admin], [430, finance], [768, finance], [1024, admin], [1366, teacher], [1920, student]];
  const results = [];
  for (const [width, user] of cases) {
    const account = { ...user, profile_required: false, session_token: 'isolated-wrapping' };
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-25T04:00:00Z'));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'wrapping' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    await page.goto(origin);
    await page.getByTestId('task-total').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const date = page.locator('.workspace-welcome time');
    assert.equal(await date.textContent(), '10月25日星期日');
    await assertSingleLine(date, `${width}: welcome date`);
    for (const node of await page.locator('.platform-task-name').all()) await assertSingleLine(node, `${width}: task label`);
    await openNavigation(page);
    const tab = account.account_type === 'student' ? '测试' : account.account_type === 'teacher' ? '测试审核' : '测试记录';
    await page.locator('.platform-nav').getByRole('button', { name: tab, exact: true }).click();
    await showModuleRecords(page);
    for (const node of await page.locator('.platform-business-statuses dt,.workspace-topbar-actions > button,.workspace-topbar-actions > a').all()) await assertSingleLine(node, `${width}: status or toolbar control`);
    if (account.account_type !== 'student') {
      const toggle = page.getByRole('button', { name: /展开筛选/ });
      if (await toggle.isVisible()) await toggle.click();
      await page.locator('.platform-filter-panel select').selectOption('custom');
      const fields = page.locator('.platform-filter-panel input[type=date]');
      assert.equal(await fields.count(), 2);
      await fields.nth(0).fill('2026-10-01');
      await fields.nth(1).fill('2026-10-31');
      for (const node of await page.locator('.platform-filter-panel .platform-date-display').all()) await assertSingleLine(node, `${width}: filter date`);
      await openNavigation(page);
      await page.locator('.platform-nav').getByRole('button', { name: '数据报表', exact: true }).click();
      await showModuleRecords(page);
      for (const node of await page.locator('.platform-report-tabs button').all()) await assertSingleLine(node, `${width}: report tab`);
      for (const node of await page.locator('.platform-reimbursement-figures.is-compact dt').all()) await assertSingleLine(node, `${width}: reimbursement label`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: page overflow`);
    assert.deepEqual(errors, []);
    results.push({ wrapping: true, width, role: account.account_type, overflow: false, errors });
    await page.close();
  }
  return results;
}
