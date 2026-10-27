import { openNavigation } from './navigation.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkHelp(browser, origin, out, snapshot, users) {
  const finance = { username: 'qa-finance-help', display_name: '示例财务', account_type: 'finance', status: 'active' };
  const results = [];
  for (const width of [1440, 390, 320]) for (const user of [...users, finance]) {
    const account = { ...user, profile_required: false, session_token: 'synthetic-help' }, role = account.account_type;
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me' || url.pathname === '/api/help-comments/session') return route.fulfill({ json: { ok: true, account, teachers: [] } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'help-check' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, comments: [], rows: [], total: 0 } });
    });
    await page.goto(origin);
    await page.locator('.platform-nav').waitFor({state:'attached'});
    const report = page.locator('.platform-nav button[aria-label="数据报表"]');
    if (await report.count()) {
      await openNavigation(page);await report.click();
      const expected = { admin: 'admin-reports', teacher: 'teacher-reports', finance: 'finance-reimbursement', student: 'student-exports' }[role];
      const link = page.locator('.platform-report-basis a');
      await link.waitFor({ state: 'attached' });
      assert.equal(await link.getAttribute('href'), '/help#' + expected);
      await page.goto(origin + '/help#' + expected);
      await page.locator('#' + expected).waitFor();
      assert.equal(await page.locator('.help-legacy-note').count(), 0);
    }
    await page.goto(origin + '/help#exports');
    await page.locator('.help-page').waitFor();
    assert.equal(await page.locator('.help-legacy-note').count(), 0, 'Old report bookmarks resolve to current role help');
    const search = page.locator('#help-search-input');
    await search.fill('全部待办');
    await page.locator('.help-article-content mark').first().waitFor();
    assert.equal(await page.locator('.help-article-content').count(), 1);
    assert((await page.locator('.help-article-content').innerText()).includes('全部待办'));
    await search.fill('');
    assert.equal(await page.getByText('导出 Excel：首行自带筛选并冻结表头。', { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(out, `help-current-${role}-${width}.png`), fullPage: true });
    const openMessage = page.locator('.help-comment-tools').getByRole('button', { name: '直接留言', exact: true });
    await openMessage.click();
    const composer = page.getByRole('dialog', { name: '直接留言', exact: true });
    await composer.getByRole('button', { name: '取消', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert(await composer.getByRole('textbox').evaluate(node => node === document.activeElement), 'Dialog traps keyboard focus');
    await page.keyboard.press('Escape');
    await composer.waitFor({ state: 'detached' });
    assert(await openMessage.evaluate(node => node === document.activeElement), 'Closing returns focus to the opener');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    results.push({ helpCurrentRole: role, width, overflow, errors });
    await page.close();
  }
  return results;
}
