import { readWorkbookText } from './workbook.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkAccountViewScope(browser, origin, out, snapshot, teacher) {
  const results = [];
  for (const width of [1440, 390, 320]) {
    const account = { ...teacher, default_view_scope: 'all', session_token: 'synthetic-scope' };
    const records = ['测试', '加工', '维修'].flatMap((type, i) => [
      { _id: 900 + i * 10, public_id: 'QA-OWN-' + i, request_type: type, work_content: '本人指定项目', status: '待教师审核', review_teacher_username: account.username, applicant_username: 'example-student', created_at: '2026-10-18T00:00:00Z' },
      { _id: 901 + i * 10, public_id: 'QA-OTHER-' + i, request_type: type, work_content: '团队核对项目', status: '待教师审核', review_teacher_username: 'other-teacher', applicant_username: 'example-student', created_at: '2026-10-19T00:00:00Z' },
      { _id: 902 + i * 10, public_id: 'QA-DONE-' + i, request_type: type, work_content: '团队已完成项目', status: '已完成', review_teacher_username: 'other-teacher', applicant_username: 'example-student', cost_test: 37, cost_processing: 37, cost_repair: 37, completed_at: '2026-10-19T01:00:00Z', created_at: '2026-10-19T01:00:00Z' },
    ]);
    const purchases = [
      { _id: 950, public_id: 'QA-PUR-OWN', material_name: '本人指定材料', review_teacher_username: account.username, status: '待教师审核', created_at: '2026-10-18T00:00:00Z' },
      { _id: 951, public_id: 'QA-PUR-OTHER', material_name: '团队核对材料', review_teacher_username: 'other-teacher', status: '待教师审核', created_at: '2026-10-19T00:00:00Z' },
    ];
    const page = await browser.newPage({ viewport: { width, height: 960 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), { ...account, default_view_scope: undefined });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: [teacher] } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data: { ...snapshot, current_account: account, lab_work_requests: records, lab_purchase_requests: purchases }, revision: 'scope-fixture' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0 } });
    });
    await page.goto(origin);
    await page.waitForFunction(()=>document.querySelector('.platform-sync-status > span')?.textContent.includes('同步状态：同步完成'));
    await page.locator('.platform-metric-scope').getByText('团队全部申请', { exact: true }).waitFor();
    await page.locator('main h3').filter({ hasText: '团队已完成项目' }).nth(2).waitFor();
    assert.equal(await page.locator('main').getByText('申请总数', { exact: true }).count(), 4);
    assert.equal(await page.locator('main').getByText('去审核 →', { exact: true }).count(), 0);
    assert.equal(await page.locator('main h3').filter({ hasText: '团队已完成项目' }).count(), 3);
    await page.screenshot({ path: path.join(out, 'finance-overview-' + width + '.png'), fullPage: true });
    for (const type of ['测试', '加工', '维修', '采购']) {
      await page.locator('.platform-nav').getByRole('button', { name: type + '审核', exact: true }).click();
      const scope = page.getByPlaceholder('搜索或选择查看范围');
      assert.equal(await scope.inputValue(), '全部', type + ' default scope at ' + width);
      const pending = page.locator('main > .platform-section-pending');
      if (await pending.getByRole('button', { name: '查看全部', exact: true }).count()) await pending.getByRole('button', { name: '查看全部', exact: true }).click();
      assert.equal(await pending.locator('h3').count(), 2);
      assert.equal(await pending.getByRole('button', { name: '同意', exact: true }).count(), 1);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
      const worksheetText = await readWorkbookText(await (await download).path());
      assert(worksheetText.includes(type === '采购' ? '团队核对材料' : '团队核对项目'));
      await scope.fill('本人');
      await page.getByRole('option', { name: '本人', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('main > .platform-section-pending h3').length === 1);
      assert.equal(await pending.locator('h3').count(), 1);
      assert.equal(await scope.inputValue(), '本人');
    }
    await page.reload();
    await page.locator('.platform-nav').getByRole('button', { name: '测试审核', exact: true }).click();
    assert.equal(await page.getByPlaceholder('搜索或选择查看范围').inputValue(), '全部');
    results.push({ financeScope: true, width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors });
    await page.close();
  }
  return results;
}
