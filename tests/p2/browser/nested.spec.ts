import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
test('实际 Host PTC 调度的父子工具记录可逐层展开', async ({ page }) => {
  const host = await fixtureHost({ nested: true })
  try {
    await host.runtime.ctx.settingsController.update(
      'ui-chat',
      { transcriptView: 'verbose' },
      undefined,
    )
    await page.goto(host.login)
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('嵌套工具验收')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    const outer = page
      .locator('[data-tool="run_code"][data-state="ok"] [data-disclosure-row][aria-expanded]')
      .first()
    await expect(outer).toBeVisible()
    if ((await outer.getAttribute('aria-expanded')) === 'false') await outer.click()
    const child = page
      .locator('[data-tool="sum_numbers"][data-state="ok"] [data-disclosure-row][aria-expanded]')
      .first()
    await expect(child).toBeVisible()
    if ((await child.getAttribute('aria-expanded')) === 'false') await child.click()
    await expect(
      page.locator('[data-tool="sum_numbers"]').getByText('42', { exact: true }),
    ).toBeVisible()
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
