import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/p2/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'reports/p2/playwright.json' }]],
  outputDir: 'reports/p2/browser',
  use: {
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
