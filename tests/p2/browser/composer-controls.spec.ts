import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/types/types.js'
const editor = (page) => page.locator('[contenteditable="true"][role="textbox"]')

test('原模型与推理菜单写入真实会话，刷新保留并影响下一次请求', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    await expect(trigger).toContainText('High')
    await trigger.press('Enter')
    await page.getByRole('slider', { name: '推理强度' }).press('End')
    await expect(trigger).toContainText('Max')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.reload()
    await expect(trigger).toContainText('Max')
    await editor(page).fill('检查推理参数')
    await editor(page).press('Enter')
    await expect.poll(() => host.model.calls.at(-1)?.reasoningEffort).toBe('max')
    await expect(
      page.getByText('已通过真实 Host 接收：检查推理参数。', { exact: true }),
    ).toBeVisible()
    await trigger.click()
    await page.getByRole('button', { name: '切换模型', exact: true }).click()
    await page.getByRole('option', { name: /无推理验收模型/ }).click()
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveText('无推理验收模型')
    await editor(page).fill('检查切换模型')
    await editor(page).press('Enter')
    await expect.poll(() => host.model.calls.at(-1)?.model).toBe('compact')
    expect(host.model.calls.at(-1)?.reasoningEffort).toBeUndefined()
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('权限菜单持久化，原输入区和模型浮层在窄屏保持可用', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    const permission = page.getByRole('button', { name: /访问模式/ })
    await permission.click()
    await page.getByRole('menuitem', { name: '工作区内修改', exact: true }).click()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    expect(
      host.runtime.ctx.permissionPresets.current(host.runtime.ctx.sessions.get(SessionId(id!))),
    ).toBe('workspace-write')
    await page.reload()
    await expect(permission).toContainText('工作区内修改')
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(editor(page)).toBeInViewport()
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await permission.click()
      const menu = page.getByRole('menu')
      await expect(menu).toBeInViewport()
      expect(
        await page
          .locator('[data-menu-material] > [class*=material]')
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toBe('rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
      const trigger = page.getByRole('button', { name: /^选择模型/ })
      await trigger.click()
      await expect(page.getByRole('dialog', { name: '模型与推理强度' })).toBeInViewport()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('上下文原投影三项近似构成，刷新不重复累计且窄屏可读', async ({ page }) => {
  const host = await fixtureHost({ contextUsage: 26100 })
  try {
    await page.goto(host.login)
    await editor(page).fill('检查上下文分类统计')
    await editor(page).press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：检查上下文分类统计。', { exact: true }),
    ).toBeVisible()
    const trigger = page.getByRole('button', { name: /上下文已用/ })
    const panel = page.getByRole('dialog', { name: '上下文已用', exact: true })
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const values = host.runtime.ctx.sessionProjections.snapshot(
      host.runtime.ctx.sessions.get(SessionId(id!)),
    ).values
    const parts = values.contextBreakdown
    await trigger.click()
    await expect(panel).toContainText('~26.1K / 1M')
    for (const [key, label] of [
      ['systemTokens', '系统提示词'],
      ['toolsTokens', '工具定义'],
      ['messageTokens', '对话消息'],
    ]) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible()
      expect(parts[key]).toBeGreaterThan(0)
    }
    const requests = host.model.calls.length
    await page.reload()
    await trigger.click()
    await expect(panel).toContainText('~26.1K / 1M')
    expect(host.model.calls.length).toBe(requests)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(panel).toBeInViewport()
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})
