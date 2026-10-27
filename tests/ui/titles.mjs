import assert from 'node:assert/strict';
import path from 'node:path';
import settings from '../../src/config/platform-settings.json' with { type: 'json' };
import { openNavigation } from './navigation.mjs';

// Measure the deployment's own title; the tests contain no organization names.
export async function checkTitles(browser, origin, out, snapshot, users) {
  const results = [];
  async function createPage(width, user) {
    const account = user && { ...user, profile_required: false, session_token: 'isolated-title-test' };
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    if (account) await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'title-fixture' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated title test\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    return { page, errors };
  }
  async function check(page, selector, allowSingleLine) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.locator(selector).evaluate(node => {
      const box = node.getBoundingClientRect(), measurements = [...node.querySelectorAll('.platform-brand-measure')];
      return { layout: node.dataset.titleLayout, width: box.width,
        preferredWidth: measurements[0].getBoundingClientRect().width, fullWidth: measurements[1].getBoundingClientRect().width,
        lines: [...node.querySelectorAll('.platform-brand-lines > span')].map(line => { const text = line.querySelector('.platform-brand-line-text') || line; const range = document.createRange(); range.selectNodeContents(text); return { text: text.textContent, width: line.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width, height: line.getBoundingClientRect().height }; }),
        trailing: (() => { const trailing = node.querySelector('.platform-brand-trailing'); if (!trailing) return null;
          const box = trailing.getBoundingClientRect(), text = trailing.previousElementSibling.getBoundingClientRect();
          return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, textRight: text.right, textY: text.y, textBottom: text.bottom, textWidth: text.width,
            clipped: trailing.scrollWidth > trailing.clientWidth }; })(),
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    const hasFallback = Array.isArray(settings.titleCompactLines) && settings.titleCompactLines.join('') === settings.title;
    const expected = allowSingleLine && geometry.fullWidth <= geometry.width + .5 ? 'single'
      : hasFallback && geometry.preferredWidth > geometry.width + .5 ? 'compact' : 'preferred';
    assert.equal(geometry.layout, expected, `Title chooses the widest readable layout: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.lines.map(line => line.text).join(''), settings.title);
    if (expected === 'single') assert.equal(geometry.lines.length, 1, 'A title that fits stays on one line');
    assert(geometry.scrollWidth <= geometry.viewport, 'The title does not overflow the page');
    assert(geometry.lines.every(line => line.width <= geometry.width + 1), 'Title lines fit their container');
    assert(geometry.lines.every(line => line.textWidth <= geometry.width + 1), 'The rendered title text fits without clipping');
    if (geometry.trailing) {
      assert(!geometry.trailing.clipped, 'The independent version suffix is never clipped');
      if (geometry.trailing.textWidth + geometry.trailing.width + 4 <= geometry.width + .5)
        assert(geometry.trailing.x >= geometry.trailing.textRight - 1 && geometry.trailing.y < geometry.trailing.textBottom && geometry.trailing.bottom > geometry.trailing.textY, 'The version shares the last title line when it fits');
    }
    return geometry;
  }
  for (const width of [320, 390, 1366]) for (const view of ['login', 'sidebar']) {
    const { page, errors } = await createPage(width, view === 'sidebar' ? users[1] : null);
    try {
      await page.goto(origin);
      const selector = view === 'login' ? '.platform-login-intro .platform-brand-title' : '.workspace-brand .platform-brand-title';
      await page.locator(selector).waitFor({ state: 'attached' });
      if (view === 'sidebar') { await page.getByTestId('task-total').waitFor(); if (width < 1100) await openNavigation(page); }
      const geometry = await check(page, selector, view === 'login');
      if (view === 'sidebar' && width < 1100) {
        const brand = await page.locator('.workspace-brand').boundingBox(), close = await page.getByRole('button', { name: '关闭导航', exact: true }).boundingBox();
        assert(close.y >= brand.y + brand.height - 1, 'The close button has its own row below the title');
        await page.getByRole('button', { name: '关闭导航', exact: true }).click();
        assert.equal(await page.locator('.workspace-sidebar').isVisible(), false);
        await openNavigation(page);
      }
      await page.screenshot({ path: path.join(out, `title-${view}-${width}.png`) });
      assert.deepEqual(errors, []);
      results.push({ titleLayout: true, view, ...geometry, width, availableWidth: geometry.width, errors });
    } finally { await page.close(); }
  }
  const resize = await createPage(1366);
  try {
    await resize.page.goto(origin); await resize.page.locator('.platform-login-intro .platform-brand-title').waitFor();
    const frames = [];
    for (const width of [1366, 320, 390, 1366]) {
      await resize.page.setViewportSize({ width, height: 900 });
      frames.push(await check(resize.page, '.platform-login-intro .platform-brand-title', true));
    }
    const font = await resize.page.evaluate(async () => {
      let loaded = false;
      try {
        const face = new FontFace('PlatformTitleTestFont', 'local("Courier New"), local("Liberation Mono"), local("DejaVu Sans Mono")');
        await face.load(); document.fonts.add(face); loaded = true;
      } catch { /* A browser without these local fonts can still exercise a fallback metric change. */ }
      document.querySelector('.platform-login-intro h1').style.fontFamily = loaded ? 'PlatformTitleTestFont,serif' : 'monospace';
      await document.fonts.ready;
      return { loaded, family: getComputedStyle(document.querySelector('.platform-login-intro h1')).fontFamily };
    });
    frames.push(await check(resize.page, '.platform-login-intro .platform-brand-title', true));
    assert.deepEqual(resize.errors, []);
    results.push({ titleResizeAndFonts: true, frames, font, errors: resize.errors });
  } finally { await resize.page.close(); }
  return results;
}
