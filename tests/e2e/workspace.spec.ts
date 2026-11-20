import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function waitForLedger(page: Page) {
  await expect(page.getByTestId('source-total')).toHaveText('300')
  await expect(page.getByTestId('joined-total')).toHaveText('300')
}

test('follows exact record evidence and compares shipment rules', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto('./')
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'none'")
  await waitForLedger(page)
  await page.getByRole('button', { name: 'Trace the payments' }).press('Enter')
  await expect(page.getByRole('heading', { name: /O-17/ })).toBeVisible()
  await expect(page.getByText(/supplies 2 matches/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Trace the payments' })).toBeFocused()
  await page.getByRole('button', { name: 'Compare a scenario' }).click()
  await page.getByLabel('Use distinct keys').selectOption('B')
  await expect(page.getByTestId('scenario-total')).toHaveText('180')
  await page.getByLabel('Parcels inclusion').selectOption('left')
  await expect(page.getByTestId('scenario-total')).toHaveText('300')
  await expect(page.getByTestId('scenario-total')).toBeVisible()
  expect(errors).toEqual([])
})

test('investigates unfamiliar file and paste inputs without transmitting data', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url() + ' ' + (request.postData() ?? '')))
  await page.goto('./')
  await waitForLedger(page)
  await page.getByRole('button', { name: 'Use my tables' }).click()
  await page.getByLabel('Parent file').setInputFiles({
    name: 'marker-filename-781.csv', mimeType: 'text/csv',
    buffer: Buffer.from('marker-header-781\nmarker-key-781\nother\n'),
  })
  await page.getByLabel('Parent key').selectOption('0')
  const detail = page.getByLabel('Paste child a data', { exact: false })
  await detail.fill('key,usd,notes\nmarker-key-781,41,marker-value-781\nother,5,example\n')
  await page.getByRole('button', { name: /load child a paste/i }).click()
  await page.getByLabel('Child A key').selectOption('0')
  await page.getByLabel('Child A join rule').selectOption('inner')
  await page.getByLabel('Paste child b data', { exact: false }).fill('key,parcel\nmarker-key-781,x\nmarker-key-781,y')
  await page.getByRole('button', { name: /load child b paste/i }).click()
  await page.getByLabel('Child B key').selectOption('0')
  await page.getByLabel('Child B join rule').selectOption('inner')
  await page.getByLabel('Amount column').selectOption('A:1')
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.getByTestId('source-total')).toHaveText('46')
  await expect(page.getByTestId('joined-total')).toHaveText('82')
  await page.getByRole('button', { name: 'Preview report' }).click()
  const preview = page.getByRole('textbox', { name: 'Markdown preview' })
  await expect(preview).toHaveValue(/1 repeated, 1 excluded/)
  const redacted = await preview.inputValue()
  expect(redacted).not.toMatch(/marker-|\b82\b/)
  await page.getByRole('checkbox', { name: 'Amounts and unit' }).check()
  await expect(preview).toHaveValue(/SQL SUM, joined: 82/)
  await page.getByRole('checkbox', { name: 'Source keys' }).check()
  await expect(preview).toHaveValue(/marker-key-781/)
  const transfer = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown' }).click()
  expect((await transfer).suggestedFilename()).toBe('join-ledger-report.md')
  expect(requests.join('\n')).not.toMatch(/marker-/)
  expect(page.url()).not.toMatch(/marker-/)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await waitForLedger(page)
})

test('keeps the last result available when an invalid import is reverted', async ({ page }) => {
  await page.goto('./')
  await waitForLedger(page)
  await page.getByRole('button', { name: 'Use my tables' }).click()
  await page.getByLabel('Paste parent data').fill('a,a\n1,2')
  await page.getByRole('button', { name: 'Load parent paste' }).click()
  await expect(page.getByRole('alert')).toContainText('distinct name')
  await expect(page.getByTestId('joined-total')).toHaveText('300')
  await expect(page.getByRole('button', { name: 'Preview report' })).toBeDisabled()
  await page.getByRole('button', { name: 'Revert edits' }).click()
  await expect(page.getByRole('button', { name: 'Preview report' })).toBeEnabled()
})

test('opens a shared scenario and passes an automated accessibility scan', async ({ page }, info) => {
  await page.goto('./#example=payments&scenario=shipped')
  await waitForLedger(page)
  await expect(page.getByTestId('scenario-total')).toHaveText('180')
  if (info.project.name === 'chromium' || info.project.name === 'mobile') {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(result.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([])
  }
})

test('the 320px investigation has no page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('./')
  await waitForLedger(page)
  await page.getByRole('button', { name: 'Trace the payments' }).click()
  await expect(page.getByRole('heading', { name: /O-17/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
