import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkPurchaseFilters(browser, origin, out, snapshot, teacher) {
  const results = [];
  for (const width of [1440, 390, 320]) {
    const account = { ...teacher, default_view_scope: 'all', session_token: 'synthetic-purchase-filter' };
    const purchases = [
      { _id: 981, material_name: '示例材料甲', preferred_supplier: '示例供应商', estimated_price: 10 },
      { _id: 982, material_name: '示例材料乙', preferred_supplier: '示例供应商分店', estimated_price: 20 },
      { _id: 983, material_name: '示例材料丙', preferred_supplier: '示例供应商', estimated_price: 30 },
    ].map(row => ({ ...row, public_id: 'QA-PUR-' + row._id, status: '待教师审核', applicant_username: 'example-student', review_teacher_username: teacher.username, quantity: 1, unit: '瓶', created_at: '2026-10-19T00:00:00Z' }));
    const page = await browser.newPage({ viewport: { width, height: 960 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: [teacher] } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account, lab_purchase_requests: purchases }, revision: 'purchase-filter-fixture' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0 } });
    });
    await page.goto(origin);
    await page.locator('.platform-nav').getByRole('button', { name: '采购审核', exact: true }).click();
    if (width < 640) await page.getByRole('button', { name: /展开筛选/ }).click();
    const supplier = page.getByPlaceholder('搜索或选择采购单位');
    assert.equal(await supplier.inputValue(), '全部');
    await supplier.fill('不存在的单位');
    await page.getByText('无相关内容', { exact: true }).waitFor();
    assert.equal(await page.getByRole('option').count(), 0);
    await supplier.fill('示例供应商');
    assert.equal(await page.getByRole('option').count(), 2);
    await page.getByRole('option', { name: '示例供应商', exact: true }).click();
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.getByRole('heading', { name: '待审批采购工单（2）', exact: true }).waitFor();
    assert.equal(await page.locator('.platform-business-headline strong').innerText(), '2');
    assert.match(await page.locator('.platform-business-footer').innerText(), /待审核预计金额\s*¥40/);
    assert.equal(await page.locator('main').getByRole('heading', { name: '示例材料乙', exact: true }).count(), 0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出.*CSV/ }).first().click();
    const csv = await fs.readFile(await (await download).path(), 'utf8');
    assert(csv.includes('示例材料甲') && csv.includes('示例材料丙') && !csv.includes('示例材料乙'));
    await page.screenshot({ path: path.join(out, 'purchase-unit-filter-' + width + '.png'), fullPage: true });
    await page.locator('.platform-nav').getByRole('button', { name: '测试审核', exact: true }).click();
    assert.equal(await page.getByPlaceholder('搜索或选择测试机构').inputValue(), '全部');
    await page.locator('.platform-nav').getByRole('button', { name: '采购审核', exact: true }).click();
    if (!(await supplier.isVisible())) await page.getByRole('button', { name: /展开筛选/ }).click();
    assert.equal(await supplier.inputValue(), '示例供应商');
    await page.getByRole('button', { name: '重置筛选', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[placeholder="搜索或选择采购单位"]')?.value === '全部');
    assert.equal(await supplier.inputValue(), '全部');
    await page.getByRole('heading', { name: '待审批采购工单（3）', exact: true }).waitFor();
    results.push({ purchaseUnitFilter: true, width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors });
    await page.close();
  }
  return results;
}
