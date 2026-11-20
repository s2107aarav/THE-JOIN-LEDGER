import { chromium } from '@playwright/test'
import { cpus, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'

const base = process.env.LEDGER_TEST_URL ?? 'http://127.0.0.1:4175/'
const parent = ['order,amount', ...Array.from({ length: 25_000 }, (_, i) => 'K' + i + ',' + (i === 0 ? 4 : 1))].join('\n')
const detail = ['order,event', ...Array.from({ length: 24_999 }, (_, i) => 'K' + i + ',x'), 'K0,y'].join('\n')
const browser = await chromium.launch({ executablePath: process.env.LEDGER_CHROMIUM_PATH })
const imports = []
const comparisons = []
const cold = []
function p95(values) {
  return Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1])
}
try {
  const page = await browser.newPage()
  for (let i = 0; i < 20; i++) {
    await page.goto(base)
    await page.getByTestId('joined-total').filter({ hasText: /^300$/ }).waitFor()
    await page.getByRole('button', { name: 'Use my tables' }).click()
    await page.getByLabel('Parent file').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(parent) })
    await page.getByLabel('Parent key').selectOption('0')
    await page.getByLabel('Child A file').setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(detail) })
    await page.getByLabel('Child A key').selectOption('0')
    await page.getByLabel('Child A join rule').selectOption('inner')
    await page.getByLabel('Amount column').selectOption('P:1')
    let start = performance.now()
    await page.getByRole('button', { name: 'Analyze', exact: true }).click()
    await page.getByTestId('joined-total').filter({ hasText: /^25,006$/ }).waitFor()
    await page.getByRole('button', { name: /Inspect K0$/ }).waitFor()
    imports.push(performance.now() - start)

    await page.getByRole('button', { name: 'Compare a scenario' }).click()
    start = performance.now()
    await page.getByLabel('Use distinct keys').selectOption('A')
    await page.getByTestId('scenario-total').filter({ hasText: /^25,002$/ }).waitFor()
    comparisons.push(performance.now() - start)
  }
  await page.close()
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const mobile = await context.newPage()
    const cdp = await context.newCDPSession(mobile)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 80, downloadThroughput: 4_000_000 / 8, uploadThroughput: 1_000_000 / 8,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 })
    const start = performance.now()
    await mobile.goto(base, { waitUntil: 'commit' })
    await mobile.getByRole('button', { name: 'Trace the payments' }).waitFor()
    await mobile.getByRole('button', { name: 'Trace the payments' }).click()
    await mobile.getByRole('heading', { name: /O-17/ }).waitFor()
    cold.push(Math.round(performance.now() - start))
    await context.close()
  }
  console.log(JSON.stringify({
    browser: browser.version(), host: cpus()[0]?.model, memoryGiB: Math.round(totalmem() / 2 ** 30),
    inputRows: 50_000, inputBytes: Buffer.byteLength(parent) + Buffer.byteLength(detail),
    importToLedgerP95ms: p95(imports), compareP95ms: p95(comparisons),
    coldMobile4gMs: cold, mobileProfile: '4 Mbps down, 1 Mbps up, 80 ms latency, 2× CPU slowdown',
  }, null, 2))
} finally {
  await browser.close()
}
