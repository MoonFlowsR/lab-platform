import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkUpdates(browser, origin, out) {
  const metadata = JSON.parse(await fs.readFile(new URL('../../src/config/release-history.json', import.meta.url), 'utf8'));
  const { version } = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const settings = JSON.parse(await fs.readFile(new URL('../../src/config/platform-settings.json', import.meta.url), 'utf8'));
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
    await page.clock.install();
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
    await page.goto(origin + '/help?view=updates');
    const root = page.locator('.update-history');
    await root.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(50);
    const caption = await page.locator('.help-brand .platform-brand-title').evaluate(node => {
      const measurements = [...node.querySelectorAll('.platform-brand-measure')];
      return { layout: node.dataset.titleLayout, width: node.getBoundingClientRect().width,
        preferredWidth: measurements[0].getBoundingClientRect().width, fullWidth: measurements[1].getBoundingClientRect().width,
        lines: [...node.querySelectorAll('.platform-brand-lines > span')].map(line => { const range = document.createRange(); range.selectNodeContents(line); return { text: line.textContent, textWidth: range.getBoundingClientRect().width, rows: [...range.getClientRects()].filter(rect => rect.width > 0).length }; }) };
    });
    const preferred = Array.isArray(settings.titleLines) && settings.titleLines.join('') === settings.title ? settings.titleLines : [settings.title];
    const fallback = Array.isArray(settings.titleCompactLines) && settings.titleCompactLines.join('') === settings.title ? settings.titleCompactLines : null;
    const captionLayout = caption.fullWidth <= caption.width + .5 ? 'single' : fallback && caption.preferredWidth > caption.width + .5 ? 'compact' : 'preferred';
    const captionLines = captionLayout === 'single' ? [settings.title] : captionLayout === 'compact' ? fallback : preferred;
    assert.equal(caption.layout, captionLayout, 'Help caption uses the widest configured title layout that fits');
    assert.deepEqual(caption.lines.map(line => line.text), captionLines, 'Caption breaks only at configured semantic boundaries');
    assert.equal(caption.lines.map(line => line.text).join(''), settings.title);
    assert(caption.lines.every(line => line.rows === 1 && line.textWidth <= caption.width + 1), 'Every caption phrase fits a single unclipped line');
    assert.equal(await root.getAttribute('data-update-count'), String(count));
    assert.equal(await root.getAttribute('data-current-version'), version);
    assert.equal(await page.getByRole('heading', { name: '平台使用帮助', exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: '更新日志', exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '返回平台', exact: true }).getAttribute('href'), '/');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    const viewButtons = page.locator('.help-role-switch > div > button');
    assert.deepEqual(await viewButtons.allTextContents(), ['学生', '教师', '财务', '管理员', '平台维护', '更新日志']);
    assert.equal(await page.getByRole('button', { name: '更新日志', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const selector of ['.help-search', '.help-comment-tools', '.help-selection-bar', '.help-messages', '.help-toc']) assert.equal(await page.locator(selector).count(), 0, 'Update history does not expose document discussion controls');
    await page.clock.runFor(30000);
    assert.deepEqual(apiCalls, [], 'Opening the update-history view does not request discussion or business data');
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

    const discussionRead = page.waitForResponse(response => new URL(response.url()).pathname === '/api/help-comments');
    await page.getByRole('button', { name: '平台维护', exact: true }).click();
    await (await discussionRead).finished();
    assert.equal(await root.count(), 0);
    assert.equal(new URL(page.url()).searchParams.has('view'), false);
    assert.equal(await page.locator('.help-comment-tools').isVisible(), true);
    const maintenanceTitle = await page.locator('.help-article-content h2').first().innerText();
    await page.getByRole('searchbox', { name: '搜索平台维护帮助', exact: true }).fill(maintenanceTitle);
    assert(await page.locator('.help-article-content').count() > 0, 'Maintenance help keeps its normal search');
    await page.getByRole('button', { name: '清除搜索', exact: true }).click();
    await page.getByRole('button', { name: '学生', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '学生', exact: true }).getAttribute('aria-pressed'), 'true');
    assert(await page.locator('.help-article-content').count() > 0);
    await page.getByRole('button', { name: '直接留言', exact: true }).first().click();
    const composer = page.getByRole('dialog', { name: '直接留言', exact: true });
    await composer.waitFor();
    await composer.getByText('请先注册账号并登录后发表留言。', { exact: false }).waitFor();
    await composer.getByRole('button', { name: '取消', exact: true }).click();
    const helpReadCount = apiCalls.length;
    await page.getByRole('button', { name: '更新日志', exact: true }).click();
    await root.waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'), 'updates');
    await page.clock.runFor(30000);
    assert.equal(apiCalls.length, helpReadCount, 'Switching to update history stops discussion polling');
    assert.equal(await page.locator('.help-comment-tools').count(), 0);
    assert.equal(await records.count(), count);
    assert.equal(await groups.evaluateAll(nodes => nodes.every(node => !node.open)), true);
    await page.goto(origin + '/updates');
    await page.waitForURL(url => url.pathname === '/help' && url.searchParams.get('view') === 'updates');
    await root.waitFor();
    assert.equal(await root.getAttribute('data-update-count'), String(count));
    assert.equal(apiCalls.length, helpReadCount, 'The former update URL redirects to help without business requests');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    assert.equal(apiCalls.every(call => call.startsWith('GET /api/help-comments')), true, 'Only normal help discussion reads are allowed');
    results.push({ updates: true, width, theme, count, currentVersion: version, captionLayout, captionLines: caption.lines.length, allHistoryVisible: true, logApiRequests: 0, helpReads: helpReadCount, businessWrites: 0, overflow: false, errors });
    await page.close();
  }
  return results;
}
