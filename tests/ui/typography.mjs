import assert from 'node:assert/strict';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

// CSS viewport size, rather than physical screen inches, determines the layout.
export async function checkTypography(browser, origin, snapshot, users) {
  const cases = [
    [1366, 1, users[1]], [1536, 1.25, users[1]],
    [1920, 1, users[1]], [2560, 1, users[1]],
    [1366, 1, users[2]], [390, 3, users[2]],
    [1024, 1, users[0]],
  ];
  const results = [];
  for (const [width, deviceScaleFactor, user] of cases) {
    const account = { ...user, profile_required: false, session_token: 'isolated-typography' };
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'typography' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    await page.goto(origin);
    await page.getByTestId('task-total').waitFor();
    await openNavigation(page);
    for (const node of await page.locator('.platform-nav button').all()) {
      const geometry = await node.evaluate(e => ({ font: parseFloat(getComputedStyle(e).fontSize), height: e.clientHeight, overflow: e.scrollWidth > e.clientWidth + 1 }));
      assert(geometry.font >= 16 && geometry.height >= 44 && !geometry.overflow, JSON.stringify({ width, geometry }));
    }
    const tab = account.account_type === 'student' ? '测试' : account.account_type === 'teacher' ? '测试审核' : '测试记录';
    await page.locator('.platform-nav').getByRole('button', { name: tab, exact: true }).click();
    await showModuleRecords(page);
    await page.locator('.platform-request-record').first().waitFor();
    const geometry = await page.evaluate(() => {
      const visible = selector => [...document.querySelectorAll(selector)].filter(e => e.checkVisibility() && e.getBoundingClientRect().height);
      const sizes = selector => visible(selector).map(e => parseFloat(getComputedStyle(e).fontSize));
      return {
        scale: visualViewport.scale,
        overflow: document.documentElement.scrollWidth > innerWidth,
        content: sizes('.platform-info > div:last-child'),
        labels: sizes('.platform-info > div:first-child'),
        inputs: sizes('.workspace-content input:not([type=checkbox])'),
        identities: sizes('.platform-request-people .platform-identity'),
      };
    });
    assert.equal(geometry.scale, 1);
    assert.equal(geometry.overflow, false);
    for (const key of ['content', 'inputs', 'identities']) {
      assert(geometry[key].length > 0, `${key} must be exercised`);
      assert(geometry[key].every(size => size >= 16), `${width} ${key}: ${geometry[key]}`);
    }
    assert(geometry.labels.length > 0 && geometry.labels.every(size => size >= 14));
    assert.deepEqual(errors, []);
    results.push({ typography: true, role: account.account_type, width, deviceScaleFactor, ...geometry, errors });
    await page.close();
  }
  return results;
}
