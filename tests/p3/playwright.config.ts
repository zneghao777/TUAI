import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'browser',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'reports/p3/playwright.json' }]],
  outputDir: '../../reports/p3/browser',
  use: {
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
