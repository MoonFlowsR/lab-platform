import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readWorkbookText } from './workbook.mjs';

async function assertMetrics(page, label, total, low, expiring, expired) {
  const metrics = page.getByRole('region', { name: label, exact: true });
  await metrics.waitFor();
  assert.match(await metrics.locator('.platform-inventory-heading').innerText(), new RegExp(`${total} 个批次`));
  const expected = [['低库存', low, '组'], ['临期 · 30天内', expiring, '批'], ['已过期', expired, '批']];
  for (const [name, value, unit] of expected) {
    const metric = metrics.locator('dt').filter({ hasText: name }).locator('..');
    assert.equal((await metric.locator('dd').innerText()).replace(/\s+/gu, ''), `${value}${unit}`);
  }
}

// All API calls are intercepted; stock changes below replace only the synthetic snapshot.
export async function checkLowStock(browser, origin, out, base, users) {
  const results = [], student = users.find(user => user.account_type === 'student');
  const other = base.lab_student_accounts.find(user => user.username !== student.username);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  for (const width of [1440, 390, 320]) for (const user of users) {
    const account = { ...user, profile_required: false, session_token: 'synthetic-low-stock' };
    const template = base.lab_material_batches[0];
    const batch = (id, overrides = {}) => ({ ...template, _id: id, public_id: `QA-LOW-${id}`, batch_code: `QA-LOW-${id}`,
      material_id: 800, material_name: '跨房间汇总材料', spec: 'Mn-200', unit: 'g', current_qty: 0, min_qty: 5,
      storage_room: '105', storage_detail: '示例柜', storage_location: '105 · 示例柜', expiry_date: '长期',
      purchase_category: '试剂原料', purchaser_username: student.username, purchaser_name: student.display_name,
      created_by_username: student.username, created_at: '2026-10-01T02:00:00Z', ...overrides });
    let batches = [
      batch(801, { batch_code: 'QA-HEALTHY-EMPTY', expiry_date: '2020-01-01' }),
      batch(802, { current_qty: 8, min_qty: 3, storage_room: '205', storage_location: '205 · 示例柜',
        purchaser_username: other.username, purchaser_name: other.display_name, created_by_username: other.username, created_at: '2026-10-20T02:00:00Z' }),
      batch(803, { unit: 'mg', current_qty: 1, min_qty: 2, created_at: '2026-10-20T02:00:00Z' }),
      batch(804, { material_id: 810, material_name: '组合预警材料', spec: '无', unit: '盒', current_qty: 1, min_qty: 5, expiry_date: '2020-01-01' }),
      batch(805, { material_id: 810, material_name: '组合预警材料', spec: '无', unit: '盒', current_qty: 2, min_qty: 4,
        storage_room: '205', storage_location: '205 · 示例柜', purchaser_username: other.username, purchaser_name: other.display_name,
        created_by_username: other.username, created_at: '2026-10-20T02:00:00Z' }),
      batch(806, { material_id: 820, material_name: '临期逐批对照材料', current_qty: 2, min_qty: 0, expiry_date: today, created_at: '2026-10-20T02:00:00Z' }),
      batch(807, { spec: 'Mn-400', current_qty: 4, min_qty: 0, purchase_category: '耗材', created_at: '2026-10-20T02:00:00Z' }),
    ];
    const materials = [{ _id: 800, name_cn: '跨房间汇总材料' }, { _id: 810, name_cn: '组合预警材料' }, { _id: 820, name_cn: '临期逐批对照材料' }];
    const page = await browser.newPage({ viewport: { width, height: 960 }, acceptDownloads: true }), errors = [], writes = [];
    let revision = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('surface_lab_account', JSON.stringify(value)), account);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: base.lab_teacher_accounts } });
      if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      if (url.pathname === '/api/ops/listAll') return route.fulfill({ json: { ok: true, revision: 'low-stock-' + revision, data: {
        ...base, current_account: account, lab_work_requests: [], lab_purchase_requests: [], lab_stock_transactions: [],
        lab_stock_out_requests: [], lab_review_logs: [], lab_attachments: [], lab_user_hidden_records: [], lab_materials: materials, lab_material_batches: batches,
      } } });
      writes.push(url.pathname);
      return route.fulfill({ status: 400, json: { ok: false, message: '此只读库存测试禁止提交。' } });
    });
    try {
      await page.goto(origin);
      await page.waitForFunction(() => document.querySelector('.platform-sync-status')?.textContent.includes('同步状态：同步完成'));
      assert.match(await page.locator('[data-task="inventory-low"]').innerText(), /2\s*组/);
      assert.match(await page.locator('[data-task="inventory-expired"]').innerText(), /1\s*批/);
      assert.match(await page.locator('[data-task="inventory-expiring"]').innerText(), /1\s*批/);
      await page.locator('[data-task="inventory-low"]').click();
      await page.getByRole('region', { name: '当前待办筛选', exact: true }).waitFor();
      assert.match(await page.getByRole('region', { name: '当前待办筛选', exact: true }).innerText(), /低库存\s*2\s*组/);
      await assertMetrics(page, '当前筛选库存', 3, 2, 0, 1);
      const warnings = page.getByRole('region', { name: '库存预警明细', exact: true });
      assert.match(await warnings.innerText(), /同组总库存/);
      assert.match(await warnings.innerText(), /3\s*盒/);
      assert.match(await warnings.innerText(), /5\s*盒/);
      await page.getByRole('button', { name: '查看本模块全部记录', exact: true }).click();
      const search = page.getByRole('searchbox', { name: '搜索记录', exact: true });
      await search.fill('QA-HEALTHY-EMPTY');
      await assertMetrics(page, '当前筛选库存', 1, 0, 0, 0);
      assert.match(await warnings.innerText(), /暂无低库存/);
      await search.fill('');
      const panel = page.locator(account.account_type === 'student' ? '.platform-module-filters' : '.platform-filter-panel');
      const toggle = panel.getByRole('button', { name: '展开筛选', exact: true });
      if (await toggle.isVisible()) await toggle.click();
      await panel.getByRole('combobox', { name: '建库日期', exact: true }).selectOption('custom');
      await panel.locator('label').filter({ hasText: /^开始日期/ }).locator('input[type="date"]').fill('2026-10-01');
      await panel.locator('label').filter({ hasText: /^结束日期/ }).locator('input[type="date"]').fill('2026-10-01');
      await assertMetrics(page, '当前筛选库存', 2, 1, 0, 1);
      await panel.getByRole('button', { name: account.account_type === 'student' ? '重置时间' : '重置筛选', exact: true }).click();
      await panel.getByRole('combobox', { name: '材料类别', exact: true }).selectOption('耗材');
      await assertMetrics(page, '当前筛选库存', 1, 0, 0, 0);
      await panel.getByRole('combobox', { name: '材料类别', exact: true }).selectOption('');
      await search.fill('低库存');
      await assertMetrics(page, '当前筛选库存', 3, 2, 0, 1);
      const stock = page.locator('main > section').filter({ has: page.getByRole('heading', { name: '材料批次库存', exact: true }) });
      const download = page.waitForEvent('download');
      await stock.getByRole('button', { name: /导出.*Excel/ }).click();
      const workbook = await readWorkbookText(await (await download).path());
      for (const id of [803, 804, 805]) assert(workbook.includes(`QA-LOW-${id}`));
      assert(!workbook.includes('QA-HEALTHY-EMPTY') && !workbook.includes('QA-LOW-802'), 'Search/export must not treat the empty healthy batch as low stock');
      await page.screenshot({ path: path.join(out, `low-stock-${account.account_type}-${width}.png`), fullPage: true });
      batches = batches.map(row => row._id === 802 ? { ...row, current_qty: 0, updated_at: new Date().toISOString() } : row);
      revision++;
      await page.getByRole('button', { name: '手动同步', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.platform-inventory-metrics dd')?.textContent.replace(/\s+/gu, '') === '3组');
      await assertMetrics(page, '当前筛选库存', 5, 3, 0, 1);
      await page.locator('.platform-task-entry').click();
      assert.match(await page.locator('[data-task="inventory-low"]').innerText(), /3\s*组/);
      if (account.account_type !== 'student') {
        await page.getByRole('button', { name: '统计与导出', exact: true }).click();
        await page.getByRole('heading', { name: '数据报表', exact: true }).waitFor();
        await search.fill('QA-HEALTHY-EMPTY');
        await assertMetrics(page, '相关库存', 1, 1, 0, 0);
        const report = page.waitForEvent('download');
        await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
        const reportText = await readWorkbookText(await (await report).path());
        assert(reportText.includes('低库存材料规格单位组') && reportText.includes('组内最高预警值'));
        const summaryRow = reportText.match(/<row\b[^>]*>[\s\S]*?<\/row>/g).find(row => row.includes('低库存材料规格单位组'));
        assert.match(summaryRow, /<c r="B\d+"><v>1<\/v><\/c>/, 'Excel low-stock count equals the selected page count');
        assert.match(summaryRow, /<c r="C\d+" t="inlineStr"><is><t[^>]*>组<\/t><\/is><\/c>/, 'Excel counts stock groups');
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
      results.push({ lowStockAggregation: true, role: account.account_type, width, crossRoomAndOwnerTotals: true,
        maxThreshold: true, separateUnitsAndSpecifications: true, filtersKeepFullStock: true, expiryRemainsPerBatch: true,
        groupedTaskAndBatchIds: true, searchAndExportAgree: true, snapshotRefresh: true, apiMocked: true, businessWrites: 0, overflow, errors });
    } catch (error) {
      await page.screenshot({ path: path.join(out, `low-stock-failed-${account.account_type}-${width}.png`), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(out, `low-stock-failed-${account.account_type}-${width}.json`), JSON.stringify({ error: error.message, errors, writes }, null, 2));
      throw error;
    } finally { await page.close(); }
  }
  return results;
}
