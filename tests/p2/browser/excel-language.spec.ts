import { expect, test } from '@playwright/test'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/index.js'

test('spreadsheet preview switches language without losing the sheet', async ({ page }) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(host.login)
    const current = page.locator('[data-session-id][aria-current=page]')
    const id = await current.getAttribute('data-session-id')
    const session = host.runtime.ctx.sessions.get(SessionId(id!))
    await copyFile(
      'apps/web/tests/fixtures/office/preview.xls',
      join(session.header.cwd, 'preview.xls'),
    )
    await page.getByRole('button', { name: '打开右侧边栏' }).click()
    await page.getByRole('button', { name: /工作区文件/ }).click()
    await page.getByText('preview.xls', { exact: true }).click()
    const preview = page.locator('[data-excel-preview]')
    await expect(preview.locator('canvas').first()).toBeVisible()
    await expect(preview).toHaveAttribute('aria-label', '表格')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await page.getByRole('button', { name: '语言: 中文' }).click()
    await page.getByRole('menuitem', { name: 'Italiano' }).click()
    await page
      .getByRole('dialog', { name: 'Impostazioni' })
      .getByRole('button', { name: 'Chiudi', exact: true })
      .click()
    await expect(preview).toHaveAttribute('aria-label', 'Foglio di calcolo')
    await expect(preview.locator('canvas').first()).toBeVisible()
    await expect(preview.getByText('Scorciatoie da tastiera', { exact: true })).toHaveCount(1)
    await expect(preview.locator('[title="Impostazioni zoom"]')).toHaveCount(1)
    await expect(preview.getByRole('button', { name: 'Riduci zoom' })).toBeVisible()
    await page.getByRole('button', { name: 'Impostazioni', exact: true }).click()
    await page.getByRole('tab', { name: 'Generale', exact: true }).click()
    await page.getByRole('button', { name: 'Lingua: Italiano' }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await page
      .getByRole('dialog', { name: 'Settings' })
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await expect(preview.locator('[title="Zoom settings"]')).toHaveCount(1)
    await expect(preview.getByText('Keyboard Shortcuts', { exact: true })).toHaveCount(1)
    await expect(preview.locator('canvas').first()).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await page.close().catch(() => {})
    await host.dispose()
  }
})
