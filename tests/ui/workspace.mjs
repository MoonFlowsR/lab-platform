import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { openNavigation } from "./navigation.mjs";
import { showModuleRecords } from "./module-records.mjs";
import packageInfo from "../../package.json" with { type: "json" };
async function checkVersion(locator) {
  assert.equal(await locator.count(), 1);
  assert.equal(await locator.evaluate(node => node.tagName), 'SMALL', 'The brand version is plain text');
  assert.equal((await locator.textContent()).trim(), `v${packageInfo.version}`);
  assert(await locator.evaluate(node => !!node.closest('.workspace-brand') && !node.closest('a')), 'Only the platform brand contains the version');
  if (!await locator.isVisible()) return null;
  const geometry = await locator.evaluate(node => {
    const version = node.getBoundingClientRect(), line = node.parentElement.previousElementSibling.getBoundingClientRect(),
      title = node.closest('.platform-brand-title').getBoundingClientRect(), brand = node.closest('.workspace-brand').getBoundingClientRect(), style = getComputedStyle(node);
    return { text: node.textContent, x: version.x, right: version.right, y: version.y, bottom: version.bottom, width: version.width, height: version.height,
      lineX: line.x, lineRight: line.right, lineY: line.y, lineBottom: line.bottom, lineWidth: line.width, titleWidth: title.width, titleRight: title.right,
      brandRight: brand.right, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), color: style.color,
      unclipped: node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight };
  });
  assert(geometry.unclipped && geometry.right <= geometry.titleRight + 1 && geometry.right <= geometry.brandRight + 1, `The complete version fits the brand: ${JSON.stringify(geometry)}`);
  assert(geometry.fontSize >= 12 && geometry.fontWeight <= 500, 'The version is readable, small and visually secondary');
  if (geometry.lineWidth + geometry.width + 4 <= geometry.titleWidth + .5)
    assert(geometry.x >= geometry.lineRight - 1 && geometry.y < geometry.lineBottom && geometry.bottom > geometry.lineY, `The version follows the final title line when space permits: ${JSON.stringify(geometry)}`);
  return geometry;
}

async function checkSidebarFocusLoop(page, sidebar) {
  assert.equal(await sidebar.locator('a.workspace-version,a[href="/updates"]').count(), 0, 'The sidebar has no version or history navigation link');
  assert.equal(await sidebar.locator('.workspace-sidebar-bottom .workspace-version').count(), 0, 'Account information has no duplicate footer version');
  const close = sidebar.getByRole('button', { name: '关闭导航', exact: true });
  const lastModule = sidebar.locator('.platform-nav button').last();
  await lastModule.focus();
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(node => node === document.activeElement), true, 'The drawer wraps from its last module to the close button');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await lastModule.evaluate(node => node === document.activeElement), true, 'Reverse tabbing from close returns to the last module');
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(node => node === document.activeElement), true);
}

async function checkWelcomeAlignment(page) {
  const geometry = await page.locator('.workspace-welcome > div:first-child').evaluate(node => {
    const heading = node.querySelector('h1'), date = node.querySelector('time'), box = node.getBoundingClientRect(),
      titleBox = heading.getBoundingClientRect(), dateBox = date.getBoundingClientRect();
    const baseline = element => {
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline';
      element.appendChild(probe);
      const y = probe.getBoundingClientRect().y;
      probe.remove();
      return y;
    };
    return { viewport: innerWidth, right: box.right, titleX: titleBox.x, titleRight: titleBox.right, titleY: titleBox.y, titleBottom: titleBox.bottom,
      dateX: dateBox.x, dateRight: dateBox.right, dateY: dateBox.y, dateBottom: dateBox.bottom,
      titleBaseline: baseline(heading), dateBaseline: baseline(date), date: date.textContent,
      dateNoWrap: getComputedStyle(date).whiteSpace === 'nowrap', dateFits: date.scrollWidth <= date.clientWidth };
  });
  assert(Math.abs(geometry.dateRight - geometry.right) <= 1, `The date aligns with the right edge of the welcome row: ${JSON.stringify(geometry)}`);
  assert(Math.abs(geometry.titleBaseline - geometry.dateBaseline) <= 1, `The title and date share a real text baseline: ${JSON.stringify(geometry)}`);
  assert(geometry.dateX >= geometry.titleRight && geometry.dateNoWrap && geometry.dateFits, `The complete date and weekday stay on the title line: ${JSON.stringify(geometry)}`);
  assert(Math.max(geometry.dateY, geometry.titleY) < Math.min(geometry.dateBottom, geometry.titleBottom));
  return geometry;
}

