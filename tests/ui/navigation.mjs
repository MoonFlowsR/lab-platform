// Navigate through the same mobile drawer a user opens; desktop keeps its sidebar visible.
export async function openNavigation(page) {
  await page.locator('.platform-nav').waitFor({ state: 'attached' });
  const button = page.getByRole('button', { name: '打开模块导航', exact: true });
  if (await button.isVisible() && await button.getAttribute('aria-expanded') !== 'true') {
    await button.click();
    await page.locator('.workspace-sidebar.is-open').waitFor();
  }
}
