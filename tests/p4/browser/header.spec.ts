import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('browser header keeps page and zoom actions as accessible icons', async ({ page }) => {
  test.skip(!process.env.P4_HEADER, 'Run only against the preserved real-site acceptance resource')
  const run = JSON.parse(readFileSync('/tmp/tianzhiai-p4-runtime.json', 'utf8')),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(run.authURL)
  await page
    .getByRole('navigation', { name: '聊天记录' })
    .getByRole('button')
    .filter({ hasText: 'P4 真实站点' })
    .first()
    .click()
  const header = page.locator('.tz-browser-pages')
  await expect(header).toBeVisible()
  await expect(header.locator('button')).toHaveCount(3)
  await expect(header).not.toContainText('100%')
  await expect(header).not.toContainText('italotreno.com')
  expect((await header.innerText()).trim()).toBe('')
  await expect(page.getByText('Ego 原生人控', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '页面', exact: true }).click()
  await expect(
    page.getByRole('menuitem').filter({ hasText: 'Sito Ufficiale Italo Treno' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await header.screenshot({ path: 'reports/p4/header-current.png' })
  expect(errors).toEqual([])
})
