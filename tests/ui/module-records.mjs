// Normal-record regression cases leave the task queue before checking forms and filters.
export async function showModuleRecords(page) {
  const queue = page.getByRole('region', { name: '当前待办筛选', exact: true });
  if (!await queue.count()) return;
  await queue.getByRole('button', { name: '查看本模块全部记录', exact: true }).click();
  const account = await page.evaluate(() => JSON.parse(sessionStorage.getItem('surface_lab_account') || 'null'));
  const scope = page.getByPlaceholder('搜索或选择查看范围');
  if (await scope.count() && ['student', 'teacher'].includes(account?.account_type)) {
    const label = account.account_type === 'teacher' && account.default_view_scope === 'all' ? '全部' : '本人';
    await scope.fill(label);
    await page.getByRole('option', { name: label, exact: true }).click();
  }
}
