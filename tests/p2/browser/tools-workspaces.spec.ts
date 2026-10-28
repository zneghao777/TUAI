import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/types/types.js'

async function showMenu(page) {
  await page
    .locator('[aria-current="page"][data-session-id]')
    .locator('..')
    .getByRole('button', { name: /的会话操作/ })
    .click()
}
test('TZ-064 original Session menu, managed directories, archive/restore and left settings', async ({
  page,
}) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(host.login)
    const input = page.getByRole('textbox', { name: '消息', exact: true })
    await expect(input).toBeVisible()
    await expect(page.getByRole('heading', { name: '新会话', exact: true })).toBeVisible()
    await expect(
      page.locator('header').getByRole('button', { name: '重命名', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: '连接与工作区', exact: true })).toHaveCount(0)
    await expect(page.getByText(/已连接/)).toHaveCount(0)
    await showMenu(page)
    await expect(page.getByRole('menuitem', { name: '复制 Session ID' })).toBeVisible()
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    await page.getByRole('textbox', { name: '会话名称' }).fill('工具与工作区验收')
    await page.getByRole('dialog').getByRole('button', { name: '重命名', exact: true }).click()
    await expect(page.getByRole('heading', { name: '工具与工作区验收', exact: true })).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    await showMenu(page)
    await page.getByRole('menuitem', { name: '置顶会话' }).click()
    await expect(page.getByLabel('已置顶')).toBeVisible()
    await showMenu(page)
    await page.screenshot({ path: 'reports/p2/064-session-menu.png' })
    await page.getByRole('menuitem', { name: '归档会话' }).click()
    await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0)
    await page.getByRole('button', { name: '已归档', exact: true }).click()
    const archived = page.locator(`[data-session-id="${id}"]`).locator('..')
    await archived.getByRole('button', { name: /的会话操作/ }).click()
    await page.getByRole('menuitem', { name: /恢复|取消归档/ }).click()
    await page.getByRole('button', { name: '返回会话' }).click()
    await page.locator(`[data-session-id="${id}"]`).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '对话显示', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    await expect(page.getByText('用量统计', { exact: false })).toHaveCount(0)
    await page.getByRole('button', { name: '标准', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '详细', exact: true })).toBeVisible()
    await page.screenshot({ path: 'reports/p2/064-settings-menu.png' })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('heading', { name: '工具与工作区验收', exact: true })).toBeVisible()
    const dirs = host.runtime.ctx.sessions.list().map((session) => session.header.cwd)
    expect(new Set(dirs).size).toBe(dirs.length)
    expect(errors).toEqual([])
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('TZ-064 real tool results use original diff/read/search/todo/terminal/error views', async ({
  page,
}) => {
  const host = await fixtureHost()
  try {
    await host.runtime.ctx.settingsController.update(
      'ui-chat',
      { transcriptView: 'verbose' },
      undefined,
    )
    await page.goto(host.login)
    await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    host.runtime.ctx.permissionPresets.set(agent.session, 'workspace-write')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('TZ064 展示工具结果')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.getByText('TZ064 工具执行验收完成。', { exact: true })).toBeVisible()
    const events = agent.session.snapshotEvents().filter((event) => event.type === 'tool/result')
    expect(events).toHaveLength(7)
    expect(events.filter((event) => !event.data.message.isError)).toHaveLength(6)
    for (const name of ['write', 'edit', 'read', 'grep', 'todo_write'])
      await expect(page.locator(`[data-tool="${name}"]`).first()).toBeVisible()
    await expect(page.locator('[data-sample="bash"][data-state="ok"]')).toBeVisible()
    await expect(page.locator('[data-tool="web_fetch"][data-state="error"]')).toBeVisible()
    await page.locator('[data-tool="edit"] [data-disclosure-row]').first().click()
    await page.screenshot({ path: 'reports/p2/064-tool-views.png' })
    await page.reload()
    await expect(page.locator('[data-tool="edit"]')).toBeVisible()
  } finally {
    await page.close()
    await host.dispose()
  }
})

test('TZ-064 original fork and stop-before-archive confirmation', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const input = page.getByRole('textbox', { name: '消息', exact: true })
    await input.fill('分叉验收消息')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.locator('[data-turn-process]')).toBeVisible()
    const original = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    await showMenu(page)
    await page.getByRole('menuitem', { name: '分叉会话', exact: true }).click()
    await expect(page.locator('[data-session-id]')).toHaveCount(2)
    const child = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    expect(child).not.toBe(original)
    expect(host.runtime.ctx.sessions.get(SessionId(child!)).header.cwd).toBe(
      host.runtime.ctx.sessions.get(SessionId(original!)).header.cwd,
    )
    await input.fill('持续运行')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.getByRole('button', { name: '停止当前执行' })).toBeVisible()
    await showMenu(page)
    await page.getByRole('menuitem', { name: '归档会话', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '停止并归档此会话？' })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('button', { name: '停止当前执行' })).toBeVisible()
    await showMenu(page)
    await page.getByRole('menuitem', { name: '归档会话', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '停止并归档', exact: true }).click()
    await expect(page.locator(`[data-session-id="${child}"]`)).toHaveCount(0)
    await expect
      .poll(() => host.runtime.ctx.agents.get(SessionId(child!))?.running ?? false)
      .toBe(false)
    expect(host.runtime.ctx.workspaceRegistry.archivedSessionIds).toContain(child)
  } finally {
    host.model.continueRuns()
    await page.close()
    await host.dispose()
  }
})
