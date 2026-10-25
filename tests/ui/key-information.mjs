import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import { assertSingleLine } from './readability.mjs';

// Exercise actual role pages with long amounts, pending work and inventory alerts.
export async function checkKeyInformation(browser, origin, out, base, users) {
  const [admin, teacher, student] = users;
  const finance = { username: 'example-finance', display_name: '示例财务', account_type: 'finance' };
  const results = [];
  const records = ['测试', '加工', '维修', '采购'].flatMap((type, t) =>
    ['待教师审核', type === '采购' ? '待入库' : '已通过', '已完成', '已完成'].map((status, i) => ({
      _id: 500 + t * 10 + i, public_id: `QA-KEY-${t}-${i}`, request_type: type === '采购' ? undefined : type,
      work_content: '示例' + type, material_name: '示例材料', status,
      applicant_username: student.username, applicant_name: student.display_name,
      review_teacher_username: teacher.username, review_teacher_name: teacher.display_name,
      cost_test: 1250000.88, cost_processing: 1250000.88, cost_repair: 1250000.88,
      estimated_price: 1250000.88, actual_total_price: 1250000.88,
      quantity: 3, unit: '瓶', workload_quantity: 3, workload_unit: '次',
      settlement_status: '已挂账', reimbursed: i === 3, completed_at: i >= 2 ? '2026-10-25T00:00:00Z' : undefined,
      created_at: '2026-10-25T00:00:00Z', updated_at: 'key-information',
    })));
  for (const width of [320, 390, 768, 1366, 1920, 2560]) for (const user of [student, teacher, finance, admin]) {
    const account = { ...user, profile_required: false, session_token: 'isolated-key-information' };
    const data = { ...base, current_account: account,
      accounts: [...base.accounts, { ...student, _id: 901, id: 901, username: 'pending-account', status: 'pending' }],
      lab_work_requests: records.filter(row => row.request_type), lab_purchase_requests: records.filter(row => !row.request_type),
      lab_material_batches: [{ ...base.lab_material_batches[0], expiry_date: '2020-01-01', current_qty: 2, min_qty: 5 }],
    };
    const page = await browser.newPage({ viewport: { width, height: 980 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: base.lab_teacher_accounts } });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, data, revision: 'key-information' } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
    });
    async function check(selector, minimum, bold = false, singleLine = false) {
      const nodes = page.locator(selector).filter({ visible: true });
      assert(await nodes.count(), `Exercise ${selector}`);
      for (const node of await nodes.all()) {
        const size = await node.evaluate(e => ({ font: parseFloat(getComputedStyle(e).fontSize), weight: Number(getComputedStyle(e).fontWeight) }));
        assert(size.font >= minimum && (!bold || size.weight >= 650), `${width} ${account.account_type} ${selector}: ${JSON.stringify(size)}`);
        if (singleLine) await assertSingleLine(node, selector);
      }
    }
    const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} ${account.account_type} page overflow`);
    try {
      await page.goto(origin);
      await page.getByTestId('task-total').waitFor();
      await page.waitForFunction(() => document.querySelector('.platform-sync-status')?.textContent.includes('同步状态：同步完成'));
      await check('.platform-task-center .platform-task-name', 16, true);
      await check('.platform-task-center .platform-task-link > strong', 22, true, true);
      if (account.account_type === 'finance') {
        assert.equal(await page.locator('.platform-task-amount').count(), 4);
        await check('.platform-task-amount', 24, true, true);
      }
      await fits();
      if ([320, 390, 1366, 1920].includes(width)) await page.screenshot({ path: path.join(out, `key-overview-${account.account_type}-${width}.png`), fullPage: true });
      await openNavigation(page);
      const tab = account.account_type === 'student' ? '测试' : account.account_type === 'teacher' ? '测试审核' : '测试记录';
      await page.locator('.platform-nav').getByRole('button', { name: tab, exact: true }).click();
      await showModuleRecords(page);
      await page.locator('.platform-request-record').first().waitFor();
      await check('.platform-info.is-amount > div:last-child', 20, true, true);
      await check('.platform-business-amount b', 20, true, true);
      await check('.platform-badge', 14, true);
      await fits();
      if (account.account_type === 'finance' || account.account_type === 'admin') {
        await openNavigation(page);
        await page.locator('.platform-nav').getByRole('button', { name: '数据报表', exact: true }).click();
        await page.locator('.platform-business-metrics').waitFor();
        await check('.platform-data-table td[data-label="最终费用（元）"], .platform-mobile-record [data-label="最终费用（元）"] dd', 20, true, true);
        if (account.account_type === 'finance') {
          await check('.platform-reimbursement-figures dd:not(.platform-reimbursement-breakdown)', 24, true, true);
          await check('.platform-reimbursement-breakdown strong', 20, true, true);
        }
        await fits();
        if ([320, 1366].includes(width)) await page.screenshot({ path: path.join(out, `key-reports-${account.account_type}-${width}.png`), fullPage: true });
      }
      await openNavigation(page);
      await page.locator('.platform-nav').getByRole('button', { name: '库存', exact: true }).click();
      await showModuleRecords(page);
      await page.locator('.platform-inventory-metrics').waitFor();
      await check('.platform-inventory-metrics dd', 26, true, true);
      await check('.platform-warning-tags strong', 14, true);
      await fits();
      assert.deepEqual(errors, []);
      results.push({ keyInformation: true, role: account.account_type, width, overflow: false, errors });
    } finally { await page.close(); }
  }
  return results;
}
