import assert from 'node:assert/strict';

// Slow responses must not overlap; hidden tabs resume with one fresh request.
export async function checkHelpPolling(browser, origin, users) {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  const account = { ...users[1], profile_required: false, session_token: 'polling-fixture' };
  const pending = [], errors = [];
  let requests = 0, hold = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.addInitScript(value => {
    sessionStorage.setItem('surface_lab_account', JSON.stringify(value));
    window.fixtureHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.fixtureHidden });
  }, account);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/help-comments') {
      requests++;
      if (hold) { pending.push(route); return; }
      return route.fulfill({ json: { ok: true, comments: [] } });
    }
    return route.fulfill({ json: { ok: true, account, teachers: [], student_name_labels: [], data: {}, revision: 'polling' } });
  });
  try {
    const initial = page.waitForRequest(request => new URL(request.url()).pathname === '/api/help-comments');
    await page.goto(origin + '/help'); await initial; await page.locator('.help-page').waitFor();
    await page.clock.runFor(20000);
    assert.equal(requests, 1, 'A pending request must not be duplicated');
    hold = false;
    await pending.shift().fulfill({ json: { ok: true, comments: [] } });
    await page.getByText('读取讨论超时，请稍后重试。', { exact: true }).waitFor({ state: 'hidden' });
    await page.evaluate(() => { window.fixtureHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(35000);
    assert.equal(requests, 1, 'Background tabs must not poll');
    const resumed = page.waitForRequest(request => new URL(request.url()).pathname === '/api/help-comments');
    await page.evaluate(() => { window.fixtureHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await resumed;
    assert.equal(requests, 2, 'Returning to the tab refreshes immediately');
    assert.deepEqual(errors, []);
    return [{ helpPolling: true, slowRequestDeduplicated: true, hiddenTabPaused: true, visibilityRefresh: true, errors }];
  } finally { await page.close(); }
}
