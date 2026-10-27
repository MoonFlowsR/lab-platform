import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

// Only the isolated UI harness calls this suite. API data is always synthetic.
export async function checkThemes(browser, origin, out, snapshot, users) {
  const results = [], themes = ['light', 'dark'];
  const finance = { id: 94, _id: 94, username: 'qa-theme-finance', display_name: '示例财务', account_type: 'finance', status: 'active' };
  const roles = [...users, finance];
  async function makePage({ width = 390, user = null, theme = null, colorScheme = 'light', blockedStorage = false, context } = {}) {
    const page = context ? await context.newPage() : await browser.newPage({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
    if (context) { await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' }); }
    const account = user ? { ...user, profile_required: false, session_token: 'isolated-theme-account' } : null;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ account, theme, blockedStorage }) => {
      if (account) sessionStorage.setItem('surface_lab_account', JSON.stringify(account));
      if (blockedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage is blocked for the fixture'); } });
      else if (theme && !sessionStorage.getItem('qa-theme-seeded')) {
        localStorage.setItem('platform:theme', theme);
        sessionStorage.setItem('qa-theme-seeded', '1');
      }
    }, { account, theme, blockedStorage });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account, accounts: [...snapshot.accounts, finance] }, revision: 'theme-fixture' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated theme fixture\n\n' });
      if (url.pathname === '/api/help-comments/session') return route.fulfill({ json: { ok: true, account, student_name_labels: snapshot.lab_student_name_labels } });
      return route.fulfill({ json: { ok: true, comments: [], rows: [], total: 0 } });
    });
    return { page, account, errors };
  }
  async function assertTheme(page, expected, preference = expected) {
    await page.waitForFunction(({ expected, preference }) => document.documentElement.dataset.theme === expected && document.documentElement.dataset.themePreference === preference, { expected, preference });
    assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).colorScheme), expected);
  }
  async function contrast(page, selector) {
    return page.locator(selector).evaluateAll(nodes => {
      const rgba = color => {
        const numbers = color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
        return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
      };
      const blend = (front, back) => {
        const alpha = front[3] + back[3] * (1 - front[3]);
        return [...front.slice(0, 3).map((value, index) => (value * front[3] + back[index] * back[3] * (1 - front[3])) / (alpha || 1)), alpha];
      };
      const luminance = color => color.slice(0, 3).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      return nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && node.textContent.trim()).map(node => {
        const ancestors = []; for (let current = node; current; current = current.parentElement) ancestors.push(current);
        const background = ancestors.reverse().reduce((color, current) => blend(rgba(getComputedStyle(current).backgroundColor), color), [255, 255, 255, 1]);
        const style = getComputedStyle(node), foreground = blend(rgba(style.color), background);
        const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        const ratio = (light + 0.05) / (dark + 0.05);
        return { text: node.textContent.trim().slice(0, 70), selector: node.className || node.tagName, color: style.color, background: background.slice(0, 3).map(Math.round), ratio: Math.round(ratio * 100) / 100 };
      });
    });
  }
  async function checkGeometry(page, label) {
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(geometry.scrollWidth <= geometry.viewport, `${label} must fit the viewport: ${JSON.stringify(geometry)}`);
    const trigger = await page.locator('.platform-theme-trigger').boundingBox();
    assert(trigger.width >= 44 && trigger.height >= 44, `${label}: theme control has a 44px touch target`);
    return geometry;
  }
  async function inspectMenu(page, label) {
    await page.locator('.platform-theme-trigger').click();
    const menu = page.getByRole('menu', { name: '显示方式', exact: true });
    await menu.waitFor();
    assert.equal(await menu.getByRole('menuitemradio').count(), 3);
    assert.equal(await menu.locator('[aria-checked="true"]').count(), 1);
    const box = await menu.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, `Theme menu fits the viewport: ${label}, ${JSON.stringify(box)}`);
    const readings = await contrast(page, '.platform-theme-trigger,.platform-theme-option');
    assert.deepEqual(readings.filter(row => row.ratio < 4.5), [], `Theme controls require readable contrast: ${JSON.stringify(readings)}`);
    const sizes = await menu.getByRole('menuitemradio').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    assert(sizes.every(size => size.width >= 44 && size.height >= 44));
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0);
    assert.equal(await page.locator('.platform-theme-trigger').evaluate(node => node === document.activeElement), true);
    return readings;
  }
  for (const width of [320, 390, 1366, 1920]) for (const theme of themes) {
    for (const view of ['login', 'register', 'help', ...roles.map(user => user.account_type)]) {
      const user = roles.find(account => account.account_type === view);
      const { page, errors } = await makePage({ width, theme, user });
      try {
        await page.goto(origin + (view === 'help' ? '/help' : view === 'register' ? '/?register=1' : '/'));
        await page.locator('.platform-theme-trigger').waitFor();
        if (user) await page.getByTestId('task-total').waitFor();
        await assertTheme(page, theme);
        const geometry = await checkGeometry(page, `${view}/${theme}/${width}`);
        const readings = await inspectMenu(page, `${view}/${theme}/${width}`);
        const representative = await contrast(page, '.platform-login-form-heading h2,.platform-login-form-heading p,.help-header h1,.help-subtitle,.workspace-sync-state,.platform-sync-guidance,.workspace-context');
        const lowContrast = representative.filter(row => row.ratio < 4.5);
        if (view === 'register') {
          await page.getByRole('combobox').first().click();
          const dropdown = page.getByRole('listbox').first();
          await dropdown.waitFor();
          const options = await contrast(page, '[role="listbox"] [role="option"]');
          assert.deepEqual(options.filter(row => row.ratio < 4.5), [], 'Searchable options remain readable in either theme');
          await page.getByRole('option', { name: '教师账号', exact: true }).click();
          assert.equal(await dropdown.count(), 0, 'Selecting an option still collapses the menu');
        }
        if (user && theme === 'dark' && width === 390) {
          await page.getByRole('button', { name: '账户设置', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: '账户设置', exact: true });
          await dialog.waitFor();
          await dialog.getByRole('tab', { name: '修改密码', exact: true }).click();
          const dialogContrast = await contrast(page, '.platform-account-settings h2,.platform-account-settings .platform-field>div,.platform-account-settings p,.platform-account-settings .platform-dialog-actions button');
          assert.deepEqual(dialogContrast.filter(row => row.ratio < 4.5), [], `Dark dialog text remains readable: ${JSON.stringify(dialogContrast)}`);
          const colors = await dialog.evaluate(node => ({ panel: getComputedStyle(node).backgroundColor, input: getComputedStyle(node.querySelector('input')).backgroundColor }));
          assert.notEqual(colors.panel, 'rgb(255, 255, 255)');
          assert.notEqual(colors.input, 'rgb(255, 255, 255)');
          if (view === 'student') await page.screenshot({ path: path.join(out, 'theme-dark-mobile-dialog.png') });
          await dialog.getByRole('button', { name: '关闭', exact: true }).click();
        }
        if ((width === 390 && ['login', 'help', 'student'].includes(view)) || (width === 1920 && view === 'admin')) {
          await page.screenshot({ path: path.join(out, `theme-${theme}-${view}-${width}.png`) });
        }
        assert.deepEqual(errors, []);
        results.push({ themeUI: true, view, theme, width, ...geometry, checks: readings.length + representative.length, lowContrast, errors });
      } finally { await page.close(); }
    }
  }

  // Keyboard interaction, current-page switching, persistence, and cross-page reuse.
  const { page, errors } = await makePage({ width: 390, theme: 'light', user: users.find(user => user.account_type === 'student') });
  try {
    await page.goto(origin); await page.locator('.platform-theme-trigger').waitFor();
    const trigger = page.locator('.platform-theme-trigger');
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('menuitemradio', { name: '浅色模式', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('menuitemradio', { name: '跟随系统', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await assertTheme(page, 'dark');
    assert.equal(await page.getByRole('menu').count(), 0, 'Selecting a theme closes the menu immediately');
    assert.equal(await page.evaluate(() => localStorage.getItem('platform:theme')), 'dark');
    await page.reload(); await page.locator('.platform-theme-trigger').waitFor(); await assertTheme(page, 'dark');
    await page.goto(origin + '/help'); await page.locator('.platform-theme-trigger').waitFor(); await assertTheme(page, 'dark');
    await trigger.click(); await page.locator('.help-header h1').click();
    assert.equal(await page.getByRole('menu').count(), 0, 'Clicking outside dismisses the menu');
    await trigger.click(); await page.getByRole('menuitemradio', { name: '跟随系统', exact: true }).click();
    await assertTheme(page, 'light', 'system');
    await page.emulateMedia({ colorScheme: 'dark' }); await assertTheme(page, 'dark', 'system');
    await page.emulateMedia({ colorScheme: 'light' }); await assertTheme(page, 'light', 'system');
    assert.deepEqual(errors, []);
    results.push({ themeBehavior: 'keyboard-persistence-help-system', errors });
  } finally { await page.close(); }

  // Browser-local changes synchronize across open tabs; account state stays separate.
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: 'light' });
  try {
    const first = await makePage({ context, theme: 'light' }), second = await makePage({ context });
    await first.page.goto(origin); await first.page.locator('.platform-theme-trigger').waitFor();
    await second.page.goto(origin + '/help'); await second.page.locator('.platform-theme-trigger').waitFor();
    await first.page.locator('.platform-theme-trigger').click(); await first.page.getByRole('menuitemradio', { name: '深色模式', exact: true }).click();
    await assertTheme(first.page, 'dark'); await assertTheme(second.page, 'dark');
    results.push({ themeBehavior: 'cross-tab', errors: [...first.errors, ...second.errors] });
  } finally { await context.close(); }
  const blocked = await makePage({ blockedStorage: true, colorScheme: 'dark' });
  try {
    await blocked.page.goto(origin); await blocked.page.locator('.platform-theme-trigger').waitFor(); await assertTheme(blocked.page, 'dark', 'system');
    await blocked.page.locator('.platform-theme-trigger').click(); await blocked.page.getByRole('menuitemradio', { name: '浅色模式', exact: true }).click();
    await assertTheme(blocked.page, 'light');
    assert.deepEqual(blocked.errors, []);
    results.push({ themeBehavior: 'blocked-storage', errors: blocked.errors });
  } finally { await blocked.page.close(); }

  // Show a normal business form and filters in dark mode, beyond the overview.
  const business = await makePage({ width: 390, theme: 'dark', user: users.find(user => user.account_type === 'student') });
  try {
    await business.page.goto(origin); await business.page.locator('.platform-nav').waitFor({ state: 'attached' });
    await openNavigation(business.page); await business.page.locator('.platform-nav').getByRole('button', { name: '测试', exact: true }).click();
    await showModuleRecords(business.page);
    await business.page.getByRole('button', { name: '新建测试', exact: true }).click();
    const combo = business.page.locator('.platform-section-create [role="combobox"]').first();
    await combo.click(); await business.page.getByRole('listbox').first().waitFor();
    const readings = await contrast(business.page, '.platform-section-create .platform-field>div,[role="listbox"] [role="option"],.platform-request-scope-note');
    const geometry = await checkGeometry(business.page, 'dark-business-form');
    results.push({ themeBusinessForm: true, ...geometry, lowContrast: readings.filter(row => row.ratio < 4.5), checks: readings.length, errors: business.errors });
    await business.page.screenshot({ path: path.join(out, 'theme-dark-mobile-business-form.png') });
  } finally { await business.page.close(); }
  return results;
}
