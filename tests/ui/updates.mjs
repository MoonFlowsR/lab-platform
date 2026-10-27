import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkUpdates(browser, origin, out) {
  const metadata = JSON.parse(await fs.readFile(new URL('../../src/config/release-history.json', import.meta.url), 'utf8'));
  const { version } = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const count = metadata.historicalUpdates + metadata.releases.length;
  const expectedNewest = [
    ...metadata.releases.map(entry => ({ id: `release-${entry.version}`, date: entry.date || '' })),
    ...metadata.legacyEntries.map((entry, index) => ({ id: `earlier-${index}`, date: entry.date || '' })).reverse(),
  ];
  const results = [];
  assert.equal(metadata.legacyEntries.length, metadata.historicalUpdates);
  assert.equal(metadata.legacyEntries.length + metadata.releases.length, count);
  for (const width of [320, 390, 1366]) for (const theme of ['light', 'dark', 'mixed']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], apiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      if (!sessionStorage.getItem('qa-updates-theme')) {
        localStorage.setItem('platform:theme', theme);
        sessionStorage.setItem('qa-updates-theme', 'set');
      }
    }, theme);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      apiCalls.push(`${route.request().method()} ${url.pathname}`);
      return route.fulfill({ json: { ok: true, account: null, data: {}, rows: [], total: 0, comments: [] } });
    });
    await page.goto(origin + '/updates');
    const root = page.locator('.updates-page');
    await root.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await root.getAttribute('data-update-count'), String(count));
    assert.equal(await root.getAttribute('data-current-version'), version);
    assert.equal(await page.getByRole('heading', { name: '更新日志', exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '返回平台', exact: true }).getAttribute('href'), '/');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    const groups = page.locator('.updates-date-group');
    async function assertRecordOrder(direction) {
      const actual = await groups.evaluateAll(nodes => nodes.map(node => ({ date: node.dataset.updateDate, ids: [...node.querySelectorAll('[data-update-entry]')].map(entry => entry.dataset.updateEntry) })));
      for (const group of actual) {
        const expected = expectedNewest.filter(entry => entry.date === group.date).map(entry => entry.id);
        if (direction === 'oldest') expected.reverse();
        assert.deepEqual(group.ids, expected, `${direction}: updates within ${group.date || 'unknown date'} follow the source chronology`);
      }
    }
    assert((await groups.count()) > 1);
    await assertRecordOrder('newest');
    assert.equal(await groups.evaluateAll(nodes => nodes.every(node => !node.open)), true, 'Every history group starts collapsed');
    const records = page.locator('[data-update-entry]');
    assert.equal(await records.count(), count);
    await groups.first().locator('summary').click();
    assert.equal(await groups.first().evaluate(node => node.open), true);
    assert.equal(await records.first().isVisible(), true);
    await groups.evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    assert.equal(await records.evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).length), count, 'All recorded updates can be opened');
    await groups.evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
    await page.screenshot({ path: path.join(out, `updates-${theme}-${width}.png`), fullPage: true });

    const search = page.getByRole('searchbox', { name: '搜索更新', exact: true });
    await search.fill(`v${version}`);
    assert.equal(await records.count(), 1);
    assert.equal(await records.first().getAttribute('data-update-version'), version);
    assert.equal(await records.first().isVisible(), true, 'A matching update is immediately readable');
    await search.fill('库存');
    assert((await records.count()) > 0);
    for (const text of await records.evaluateAll(nodes => nodes.map(node => node.dataset.updateSearch))) assert(text.includes('库存'));
    await search.fill('__没有这样的更新记录__');
    assert.equal(await records.count(), 0);
    await page.getByText('无相关内容', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    assert.equal(await records.count(), count);
    assert.equal(await groups.evaluateAll(nodes => nodes.every(node => !node.open)), true);

    const dates = [...new Set([...metadata.releases, ...metadata.legacyEntries].map(entry => entry.date || ''))].sort();
    await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('oldest');
    assert.equal(await groups.first().getAttribute('data-update-date'), dates[0]);
    await assertRecordOrder('oldest');
    await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('newest');
    assert.equal(await groups.first().getAttribute('data-update-date'), dates.at(-1));
    await assertRecordOrder('newest');
    const next = theme === 'dark' ? 'light' : 'dark';
    await page.getByRole('button', { name: /^显示方式：/ }).click();
    await page.getByRole('menuitemradio', { name: next === 'dark' ? '深色模式' : '浅色模式', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), next);
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(apiCalls, [], 'The independent update history does not request any business API');
    results.push({ updates: true, width, theme, count, currentVersion: version, allHistoryVisible: true, apiRequests: apiCalls.length, overflow: false, errors });
    await page.close();
  }
  return results;
}
