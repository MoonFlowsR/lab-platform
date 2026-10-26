import assert from "node:assert/strict";
import path from "node:path";
import { openNavigation } from "./navigation.mjs";
import { showModuleRecords } from "./module-records.mjs";

export async function checkWorkspace(browser, origin, out, snapshot, users) {
  const results = [];
  async function createPage(width, user, failModule = false) {
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
            data: { ...snapshot, current_account: account },
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
    assert(!(await page.locator(".platform-workspace").textContent()).includes("账号账号"));
    assert.equal(await page.locator(".workspace-welcome .platform-person-name").count(), 0);
    assert.equal(await page.locator(".platform-sync-status").count(), 1);
    assert.equal(await page.locator(".workspace-topbar-primary > .platform-sync-status.is-in-topbar").count(), 1);
    assert.equal(await page.locator('.workspace-toolbar-host .platform-sync-status').count(), 0);
    assert(await page.locator('.workspace-toolbar-host').evaluate(node => node === node.parentElement.firstElementChild), 'Module controls are first in the content');
    assert(await page.locator('.workspace-topbar-primary').evaluate(node => node === node.parentElement.firstElementChild), 'Synchronization stays in the left side of the topbar');
    assert.equal(await page.locator('.platform-sync-guidance').innerText(), '请等待同步完成后操作');
    assert(await page.locator('.platform-sync-guidance').evaluate(node => node.tagName === 'STRONG' && parseFloat(getComputedStyle(node).fontWeight) >= 700), 'The full synchronization guidance is bold');
    assert.equal(await page.locator(".workspace-current-account").isVisible(), true);
    assert.equal(await page.locator(".workspace-current-account > strong").isVisible(), width > 640);
    assert.equal(await page.locator(".workspace-current-account").evaluate(node => node.nextElementSibling?.getAttribute("aria-label")), "账户设置");
    assert.equal(await page.locator(".workspace-sidebar-footer .platform-person-suffix").textContent(), "（教师账号）");
    const syncButton = await page.getByRole("button", { name: "手动同步", exact: true }).boundingBox();
    const syncText = await page.locator(".workspace-sync-state").boundingBox();
    assert(syncButton.x + syncButton.width <= syncText.x + 1, "Manual sync stays to the left of synchronization status");
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
      await drawer.getByRole("button").last().focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await drawer
          .getByRole("button", { name: "关闭导航" })
          .evaluate((node) => node === document.activeElement),
        true,
      );
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
    assert.equal(await page.locator('.workspace-toolbar-host > .platform-page-heading .platform-export-buttons > button').count(), 2, 'Both inventory exports stay in the module toolbar');
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
