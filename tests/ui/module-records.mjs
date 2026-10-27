// Normal-record regression cases leave the task queue before checking forms and filters.
export async function showModuleRecords(page) {
  // A newly visited module is lazy-loaded; inspect its queue only after it mounts.
  await page.locator('main').waitFor();
  const queue = page.getByRole('region', { name: '当前待办筛选', exact: true });
  if (!await queue.count()) return;
  await queue.getByRole('button', { name: '查看本模块全部记录', exact: true }).click();
  const account = await page.evaluate(() => JSON.parse(sessionStorage.getItem('surface_lab_account') || 'null'));
  const scope = page.getByRole('combobox', { name: '查看范围', exact: true });
  if (await scope.count() && ['student', 'teacher'].includes(account?.account_type)) {
    const value = account.account_type === 'teacher' && account.default_view_scope === 'all' ? 'all' : 'mine';
    await scope.selectOption(value);
  }
}
