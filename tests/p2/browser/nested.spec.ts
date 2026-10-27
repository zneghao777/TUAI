import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
test('实际 Host PTC 调度的父子工具记录可逐层展开', async ({ page }) => {
  const host = await fixtureHost({ nested: true })
  try {
    await page.goto(host.login)
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('嵌套工具验收')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    const outer = page.getByRole('button', { name: /run_code.*已完成/ })
    await expect(outer).toBeVisible()
    await outer.click()
    const child = page.getByRole('button', { name: /sum_numbers.*已完成/ })
    await expect(child).toBeVisible()
    await child.click()
    await expect(page.locator('pre').filter({ hasText: /^42$/ }).last()).toBeVisible()
    const events = host.runtime.ctx.sessions.list().flatMap((s) => s.snapshotEvents())
    expect(
      events.filter(
        (e) => e.type === 'tool/ptc-dispatch' && e.data.name === 'sum_numbers' && !e.data.isError,
      ),
    ).toHaveLength(1)
    await page.screenshot({ path: 'reports/p2/09-嵌套工具.png' })
  } finally {
    await page.close()
    await host.dispose()
  }
})
