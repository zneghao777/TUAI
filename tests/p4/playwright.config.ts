import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'browser',
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'reports/p4/playwright.json' }]],
  outputDir: '../../reports/p4/browser',
  use: {
    channel: 'chrome',
    viewport: { width: 1600, height: 1050 },
    trace: process.env.P4_TRACE ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
})
