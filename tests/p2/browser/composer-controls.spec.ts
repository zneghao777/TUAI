import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/types/types.js'

test('推理滑块和模型选择写入真实会话，刷新保留并影响下一次模型请求', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    const trigger = page.getByRole('button', { name: '模型与推理强度', exact: true })
    await expect(trigger).toContainText('P2 受控验收模型')
    await expect(trigger).toContainText('高')
    await trigger.press('Enter')
    const panel = page.getByRole('dialog', { name: '模型与推理强度', exact: true })
    const slider = panel.getByRole('slider', { name: '推理强度' })
    await expect(panel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: '切换模型', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(slider).toBeFocused()
    await slider.press('End')
    await expect(slider).toHaveAttribute('aria-valuetext', '极高')
    await expect(slider).toBeEnabled()
    await slider.press('Escape')
    await expect(trigger).toBeFocused()
    await page.reload()
    await expect(trigger).toContainText('极高')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('检查推理参数')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(() => host.model.calls.at(-1)?.reasoningEffort).toBe('max')
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
    await trigger.click()
    await panel.getByRole('button', { name: '恢复默认推理强度' }).click()
    await expect(slider).toHaveAttribute('aria-valuetext', '高')
    await expect(slider).toBeEnabled()
    await panel.getByRole('button', { name: '切换模型', exact: true }).click()
    await panel.getByRole('option', { name: /无推理验收模型/ }).click()
    await expect(slider).toHaveCount(0)
    await expect(panel).toBeFocused()
    await expect(panel.getByRole('button', { name: '切换模型', exact: true })).toHaveText(
      '无推理验收模型',
    )
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toHaveText('无推理验收模型')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('检查切换模型')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(() => host.model.calls.at(-1)?.model).toBe('compact')
    expect(host.model.calls.at(-1)?.reasoningEffort).toBeUndefined()
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '上下文用量', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '上下文用量', exact: true })).toContainText(
      '/ 1M',
    )
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('权限菜单遵循会话命令，输入布局与浮层在窄屏和键盘操作下保持可用', async ({ page }) => {
  const host = await fixtureHost({ composerControls: true })
  try {
    await page.goto(host.login)
    const permission = page.getByRole('combobox', { name: '权限', exact: true })
    await expect(permission).toContainText('仅可查看')
    await permission.click()
    const permissionBounds = await page
      .getByRole('listbox', { name: '权限', exact: true })
      .locator('..')
      .boundingBox()
    expect(permissionBounds!.width).toBe(250)
    expect(permissionBounds!.height).toBeLessThanOrEqual(155)
    await page.getByRole('option', { name: /工作区内修改/ }).click()
    await expect(permission).toContainText('工作区内修改')
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    expect(host.runtime.ctx.permissionPresets.current(agent.session)).toBe('workspace-write')
    await page.reload()
    await expect(permission).toContainText('工作区内修改')
    await permission.click()
    await page.getByRole('option', { name: /仅可查看/ }).click()
    await expect(permission).toContainText('仅可查看')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('审批拒绝')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.getByRole('region', { name: '操作审批' })).toBeVisible()
    // The simplified send surface does not remove the running control path.
    await expect(page.getByRole('button', { name: '停止当前执行', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '拒绝', exact: true }).click()
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
    const fade = page.locator('[data-composer-fade]')
    expect(await fade.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('blur(8px)')
    expect(await fade.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
    expect(
      (await page.locator('[data-composer-surface]').boundingBox())!.y -
        ((await fade.boundingBox())!.y + (await fade.boundingBox())!.height),
    ).toBeLessThanOrEqual(2)
    const input = page.getByRole('textbox', { name: '消息', exact: true })
    expect(await input.evaluate((el) => getComputedStyle(el).resize)).toBe('none')
    await expect(page.locator('[data-width-handle]')).toHaveCount(0)
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const surface = page.locator('[data-composer-surface]')
      expect((await surface.boundingBox())!.height).toBeLessThan(100)
      expect(await surface.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
      const trigger = page.getByRole('button', { name: '模型与推理强度', exact: true })
      await expect(trigger).toContainText('P2 受控验收模型')
      const context = await page
        .getByRole('button', { name: '上下文用量', exact: true })
        .boundingBox()
      const model = await trigger.boundingBox()
      expect(context!.x + context!.width).toBeLessThanOrEqual(model!.x)
      expect(model!.x - context!.x - context!.width).toBeLessThanOrEqual(5)
      await trigger.click()
      const panel = page.getByRole('dialog', { name: '模型与推理强度', exact: true })
      await expect(panel).toBeInViewport()
      const slider = panel.getByRole('slider', { name: '推理强度' })
      expect(await slider.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        'rgba(0, 0, 0, 0)',
      )
      await slider.press('Escape')
      await expect(trigger).toBeFocused()
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('上下文浮层使用真实投影的总量与三项近似构成，刷新后继续展示', async ({ page }) => {
  const host = await fixtureHost({ contextUsage: 26100 })
  try {
    await page.goto(host.login)
    const trigger = page.getByRole('button', { name: '上下文用量', exact: true })
    const panel = page.getByRole('dialog', { name: '上下文用量', exact: true })
    await trigger.click()
    await expect(panel).toContainText('暂未收到用量数据')
    await expect(panel.locator('[data-context-part]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('检查上下文分类统计')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(
      page.getByText('已通过真实 Host 接收：检查上下文分类统计。', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    const values = host.runtime.ctx.sessionProjections.snapshot(agent.session).values
    const pressure = values.contextPressure
    const parts = values.contextBreakdown
    const percent = Math.round(
      ((pressure.projectedTokens ?? pressure.pressureTokens) / pressure.contextWindow) * 100,
    )
    const compact = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })
    await trigger.click()
    await expect(trigger).toContainText(`${percent}%`)
    await expect(panel).toContainText('~26.1K / 1M')
    for (const [key, label] of [
      ['systemTokens', '系统提示词'],
      ['toolsTokens', '工具定义'],
      ['messageTokens', '对话消息'],
    ]) {
      const row = panel.locator(`[data-context-part=${key}]`)
      await expect(row.locator('dt')).toHaveText(label)
      await expect(row.locator('dd')).toHaveText(`~${compact.format(parts[key])}`)
      expect(parts[key]).toBeGreaterThan(0)
    }
    const colored = panel.locator('i')
    await expect(colored).toHaveCount(3)
    const segments = await colored.evaluateAll((elements) =>
      elements.map((el) => ({
        width: parseFloat(el.style.width),
        color: getComputedStyle(el).backgroundColor,
      })),
    )
    expect(segments.reduce((total, part) => total + part.width, 0)).toBeCloseTo(percent, 4)
    expect(new Set(segments.map((part) => part.color)).size).toBe(3)
    const requests = host.model.calls.length
    await page.reload()
    await trigger.click()
    await expect(panel).toContainText('~26.1K / 1M')
    expect(host.model.calls.length).toBe(requests)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(panel).toBeInViewport()
      expect((await panel.boundingBox())!.width).toBe(264)
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})