export async function checkWorkspace(browser, origin, out, snapshot, users) {
  const results = [];
  async function createPage(width, user, failModule = false, data = snapshot) {
    const account = user && {
      ...user,
      profile_required: false,
      session_token: "isolated-workspace",
    };
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    if (account)
      await page.addInitScript(
        (value) =>
          sessionStorage.setItem("surface_lab_account", JSON.stringify(value)),
        account,
      );
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (failModule && /InventoryPage-.*\.js$/.test(url.pathname))
        return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me")
        return route.fulfill({
          json: { ok: true, account, teachers: snapshot.lab_teacher_accounts },
        });
      if (url.pathname === "/api/ops/listAll")
        return route.fulfill({
          json: {
            ok: true,
            data: { ...data, current_account: account },
            revision: "workspace",
          },
        });
      if (url.pathname === "/api/events")
        return route.fulfill({
          contentType: "text/event-stream",
          body: ": fixture\n\n",
        });
      return route.fulfill({
        json: { ok: true, rows: [], total: 0, comments: [] },
      });
    });
    return page;
  }
  for (const width of [1440, 1024, 768, 390, 320]) {
    const page = await createPage(width, users[1]),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.getByTestId("task-total").waitFor();
    const welcome = await checkWelcomeAlignment(page);
    assert.equal(await page.locator('.workspace-brand-name > small').count(), 0, 'The brand has no redundant subtitle');
    await checkVersion(page.locator('.workspace-version'));
    assert(!(await page.locator(".platform-workspace").textContent()).includes("账号账号"));
    assert.equal(await page.locator(".workspace-welcome .platform-person-name").count(), 0);
    assert.equal(await page.locator(".platform-sync-status").count(), 1);
    assert.equal(await page.locator(".workspace-topbar-primary > .platform-sync-status.is-in-topbar").count(), 1);
    assert.equal(await page.locator('.workspace-toolbar-host .platform-sync-status').count(), 0);
    assert(await page.locator('.workspace-toolbar-host').evaluate(node => node === node.parentElement.firstElementChild), 'Module controls are first in the content');
    assert(await page.locator('.workspace-topbar-primary').evaluate(node => node === node.parentElement.firstElementChild), 'Synchronization stays in the left side of the topbar');
    assert.equal(await page.locator('.platform-sync-guidance').innerText(), '请等待同步完成后操作');
    assert.equal(await page.locator('.workspace-sync-dot').isVisible(), true, 'The synchronization dot is visible on every viewport');
    assert.equal(await page.locator('.workspace-sync-dot').getAttribute('aria-hidden'), 'true', 'The dot is decorative while the text conveys the state');
    const dotBox = await page.locator('.workspace-sync-dot').boundingBox();
    assert.equal(dotBox.width, 8); assert.equal(dotBox.height, 8);
    assert(await page.locator('.platform-sync-guidance').evaluate(node => node.tagName === 'STRONG' && parseFloat(getComputedStyle(node).fontWeight) >= 700), 'The full synchronization guidance is bold');
    assert.equal(await page.locator(".workspace-current-account").isVisible(), width > 360);
    assert.equal(await page.locator(".workspace-current-account > strong").isVisible(), width > 640);
    assert.equal(await page.locator(".workspace-current-account").evaluate(node => node.nextElementSibling?.getAttribute("aria-label")), "账户设置");
    assert.equal(await page.locator(".workspace-sidebar-footer .platform-person-suffix").textContent(), "（教师账号）");
    const syncButton = await page.getByRole("button", { name: "手动同步", exact: true }).boundingBox();
    const syncText = await page.locator(".workspace-sync-state").boundingBox();
    if (width <= 640) {
      assert.equal(await page.locator('.workspace-context > .workspace-sync-slot > .workspace-sync-control').count(), 1, 'The only manual sync control follows mobile navigation');
      const menuBox = await page.locator('.workspace-menu-button').boundingBox();
      assert(syncButton.x >= menuBox.x + menuBox.width && syncButton.x - menuBox.x - menuBox.width <= 8, 'Mobile manual sync is immediately right of navigation');
      assert(Math.abs(syncButton.y + syncButton.height / 2 - menuBox.y - menuBox.height / 2) <= 1, 'Navigation and manual sync share a vertical center');
      assert(syncButton.y + syncButton.height <= syncText.y + 1, 'Mobile synchronization status stays beneath the action row');
    } else assert(syncButton.x + syncButton.width <= syncText.x + 1, "Desktop manual sync stays to the left of synchronization status");
    const menu = page.getByRole("button", {
      name: "打开模块导航",
      exact: true,
    });
    if (width < 1100) {
      assert.equal(await page.locator(".platform-nav").isVisible(), false);
      await openNavigation(page);
      const drawer = page.getByRole("dialog", { name: "模块导航" });
      assert.equal(
        await page.locator(".workspace-body").getAttribute("inert"),
        "",
      );
      await checkSidebarFocusLoop(page, drawer);
      if (width === 390)
        await page.screenshot({
          path: path.join(out, "workspace-mobile-navigation.png"),
        });
      await page.keyboard.press("Escape");
      assert.equal(
        await menu.evaluate((node) => node === document.activeElement),
        true,
      );
      assert.equal(
        await page.locator(".workspace-body").getAttribute("inert"),
        null,
      );
    } else assert.equal(await page.locator(".platform-nav").isVisible(), true);
    await openNavigation(page);
    await page
      .locator(".platform-nav")
      .getByRole("button", { name: "测试审核", exact: true })
      .click();
    await showModuleRecords(page);
    const moduleToolbar = page.locator('.workspace-toolbar-host > .platform-page-heading');
    assert.equal(await moduleToolbar.locator('.platform-sync-status').count(), 0, 'Module toolbar does not duplicate synchronization');
    assert.equal(await page.locator('.workspace-topbar-primary > .platform-sync-status.is-in-topbar').count(), 1, 'Synchronization remains in the header');
    assert.equal(await page.locator('.platform-sync-status').count(), 1);
    assert.equal(await moduleToolbar.locator('.platform-toolbar-actions .platform-request-scope').count(), 1, 'View scope belongs in the module toolbar');
    assert.equal(await moduleToolbar.locator('.platform-export-buttons > button').count(), 0);
    assert.equal(await page.locator('.platform-business-card .platform-statistics-actions').getByRole('button', { name: /导出.*Excel/ }).count(), 1, 'Business export belongs in the statistics card');
    const statusSizes = await page.locator('.workspace-sync-state,.platform-sync-guidance,.workspace-logout').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
    assert(statusSizes.every(size => size === statusSizes[0]), 'Synchronization and topbar actions share one font size');
    await page.getByRole("button", { name: /^查看已完成工单/ }).click();
    assert.equal(
      await page
        .locator("main > .platform-section-reviewed")
        .evaluate((node) => document.activeElement === node),
      true,
    );
    assert(
      (await page.locator("main > .platform-section-reviewed").boundingBox())
        .y >= (await page.locator('.workspace-topbar').boundingBox()).height,
      "State heading remains below the sticky toolbar",
    );
    await page.keyboard.press("Control+k");
    const search = page.getByRole("searchbox", { name: "搜索记录" });
    assert.equal(
      await search.evaluate((node) => node === document.activeElement),
      true,
    );
    await search.fill("不存在的工作台检索词");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("main .platform-request-record").length === 0,
    );
    await page.getByRole("button", { name: "清空搜索", exact: true }).click();
    assert.equal(await search.inputValue(), "");
    await page.locator("main .platform-request-record").first().waitFor();
    await openNavigation(page);
    await page
      .locator(".platform-nav")
      .getByRole("button", { name: "库存", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "材料批次库存", exact: true })
      .waitFor();
    assert.equal(await page.locator('.workspace-toolbar-host > .platform-page-heading .platform-export-buttons > button').count(), 0, 'Inventory exports belong to their own sections');
    for (const title of ['材料汇总', '材料批次库存']) {
      const header = page.locator('.platform-inventory-section-header').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      assert.equal(await header.getByRole('button', { name: '导出Excel', exact: true }).count(), 1);
      const headingBox = await header.getByRole('heading').boundingBox(), buttonBox = await header.getByRole('button').boundingBox(), headerBox = await header.boundingBox();
      assert(Math.abs(headingBox.y + headingBox.height / 2 - buttonBox.y - buttonBox.height / 2) <= 1, 'Inventory title and export align vertically');
      assert(Math.abs(buttonBox.x + buttonBox.width - headerBox.x - headerBox.width) <= 1, 'Inventory export stays at the upper right');
    }
    assert.equal(await page.locator('.workspace-toolbar-host .platform-sync-status').count(), 0, 'Inventory toolbar does not duplicate synchronization');
    const table = page.locator("main .platform-table-responsive").first();
    assert.equal(
      await table.locator(".platform-mobile-records").isVisible(),
      width <= 1024,
      "Narrow tables must show record cards, not an empty area",
    );
    assert.equal(
      await table.locator(".platform-table-desktop").isVisible(),
      width > 1024,
    );
    await page.screenshot({
      path: path.join(out, `workspace-inventory-${width}.png`),
      fullPage: true,
    });
    results.push({
      workspace: true,
      width,
      welcome,
      keyboard: true,
      navigation: true,
      statusLinks: true,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      errors,
    });
    if (width === 768) {
      await openNavigation(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(
        () => !document.querySelector(".workspace-body").inert,
      );
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    }
    await page.close();
  }
  for (const { width, height, user } of [
    { width: 1440, height: 900, user: users[1] },
    { width: 390, height: 900, user: users[2] },
    { width: 390, height: 480, user: users[0] },
    { width: 320, height: 480, user: users[2] },
    { width: 640, height: 320, user: users[0] },
    { width: 320, height: 320, user: users[2] },
  ]) {
    const page = await createPage(width, user), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto(origin); await page.getByTestId('task-total').waitFor();
    if (width < 1100) await openNavigation(page);
    const sidebar = page.locator('.workspace-sidebar');
    const geometry = await sidebar.evaluate(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node), bottom = node.querySelector('.workspace-sidebar-bottom').getBoundingClientRect(),
        footer = node.querySelector('.workspace-sidebar-footer').getBoundingClientRect(), nav = node.querySelector('.platform-nav'), navBox = nav.getBoundingClientRect(),
        mark = node.querySelector('.workspace-brand-mark').getBoundingClientRect(), title = node.querySelector('.platform-brand-lines').getBoundingClientRect();
      return { top: box.top, height: box.height, bottom: box.bottom, bottomContent: bottom.bottom, paddingBottom: parseFloat(style.paddingBottom),
        footerTop: footer.top, footerBottom: footer.bottom, navTop: navBox.top, navBottom: navBox.bottom, navHeight: navBox.height, navScrollHeight: nav.scrollHeight,
        markHeight: mark.height, titleHeight: title.height, markCenter: mark.y + mark.height / 2, titleCenter: title.y + title.height / 2,
        lines: node.querySelectorAll('.platform-brand-lines > span').length };
    });
    assert.equal(geometry.height, height, 'The sidebar tracks the visible viewport height');
    assert(Math.abs(geometry.bottomContent + geometry.paddingBottom - geometry.bottom) <= 1, 'Account information stays at the bottom with safe-area padding');
    assert(geometry.navHeight >= 44, 'Short screens retain a usable navigation scroll area');
    assert(geometry.navBottom <= geometry.footerTop, 'Navigation never covers the identity footer');
    assert(Math.abs(geometry.markCenter - geometry.titleCenter) <= 1, 'Logo and title are vertically centered');
    if (geometry.lines === 2) assert(Math.abs(geometry.markHeight - geometry.titleHeight) <= 1, 'Logo and the two-line title share a height');
    await sidebar.locator('.platform-nav').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const afterScroll = await sidebar.locator('.workspace-sidebar-footer').boundingBox();
    assert(Math.abs(afterScroll.y - geometry.footerTop) <= 1, 'Only the navigation list scrolls');
    await checkVersion(sidebar.locator('.workspace-version'));
    if (width < 1100) {
      await checkSidebarFocusLoop(page, sidebar);
      await sidebar.getByRole('button', { name: '关闭导航', exact: true }).click();
      assert.equal(await sidebar.isVisible(), false);
      await openNavigation(page);
    }
    await page.screenshot({ path: path.join(out, `workspace-sidebar-${width}-${height}-${user.account_type}.png`) });
    assert.deepEqual(errors, []);
    results.push({ workspaceSidebarFit: true, width, height, role: user.account_type, ...geometry, errors });
    await page.close();
  }
  for (const width of [1440, 390, 320]) {
    const page = await createPage(width);
    await page.goto(origin);
    await page.getByRole("button", { name: "登录", exact: true }).waitFor();
    await page.getByRole("button", { name: "显示密码", exact: true }).click();
    assert.equal(
      await page.locator(".platform-password-field input").getAttribute("type"),
      "text",
    );
    await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
    assert.equal(
      await page.locator(".platform-password-field input").getAttribute("type"),
      "password",
    );
    if (width < 640) {
      await page.locator(".platform-login-mobile-roles summary").click();
      assert.equal(
        await page.locator(".platform-login-mobile-roles").getAttribute("open"),
        "",
      );
    }
    await page.screenshot({
      path: path.join(out, `workspace-login-${width}.png`),
      fullPage: true,
    });
    results.push({
      workspaceLogin: true,
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    await page.close();
  }
  // Real role-specific pending records give every role a three-digit task count.
  function mobileTaskSnapshot(account) {
    const role = account.account_type;
    const work = Array.from({ length: role === 'admin' ? 0 : 999 }, (_, index) => ({
      _id: 20000 + index, public_id: `QA-MOBILE-TASK-${index}`, request_type: '测试', work_content: '示例待办',
      applicant_username: role === 'student' ? account.username : users[2].username,
      applicant_name: role === 'student' ? account.display_name : users[2].display_name,
      review_teacher_username: role === 'teacher' ? account.username : users[1].username,
      status: role === 'teacher' ? '待教师审核' : role === 'finance' ? '已完成' : '已通过',
      cost_test: 1, workload_quantity: 1, workload_unit: '小时', settlement_status: '已挂账', reimbursed: false,
      created_at: '2026-10-27T00:00:00Z', completed_at: role === 'finance' ? '2026-10-27T01:00:00Z' : '',
    }));
    return { ...snapshot, lab_work_requests: work, lab_purchase_requests: [], lab_stock_out_requests: [],
      accounts: role === 'admin' ? [account, ...Array.from({ length: 999 }, (_, index) => ({ id: 30000 + index, username: `qa-mobile-pending-${index}`, display_name: '示例待启用账号', account_type: 'student', status: 'pending' }))] : snapshot.accounts };
  }
  const mobileRoles = [...users, { id: 94, _id: 94, username: 'qa-mobile-finance', display_name: '示例财务', account_type: 'finance', status: 'active' }];
  // The mobile sync control moves without duplicates; API behavior remains unchanged.
  for (const user of mobileRoles) for (const width of [320, 390]) for (const theme of ['light', 'dark', 'mixed']) for (const textScale of [100, 125]) {
    const data = mobileTaskSnapshot(user), role = user.account_type;
    const page = await createPage(width, user, false, data), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem('platform:theme', value), theme);
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('.workspace-sync-state')?.textContent.includes('同步完成'));
    await page.waitForFunction(() => document.querySelector('.workspace-tasks b')?.textContent === '999');
    if (textScale === 125) await page.addStyleTag({ content: 'html{font-size:20px!important}' });
    const mobileWelcome = await checkWelcomeAlignment(page);
    async function inspectStatus(label, expectedDot = 'success') {
      const geometry = await page.locator('.workspace-statusbar').evaluate(node => {
        const state = node.querySelector('.workspace-sync-state'), guidance = node.querySelector('.platform-sync-guidance'),
          box = node.getBoundingClientRect(), a = state.getBoundingClientRect(), b = guidance.getBoundingClientRect(), style = getComputedStyle(guidance),
          dot = node.querySelector('.workspace-sync-dot'), dotBox = dot.getBoundingClientRect(), dotStyle = getComputedStyle(dot);
        return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, x: box.x, right: box.right, height: box.height,
          stateX: a.x, stateRight: a.right, stateCenter: a.y + a.height / 2, guidanceCenter: b.y + b.height / 2,
          contentCenter: (a.x + b.right) / 2, containerCenter: (box.x + box.right) / 2,
          dotTextGap: state.querySelector('span:last-child').getBoundingClientRect().x - dotBox.right,
          stateGuidanceGap: b.x - a.right,
          guidanceX: b.x, guidanceRight: b.right, guidanceHeight: b.height, fontSize: parseFloat(style.fontSize), guidanceText: guidance.textContent.trim(), bold: Number(style.fontWeight),
          prefixVisible: getComputedStyle(node.querySelector('.workspace-sync-prefix')).display !== 'none',
          completeTextFits: state.querySelector('span:last-child').scrollWidth <= state.querySelector('span:last-child').clientWidth,
          syncX: document.querySelector('.workspace-sync-control').getBoundingClientRect().x,
          title: state.title, ariaLabel: state.getAttribute('aria-label'),
          dot: { width: dotBox.width, height: dotBox.height, visible: !!dot.getClientRects().length && dotStyle.visibility === 'visible' && dotStyle.display !== 'none',
            color: dotStyle.backgroundColor, ariaHidden: dot.getAttribute('aria-hidden'), className: dot.className } };
      });
      const diagnostic = JSON.stringify({ width, theme, textScale, label, geometry });
      assert(geometry.scrollWidth <= width && geometry.x >= 0 && geometry.right <= width, `Mobile sync line fits the viewport: ${diagnostic}`);
      assert(Math.abs(geometry.stateCenter - geometry.guidanceCenter) <= 1, `Status and full guidance share one aligned line: ${diagnostic}`);
      assert(geometry.stateRight <= geometry.guidanceX && geometry.guidanceRight <= width, `Status has its own truncation slot: ${diagnostic}`);
      assert(geometry.guidanceHeight <= geometry.fontSize * 1.7, `The guidance never wraps: ${diagnostic}`);
      assert.equal(geometry.guidanceText, '请等待同步完成后操作');
      assert(geometry.bold >= 700);
      assert.equal(geometry.prefixVisible, false, 'The mobile line avoids repeating the redundant status label');
      assert(Math.abs(geometry.contentCenter - geometry.containerCenter) <= 1, `The full synchronization line is centered: ${diagnostic}`);
      assert(Math.abs(geometry.dotTextGap - 6) <= 1 && Math.abs(geometry.stateGuidanceGap - 6) <= 1, `The dot, status and guidance have clear six-pixel gaps: ${diagnostic}`);
      if (['complete', 'recovered', 'resized'].includes(label)) assert(geometry.completeTextFits, `The full four-character completion status remains readable: ${diagnostic}`);
      const palette = theme === 'dark'
        ? { success: 'rgb(52, 211, 153)', busy: 'rgb(251, 146, 60)', error: 'rgb(248, 113, 113)' }
        : { success: 'rgb(22, 163, 74)', busy: 'rgb(234, 88, 12)', error: 'rgb(239, 68, 68)' };
      assert(geometry.dot.visible && geometry.dot.width === 8 && geometry.dot.height === 8, `The synchronization dot stays visible at a modest eight pixels: ${diagnostic}`);
      assert.equal(geometry.dot.ariaHidden, 'true');
      assert(geometry.dot.className.includes(`is-${expectedDot}`));
      assert.equal(geometry.dot.color, palette[expectedDot], `The synchronization dot has the appropriate vivid state color: ${diagnostic}`);
      assert.equal(geometry.title, geometry.ariaLabel, 'The full synchronization state remains available to assistive technology and tooltips');
      return geometry;
    }
    const complete = await inspectStatus('complete');
    let releaseSync;
    const pending = new Promise(resolve => { releaseSync = resolve; });
    let requests = 0;
    let failSync = true;
    await page.route('**/api/ops/listAll', async route => {
      requests++;
      await pending;
      if (failSync) return route.fulfill({ status: 503, json: { ok: false, message: '隔离同步失败测试，请再次手动同步。' } });
      await route.fulfill({ json: { ok: true, data: { ...data, current_account: { ...user, profile_required: false } }, revision: 'manual-sync-fixture' } });
    });
    try {
      const control = page.getByRole('button', { name: '手动同步', exact: true });
      assert.equal(await page.locator('.workspace-sync-control').count(), 1);
      assert.equal(await page.locator('.workspace-context > .workspace-sync-slot > .workspace-sync-control').count(), 1);
      const box = await control.boundingBox();
      assert(box.width >= (width <= 360 ? 36 : 40) && box.height >= 44);
      const menuBox = await page.locator('.workspace-menu-button').boundingBox();
      assert(box.x >= menuBox.x + menuBox.width && box.x - menuBox.x - menuBox.width <= 8, 'Mobile manual sync stays immediately right of the three-line navigation button');
      assert(Math.abs(box.y + box.height / 2 - menuBox.y - menuBox.height / 2) <= 1, 'Navigation and synchronization are vertically aligned');
      assert(Math.abs(menuBox.x - 12) <= 1, 'The navigation button has consistent mobile left padding');
      assert(Math.abs(box.x - menuBox.x - menuBox.width - 4) <= 1, 'Navigation and sync use the same four-pixel gap as the action bar');
      const actionGeometry = await page.locator('.workspace-topbar-actions').evaluate(node => {
        const boxes = [...node.children].filter(item => item.getClientRects().length && getComputedStyle(item).display !== 'none').map(item => item.getBoundingClientRect());
        const icon = node.querySelector('.workspace-tasks > .platform-icon').getBoundingClientRect(), badge = node.querySelector('.workspace-tasks > b').getBoundingClientRect();
        return { gaps: boxes.slice(1).map((box, index) => box.x - boxes[index].right), right: boxes.at(-1).right,
          taskInline: Math.abs(icon.y + icon.height / 2 - badge.y - badge.height / 2) <= 1 && icon.right <= badge.x,
          badgePosition: getComputedStyle(node.querySelector('.workspace-tasks > b')).position };
      });
      assert(actionGeometry.gaps.every(gap => Math.abs(gap - 4) <= 1), 'Mobile action gaps are consistent');
      assert(Math.abs(width - actionGeometry.right - menuBox.x) <= 1, 'Mobile header left and right padding match');
      assert.equal(actionGeometry.taskInline, true, 'The task icon and real three-digit count sit side by side');
      assert.equal(actionGeometry.badgePosition, 'static', 'The task count is not an overlaid corner badge');
      assert(await page.locator('.workspace-menu-button').evaluate(node => node.nextElementSibling?.classList.contains('workspace-sync-slot')), 'DOM and visual button order agree');
      assert(await control.evaluate(node => { const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return node === hit || node.contains(hit); }), 'The mobile sync button receives a real center click');
      await control.click();
      await page.getByRole('button', { name: '同步中…', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '同步中…', exact: true }).isDisabled(), true);
      assert.equal(await page.locator('.workspace-sync-control').count(), 1);
      const busy = await inspectStatus('busy', 'busy');
      releaseSync();
      await page.getByRole('button', { name: '手动同步', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('.workspace-sync-state')?.textContent.includes('同步失败'));
      const long = await inspectStatus('real-network-error', 'error');
      assert.equal(long.title, '同步状态：同步失败，请重试', 'The complete failure text remains available even if its display is shortened');
      assert.equal(requests, 1, 'One manual click performs one failed read-only sync request');
      if (role === 'student' && textScale === 125) await page.screenshot({ path: path.join(out, `workspace-sync-error-${width}-${theme}.png`) });
      failSync = false;
      await page.getByRole('button', { name: '手动同步', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.workspace-sync-state')?.textContent.includes('同步完成'));
      const recovered = await inspectStatus('recovered');
      assert.equal(requests, 2, 'The explicit retry performs one additional read-only request and recovers successfully');
      await page.getByRole('button', { name: '关闭操作提示', exact: true }).click();
      let transitionLayout = null;
      if (role === 'admin' && width === 390 && textScale === 125) {
        await page.setViewportSize({ width: 370, height: 900 });
        transitionLayout = await page.evaluate(() => {
          const nav = document.querySelector('.workspace-menu-button').getBoundingClientRect(), sync = document.querySelector('.workspace-sync-control').getBoundingClientRect(),
            exit = document.querySelector('.workspace-logout').getBoundingClientRect(), state = document.querySelector('.workspace-sync-state').getBoundingClientRect(), guidance = document.querySelector('.platform-sync-guidance').getBoundingClientRect();
          const controls = [...document.querySelectorAll('.workspace-menu-button,.workspace-sync-control,.workspace-topbar-actions>button,.workspace-topbar-actions>a,.platform-theme-trigger')]
            .filter(node => node.getClientRects().length).map(node => {
              const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return { label: node.getAttribute('aria-label'), x: box.x, right: box.right, width: box.width, height: box.height, hit: node === hit || node.contains(hit) };
            });
          return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, navigationX: nav.x, syncWidth: sync.width,
            syncGap: sync.x - nav.right, rightPadding: innerWidth - exit.right, statusCenterOffset: (state.x + guidance.right) / 2 - innerWidth / 2, controls };
        });
        assert(transitionLayout.scrollWidth <= 370 && transitionLayout.syncWidth >= 36 && transitionLayout.syncWidth <= 40, 'The intermediate viewport keeps all actions in the compact width range');
        assert(Math.abs(transitionLayout.navigationX - 12) <= 1 && Math.abs(transitionLayout.rightPadding - 12) <= 1 && Math.abs(transitionLayout.syncGap - 4) <= 1 && Math.abs(transitionLayout.statusCenterOffset) <= 1);
        assert(transitionLayout.controls.every(control => control.hit && control.width >= 36 && control.height >= 44 && control.x >= 0 && control.right <= 371), 'Intermediate-width controls remain visible and receive actual center clicks');
        await page.screenshot({ path: path.join(out, `workspace-mobile-transition-${theme}.png`) });
        await page.setViewportSize({ width, height: 900 });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelectorAll('.workspace-statusbar > .workspace-sync-control').length === 1);
      assert.equal(await page.locator('.workspace-sync-control').count(), 1, 'Resizing to desktop moves the same single control back to the status row');
      assert.equal(await page.locator('.workspace-sync-dot').isVisible(), true, 'Desktop synchronization also keeps its status dot');
      const desktopDot = await page.locator('.workspace-sync-dot').boundingBox();
      assert.equal(desktopDot.width, 8); assert.equal(desktopDot.height, 8);
      const desktopWelcome = await checkWelcomeAlignment(page);
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.querySelectorAll('.workspace-context > .workspace-sync-slot > .workspace-sync-control').length === 1);
      assert.equal(await page.locator('.workspace-sync-control').count(), 1, 'Resizing back to phone never duplicates controls');
      await inspectStatus('resized');
      await openNavigation(page);
      const brandVersion = await checkVersion(page.locator('.workspace-brand .workspace-version'));
      await page.getByRole('button', { name: '关闭导航', exact: true }).click();
      await page.screenshot({ path: path.join(out, `workspace-mobile-sync-${role}-${width}-${theme}-${textScale}.png`) });
      assert.deepEqual(errors, []);
      results.push({ workspaceMobileSync: true, role, width, theme, textScale, taskCount: 999, requests, complete, busy, long, recovered, actionGeometry, transitionLayout, brandVersion, welcome: { mobile: mobileWelcome, desktop: desktopWelcome }, errors });
    } catch (failure) {
      const name = `workspace-mobile-sync-failure-${role}-${width}-${theme}-${textScale}`;
      await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {});
      const diagnostic = await page.evaluate(() => ({ status: document.querySelector('.workspace-sync-state')?.textContent,
        controls: [...document.querySelectorAll('.workspace-sync-control')].map(node => ({ disabled: node.disabled, label: node.getAttribute('aria-label'), connected: node.isConnected })),
        body: document.body.innerText.slice(-1800) })).catch(() => null);
      const detail = { role, width, theme, textScale, requests, errors, diagnostic, message: failure.message };
      await fs.writeFile(path.join(out, `${name}.json`), JSON.stringify(detail, null, 2));
      throw new Error(`${failure.message}\n${JSON.stringify(detail)}`, { cause: failure });
    } finally { releaseSync(); await page.close(); }
  }
  const failed = await createPage(390, users[1], true);
  await failed.goto(origin);
  await failed.getByTestId("task-total").waitFor();
  await openNavigation(failed);
  await failed
    .locator(".platform-nav")
    .getByRole("button", { name: "库存", exact: true })
    .click();
  await failed
    .getByRole("heading", { name: "页面暂时未能打开", exact: true })
    .waitFor();
  await openNavigation(failed);
  await failed
    .locator(".platform-nav")
    .getByRole("button", { name: "总览", exact: true })
    .click();
  await failed.getByTestId("task-total").waitFor();
  results.push({ moduleFailureRecovery: true });
  await failed.close();
  return results;
}
