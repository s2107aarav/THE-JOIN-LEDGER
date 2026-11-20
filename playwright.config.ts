import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: process.env.LEDGER_TEST_URL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.LEDGER_TEST_URL ? undefined : {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: {
      executablePath: process.env.LEDGER_CHROMIUM_PATH,
    } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13 Mini'] } },
  ],
})
