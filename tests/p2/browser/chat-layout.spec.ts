import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/types/types.js'

test('代码高亮生效，窄屏宽表格可滚动到最后一列', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    await page
      .locator('[contenteditable="true"][role="textbox"]')
      .fill(
        '排版核对\n\n```typescript\nconst result = 42;\n```\n\n| 文件 | 状态 | 类型 | 说明 |\n| --- | --- | --- | --- |\n| report.md | 完成 | 文档 | 最后一列可读 |',
      )
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    const reply = page
      .locator('[data-chat-flow-kind=assistant-step][data-chat-group-part=response]')
      .last()
    const code = reply.locator('pre.shiki')
    await expect(code).toBeVisible()
    const keyword = code.locator('[style*="--shiki-token-keyword"]').first()
    await expect(keyword).toBeVisible()
    expect(await keyword.evaluate((el) => getComputedStyle(el).color)).not.toBe(
      await code.evaluate((el) => getComputedStyle(el).color),
    )
    await page.setViewportSize({ width: 320, height: 844 })
    const table = reply.locator('.md-table-wide')
    await table.scrollIntoViewIfNeeded()
    await table.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    await expect(table.getByRole('cell', { name: '最后一列可读' })).toBeInViewport()
    expect(await table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('输入框随草稿增高和恢复，成功后收起且不堆积说明', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await expect(input).toBeVisible()
    const initialHeight = (await input.boundingBox())!.height
    const text = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 行：检查长消息的输入布局`).join(
      '\n',
    )
    await input.fill(text)
    expect((await input.boundingBox())!.height).toBeGreaterThan(initialHeight)
    expect(
      await input.evaluate((el) => {
        const scroll = el.closest('[class*=scroll_]')
        return scroll?.clientHeight ?? 0
      }),
    ).toBeLessThanOrEqual(336)
    await page.reload()
    await expect(input).toHaveText(text, { useInnerText: true })
    expect((await input.boundingBox())!.height).toBeGreaterThan(initialHeight)
    await input.fill('清晰简洁的对话输入')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(input).toHaveText('')
    await expect(page.getByText('已通过真实 Host 接收：清晰简洁的对话输入。')).toBeVisible()
    expect((await input.boundingBox())!.height).toBeLessThanOrEqual(initialHeight)
    await expect(page.locator('[data-composer] [role=status]')).toHaveCount(0)
    for (const width of [820, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const surface = page.locator('[data-composer-card]')
      expect((await surface.boundingBox())!.height).toBeLessThan(170)
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
      expect(await surface.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('真实工具的代码字体、复制换行入口与窄屏详情保持完整', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await host.runtime.ctx.settingsController.update(
      'ui-chat',
      { transcriptView: 'verbose' },
      undefined,
    )
    await page.goto(host.login)
    const selected = page.locator('[data-session-id][aria-current=page]')
    await expect(selected).toBeVisible()
    const id = await selected.getAttribute('data-session-id')
    host.runtime.ctx.permissionPresets.set(
      host.runtime.ctx.agents.get(SessionId(id!)).session,
      'workspace-write',
    )
    await page.locator('[contenteditable="true"][role="textbox"]').fill('TZ064 核对工具布局')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.getByText('TZ064 工具执行验收完成。', { exact: true })).toBeVisible()
    const tool = page.locator('[data-tool=read]')
    await tool.locator('[data-disclosure-row]').click()
    const card = tool.locator('[data-code-wrap]')
    await expect(card).toBeVisible()
    const typography = await card.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        family: style.fontFamily,
        size: parseFloat(style.fontSize),
        token: style.getPropertyValue('--dsw-font-markdown-code-block'),
      }
    })
    expect(typography.token.trim()).not.toBe('')
    expect(typography.family).toMatch(/Mono|Menlo|Consolas/)
    expect(typography.size).toBeGreaterThanOrEqual(12)
    const wrap = card.getByRole('button', { name: /换行/ })
    const before = await card.getAttribute('data-code-wrap')
    await wrap.click()
    await expect(card).not.toHaveAttribute('data-code-wrap', before!)
    await expect(card.getByRole('button', { name: /复制/ })).toBeVisible()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await card.scrollIntoViewIfNeeded()
      const box = (await card.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const failed = page.locator('[data-tool=web_fetch][data-state=error]')
    await failed.locator('[data-disclosure-row]').click()
    await expect(failed).toContainText('fetch failed')
  } finally {
    await page.close()
    await host.dispose()
  }
})
