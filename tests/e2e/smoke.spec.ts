import { expect, test } from '@playwright/test';

test('loads the overview and opens the command palette', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/BlueKit/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();

  await page.getByRole('textbox', { name: 'Search commands' }).fill('hash');
  await expect(palette.getByRole('option').first()).toContainText(/hash/iu);

  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('runs Base64 encode end to end', async ({ page }) => {
  await page.goto('/#/tool/encoding.base64-encode');
  await expect(page.getByRole('heading', { level: 1, name: 'Base64 Encode' })).toBeVisible();

  await page.getByRole('textbox', { name: 'UTF-8 text' }).fill('BlueKit');
  await page.getByRole('button', { name: /Run tool/u }).click();

  await expect(page.locator('pre.text-output')).toContainText('Qmx1ZUtpdA==');
});

test('runs a Phase 2 encoding tool', async ({ page }) => {
  await page.goto('/#/tool/encoding.hex');
  await page.getByRole('textbox', { name: 'Text or hex' }).fill('Hi');
  await page.getByRole('button', { name: /Run tool/u }).click();
  await expect(page.locator('pre.text-output')).toContainText('48 69');
});

test('reports the capability matrix', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await expect(page.getByRole('heading', { level: 1, name: 'Diagnostics' })).toBeVisible();

  await page.getByRole('button', { name: /Run diagnostics/u }).click();
  await expect(page.getByText('Web Worker execution')).toBeVisible();
  await expect(page.getByText(/WebAssembly compile/u)).toBeVisible();
});

test('keeps planned tools non-executable', async ({ page }) => {
  await page.goto('/#/tool/encoding.xor');
  await expect(page.getByText(/planned/iu).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Run tool/u })).toHaveCount(0);
});
