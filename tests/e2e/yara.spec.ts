import { expect, test } from '@playwright/test';

test('validates and scans with the pinned YARA-X engine', async ({ page }) => {
  await page.goto('/#/yara');
  await expect(page.getByRole('heading', { level: 1, name: 'YARA Studio' })).toBeVisible();

  // The example rule compiles against the real WASM build in the tool worker.
  await page.getByRole('button', { name: /Validate rule/u }).click();
  await expect(page.getByText(/Compiled by YARA-X 1\.23\.0/u)).toBeVisible({ timeout: 60_000 });

  await page
    .locator('input[aria-label="Select local files to scan"]')
    .setInputFiles({
      name: 'powershell-sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('powershell.exe -NoProfile -enc SQBFAFgA', 'utf8'),
    });

  await page.getByRole('button', { name: /^Scan files$/u }).click();
  await expect(page.getByText('powershell-sample.txt')).toBeVisible();
  await expect(page.getByText('BlueKit_Encoded_PowerShell')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Compiled by YARA-X 1\.23\.0/u)).toBeVisible();
});
