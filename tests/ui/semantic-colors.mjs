import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

async function readContrast(locator) {
  return locator.evaluate(node => {
    const rgba = value => { const n = value.match(/[\d.]+/g).map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; };
    const blend = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return [...a.slice(0, 3).map((v, i) => (v * a[3] + b[i] * b[3] * (1 - a[3])) / (alpha || 1)), alpha]; };
    const lum = color => color.slice(0, 3).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const parents = []; for (let current = node; current; current = current.parentElement) parents.push(current);
    const background = parents.reverse().reduce((color, current) => blend(rgba(getComputedStyle(current).backgroundColor), color), [255, 255, 255, 1]);
    const color = getComputedStyle(node).color, [light, dark] = [lum(blend(rgba(color), background)), lum(background)].sort((a, b) => b - a);
    return { text: node.textContent.trim(), color, background: background.slice(0, 3).map(Math.round), ratio: (light + .05) / (dark + .05) };
  });
}

// Real account and request pages, with small synthetic fixtures and every API intercepted.
export async function checkSemanticColors(browser, origin, out, snapshot, users) {
  const [admin, teacher, student] = users, results = [];
  const rows = [
    { ...teacher, id: 8801, _id: 8801, username: 'qa-color-active', display_name: '示例启用账号', status: 'active', created_at: '2026-10-20T00:00:00Z' },
    { ...student, id: 8802, _id: 8802, username: 'qa-color-disabled', display_name: '示例停用账号', status: 'disabled', created_at: '2026-10-21T00:00:00Z' },
  ];
  const work = { ...snapshot.lab_work_requests[0], _id: 8810, public_id: 'QA-COLOR-WORK', request_type: '测试', work_content: '配色示例测试', status: '待教师审核', applicant_username: student.username, applicant_name: student.display_name, review_teacher_username: teacher.username, review_teacher_name: teacher.display_name };
  for (const width of [1366, 390]) for (const theme of ['light', 'mixed', 'dark']) {
    const account = { ...admin, profile_required: false, session_token: 'isolated-semantic-colors' };
    const page = await browser.newPage({ viewport: { width, height: 960 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const errors = [], writes = [], readings = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ account, theme }) => { sessionStorage.setItem('surface_lab_account', JSON.stringify(account)); localStorage.setItem('platform:theme', theme); }, { account, theme });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated semantic-color fixture\n\n' });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, revision: 'semantic-fixture', data: { ...snapshot, current_account: account, accounts: rows, lab_work_requests: [work], lab_purchase_requests: [], lab_stock_out_requests: [], lab_attachments: [], lab_user_hidden_records: [] } } });
      if (url.pathname === '/api/ops/listAudit') return route.fulfill({ json: { ok: true, rows: [], total: 0 } });
      if (route.request().method() !== 'GET') writes.push(url.pathname);
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    async function sampleButton(name) {
      const button = page.getByRole('button', { name, exact: true }).first();
      await button.waitFor(); await button.scrollIntoViewIfNeeded();
      for (const state of ['normal', 'hover', 'focus']) {
        if (state === 'normal') { await page.mouse.move(0, 0); await button.evaluate(node => node.blur()); }
        if (state === 'hover') await button.hover();
        if (state === 'focus') { await page.mouse.move(0, 0); await button.focus(); }
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const reading = { ...await readContrast(button), state };
        assert(reading.ratio >= 4.5, `${theme}/${width}/${name}/${state}: ${JSON.stringify(reading)}`);
        if (name === '停用') assert.notDeepEqual(reading.background, [165, 102, 12], 'Warning actions must no longer use the old mustard fill');
        readings.push(reading);
      }
    }
    try {
      await page.goto(origin); await page.getByTestId('task-total').waitFor();
      await openNavigation(page); await page.locator('.platform-nav').getByRole('button', { name: '账号管理', exact: true }).click();
      await showModuleRecords(page); await page.locator('#account-list-rows').waitFor();
      const expand = page.locator('button[aria-controls="account-list-rows"]').first();
      if (await expand.count() && await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
      for (const name of ['停用', '启用', '重置密码']) await sampleButton(name);
      await page.screenshot({ path: path.join(out, `semantic-accounts-${theme}-${width}.png`), fullPage: true });
      await openNavigation(page); await page.locator('.platform-nav').getByRole('button', { name: '测试记录', exact: true }).click();
      await showModuleRecords(page); await sampleButton('永久删除申请');
      const warning = page.locator('main .platform-request-record .platform-badge').filter({ hasText: '待教师审核' }).first();
      await warning.waitFor(); const reading = { ...await readContrast(warning), state: 'record-warning' };
      assert(reading.ratio >= 4.5, `${theme}/${width}/warning: ${JSON.stringify(reading)}`); readings.push(reading);
      await page.screenshot({ path: path.join(out, `semantic-request-${theme}-${width}.png`), fullPage: true });
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert(geometry.scrollWidth <= geometry.viewport); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      results.push({ semanticColors: true, theme, width, ...geometry, checks: readings.length, lowContrast: readings.filter(row => row.ratio < 4.5), errors });
    } finally { await page.close(); }
  }
  return results;
}
