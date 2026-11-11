import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { checkBrowserVariants } from './visual-check'
test('existing browser resource: supported themes, three languages and narrow viewport', async ({
  page,
}) => {
  test.skip(
    !process.env.P4_VISUAL_RESUME,
    'Run only against the existing controlled acceptance resource',
  )
  const run = JSON.parse(readFileSync('/tmp/tianzhiai-p4-runtime.json', 'utf8')),
    errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(run.authURL)
  await page
    .getByRole('navigation', { name: '聊天记录' })
    .getByRole('button')
    .filter({ hasText: 'P4 出行' })
    .first()
    .click()
  await expect(page.locator('.tz-browser canvas')).toBeVisible()
  await checkBrowserVariants(page)
  expect(errors).toEqual([])
})
