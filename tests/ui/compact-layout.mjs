import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

async function firstTextLine(locator) {
  return locator.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text; while ((text = walker.nextNode()) && !text.textContent.trim()) {}
    if (!text) throw new Error('Expected a visible description');
    const range = document.createRange(); range.selectNodeContents(text);
    const rect = [...range.getClientRects()].find(rect => rect.width && rect.height);
    const style = getComputedStyle(element);
    return { y: rect.y, height: rect.height, fontSize: style.fontSize, lineHeight: style.lineHeight };
  });
}

// Every API is intercepted. These checks navigate and open forms, but submit no records.
export async function checkCompactLayout(browser, origin, out, snapshot, users) {
  const student = users.find(user => user.account_type === 'student'), results = [];
  const modules = [
    { label: '测试', scope: '其它测试进度', create: '新建测试' },
    { label: '加工', scope: '其它加工进度', create: '新建加工' },
    { label: '维修', scope: '其它维修进度', create: '新建维修' },
    { label: '采购/入库', scope: '其它采购入库进度', create: '新建采购' },
    { label: '出/退库', scope: '其它出库退库记录', create: '新增记录' },
  ];
  for (const width of [320, 390, 1366]) {
    const account = { ...student, profile_required: false, session_token: 'isolated-compact-layout' };
    const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(account => { sessionStorage.setItem('surface_lab_account', JSON.stringify(account)); localStorage.setItem('platform:theme', 'light'); }, account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() !== 'GET' && !['/api/auth/me', '/api/ops/listAll'].includes(url.pathname)) writes.push(url.pathname);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: snapshot.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account }, revision: 'compact-layout' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated compact-layout fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    try {
      await page.goto(origin); await page.getByTestId('task-total').waitFor();
      for (const module of modules) {
        await openNavigation(page);
        await page.locator('.platform-nav').getByRole('button', { name: module.label, exact: true }).click();
        await showModuleRecords(page); await page.evaluate(() => window.scrollTo(0, 0));
        const heading = page.locator('.platform-page-heading'), scope = heading.locator('.platform-request-scope');
        await scope.waitFor();
        const control = scope.getByRole('combobox', { name: '查看范围', exact: true });
        assert.equal(await control.evaluate(element => element.tagName), 'SELECT', 'Scope opens a fixed native choice');
        assert.equal(await scope.locator('input').count(), 0, 'Scope has no text-search input');
        await control.selectOption('all'); assert.equal(await control.inputValue(), 'all');
        assert.equal(await page.getByRole('listbox').count(), 0);
        await control.selectOption('mine'); assert.equal(await control.inputValue(), 'mine');
        const scopeText = (await scope.textContent()).replace(/\s/g, '');
        assert(scopeText.includes(module.scope), `Scope explanation names its own module: ${module.label}: ${scopeText}`);
        const left = heading.locator(':scope > div').first(), right = heading.locator(':scope > .platform-toolbar-actions');
        const description = await firstTextLine(left.locator(':scope > p'));
        const scopeDescription = await firstTextLine(scope.locator(':scope > small'));
        assert(Math.abs(description.y - scopeDescription.y) <= 2, `Descriptions share their first text baseline: ${JSON.stringify({ width, module: module.label, description, scopeDescription })}`);
        assert.equal(description.fontSize, scopeDescription.fontSize, 'Both descriptions use the same readable size');
        const scopeBox = await control.boundingBox();
        assert(Math.abs(scopeBox.height - 32) <= 1, 'Scope stays compact');
        if (width <= 640) {
          const leftBox = await left.boundingBox(), rightBox = await right.boundingBox();
          assert(Math.abs(leftBox.width - rightBox.width) <= 2, 'Mobile heading and scope occupy equal columns');
          assert(rightBox.x >= leftBox.x + leftBox.width + 6, 'Scope remains separate on the right');
        }
        const search = page.locator('.platform-page-search'), input = search.getByRole('searchbox'), icon = search.locator(':scope > svg');
        const inputBox = await input.boundingBox(), iconBox = await icon.boundingBox();
        const inputStyle = await input.evaluate(element => { const style = getComputedStyle(element); return { lineHeight: style.lineHeight, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom }; });
        assert(Math.abs(inputBox.y + inputBox.height / 2 - iconBox.y - iconBox.height / 2) <= 1, 'Search text field and icon are vertically centered');
        assert.equal(inputStyle.lineHeight, '44px'); assert.equal(inputStyle.paddingTop, '0px'); assert.equal(inputStyle.paddingBottom, '0px');
        const create = page.locator('.platform-section-create'), button = create.getByRole('button', { name: module.create, exact: true });
        await button.waitFor();
        const metaHeading = create.locator('.platform-create-heading.has-meta');
        let createGeometry = null;
        if (await metaHeading.count()) {
          const meta = metaHeading.locator('.platform-request-form-meta');
          assert.equal(await meta.locator(':scope > span').count(), 2, 'Applicant and automatic timestamp are two separate information groups');
          assert((await meta.textContent()).includes('提交时间：自动记录'));
          if (width <= 640) {
            const metaBox = await meta.boundingBox(), buttonBox = await button.boundingBox(), titleBox = await metaHeading.getByRole('heading', { level: 2 }).boundingBox();
            createGeometry = { metaBox, buttonBox, titleBox };
            assert(buttonBox.x >= metaBox.x + metaBox.width + 8, `Create action stays right of identity/time: ${JSON.stringify(createGeometry)}`);
            assert(Math.abs(buttonBox.y + buttonBox.height / 2 - metaBox.y - metaBox.height / 2) <= 1, 'Create action and identity block share a center');
            assert(buttonBox.height >= 44 && Math.abs(buttonBox.height - metaBox.height) <= 2, 'Create action fills the height of the identity/time block');
            assert(titleBox.y + titleBox.height <= metaBox.y, 'Title occupies its own row above identity/time');
          }
        } else {
          assert.equal(module.label, '出/退库', 'Only the movement form has no applicant/timestamp header');
          assert.equal(await create.locator('.platform-create-notice').count(), 0, 'The movement approval note is shown with the expanded form');
          if (width <= 640) {
            const titleBox = await create.getByRole('heading', { level: 2 }).boundingBox(), buttonBox = await button.boundingBox();
            assert(buttonBox.x >= titleBox.x + titleBox.width + 6, 'Movement toggle stays to the right of its title');
            assert(Math.abs(buttonBox.y + buttonBox.height / 2 - titleBox.y - titleBox.height / 2) <= 1, 'Movement title and toggle share a center');
          }
        }
        await button.click(); await create.locator('form').waitFor();
        if (module.label === '出/退库') {
          const movement = create.getByRole('combobox', { name: /类型/ });
          assert.equal(await movement.inputValue(), '', 'New movement type requires an explicit choice');
          assert.equal(await create.locator('.platform-create-notice').count(), 0);
          await movement.selectOption('出库');
          assert.equal(await create.locator('.platform-create-notice').count(), 1);
        }
        const geometry = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert(geometry.scrollWidth <= geometry.viewport); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(out, `compact-${module.create}-${width}.png`) });
        results.push({ compactLayout: true, width, module: module.label, ...geometry, scopeDescriptionAligned: true, scopeDescriptionDelta: scopeDescription.y - description.y, scopeNativeChoice: true, searchCentered: true, createMetadataAligned: createGeometry ? true : null, createGeometry, errors: [...errors] });
      }
    } finally { await page.close(); }
  }
  return results;
}
