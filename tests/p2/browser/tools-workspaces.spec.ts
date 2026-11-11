import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { SessionId } from '../../../packages/core/session/lib/types/types.js'

async function showMenu(page) {
  await page.locator('[aria-current="page"][data-session-id]').hover()
  await page
    .locator('[aria-current="page"][data-session-id]')
    .getByRole('button', { name: /^会话.*的操作/ })
    .click()
}
test('TZ-080 sends a draft from the unselected conversation state', async ({ page }, testInfo) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    await expect(page).toHaveTitle('TUAI')
    const logo = page.locator('.tz-brand-logo img').first()
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', /tuai-logo/)
    expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /tuai-logo/)
    const current = page.locator('[data-session-id][aria-current=page]')
    await expect(current).toBeVisible()
    const previousId = await current.getAttribute('data-session-id')
    const beforeBrandClick = host.runtime.ctx.sessions.list().length
    await page.locator('.tz-brand-logo').first().click()
    await page.getByText('TUAI', { exact: true }).click()
    expect(host.runtime.ctx.sessions.list()).toHaveLength(beforeBrandClick)
    await expect(current).toHaveAttribute('data-session-id', previousId!)
    await current.hover()
    await current.getByRole('button', { name: /^归档会话/ }).click()
    await expect(current).toHaveCount(0)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await expect(input).toBeVisible()
    await expect(page.getByRole('heading', { name: '今天，想一起完成什么？' })).toBeVisible()
    await expect(page.getByText('选择一个工作区开始')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^访问模式，当前：/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^选择模型，当前：/ })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('tz080-unselected-desktop.png') })
    const count = host.runtime.ctx.sessions.list().length
    await input.fill('未选择会话时直接发送')
    expect(host.runtime.ctx.sessions.list()).toHaveLength(count)
    await input.evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await expect(
      page.getByText('已通过真实 Host 接收：未选择会话时直接发送。', { exact: true }),
    ).toBeVisible()
    const nextId = await current.getAttribute('data-session-id')
    expect(nextId).not.toBe(previousId)
    expect(host.runtime.ctx.sessions.list()).toHaveLength(count + 1)
    const events = host.runtime.ctx.sessions.get(SessionId(nextId!)).snapshotEvents()
    expect(
      events.filter((event) => event.type === 'user/message' && event.data.source.kind === 'user'),
    ).toHaveLength(1)
    await expect(page.getByRole('heading', { name: '今天，想一起完成什么？' })).toBeHidden()
  } finally {
    await page.close()
    await host.dispose()
  }
})
for (const control of ['permission', 'model', 'commands'] as const) {
  test(`TZ-080 opens ${control} from an unselected conversation with its draft`, async ({
    page,
  }) => {
    const host = await fixtureHost()
    try {
      await page.goto(host.login)
      const current = page.locator('[data-session-id][aria-current=page]')
      await expect(current).toBeVisible()
      await current.hover()
      await current.getByRole('button', { name: /^归档会话/ }).click()
      await expect(current).toHaveCount(0)
      const input = page.locator('[contenteditable="true"][role="textbox"]')
      await input.fill('设置前的草稿')
      const button = page.getByRole('button', {
        name:
          control === 'permission'
            ? /^访问模式，当前：/
            : control === 'model'
              ? /^选择模型，当前：/
              : '添加文件或调用指令',
      })
      await button.click()
      await expect(current).toBeVisible()
      await expect(input).toHaveText('设置前的草稿')
      if (control === 'permission')
        await expect(page.getByRole('menuitem', { name: '完全权限' })).toBeVisible()
      else if (control === 'model')
        await expect(page.getByRole('dialog', { name: '模型与推理强度' })).toBeVisible()
      else await expect(page.getByRole('listbox', { name: '触发候选建议' })).toBeVisible()
    } finally {
      await page.close()
      await host.dispose()
    }
  })
}
test('TZ-080 keeps the draft when session creation fails', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const current = page.locator('[data-session-id][aria-current=page]')
    await expect(current).toBeVisible()
    await current.hover()
    await current.getByRole('button', { name: /^归档会话/ }).click()
    await expect(current).toHaveCount(0)
    const controller = host.runtime.ctx.sessionController
    const prepare = controller.prepareCreate
    controller.prepareCreate = async () => {
      throw new Error('测试创建失败')
    }
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('失败时保留这条草稿')
    await input.press('Enter')
    await expect(page.getByText(/测试创建失败/)).toBeVisible()
    await expect(input).toHaveText('失败时保留这条草稿')
    controller.prepareCreate = prepare
    await input.press('Enter')
    await expect(
      page.getByText('已通过真实 Host 接收：失败时保留这条草稿。', { exact: true }),
    ).toBeVisible()
  } finally {
    await page.close()
    await host.dispose()
  }
})
test('TZ-080 does not open a staged control in a different conversation', async ({ page }) => {
  const host = await fixtureHost()
  let release: (() => void) | undefined
  try {
    await page.goto(host.login)
    const current = page.locator('[data-session-id][aria-current=page]')
    await expect(current).toBeVisible()
    const oldId = await current.getAttribute('data-session-id')
    await page.getByRole('button', { name: '新建会话' }).click()
    await expect(current).not.toHaveAttribute('data-session-id', oldId!)
    await current.hover()
    await current.getByRole('button', { name: /^归档会话/ }).click()
    await expect(current).toHaveCount(0)
    const controller = host.runtime.ctx.sessionController
    const prepare = controller.prepareCreate
    controller.prepareCreate = async (request) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return prepare(request)
    }
    const count = host.runtime.ctx.sessions.list().length
    await page.getByRole('button', { name: /^访问模式，当前：/ }).click()
    await expect.poll(() => release !== undefined).toBe(true)
    await page.locator(`[data-session-id="${oldId}"]`).click()
    release?.()
    await expect.poll(() => host.runtime.ctx.sessions.list().length).toBe(count + 1)
    await expect(current).toHaveAttribute('data-session-id', oldId!)
    await expect(page.getByRole('menuitem', { name: '完全权限' })).toHaveCount(0)
  } finally {
    release?.()
    await page.close()
    await host.dispose()
  }
})
test('TZ-080 unselected composer fits a narrow screen and sends', async ({ page }) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const current = page.locator('[data-session-id][aria-current=page]')
    await expect(current).toBeVisible()
    await current.hover()
    await current.getByRole('button', { name: /^归档会话/ }).click()
    await expect(current).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await expect(input).toBeInViewport()
    await expect(page.getByRole('button', { name: /^选择模型，当前：/ })).toBeInViewport()
    await page.screenshot({ path: 'reports/p2/tz080-unselected-mobile.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await input.fill('窄屏直接发送')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(
      page.getByText('已通过真实 Host 接收：窄屏直接发送。', { exact: true }),
    ).toBeVisible()
  } finally {
    await page.close()
    await host.dispose()
  }
})
test('CHAT-SIMPLE flat chats, retained actions, managed directories and settings', async ({
  page,
}, testInfo) => {
  const host = await fixtureHost()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await expect(input).toBeVisible()
    await expect(page.getByText('与 TUAI 对话', { exact: true })).toBeVisible()
    const greeting = page.getByRole('heading', { name: '今天，想一起完成什么？' })
    await expect(greeting).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('ui-greeting-desktop.png') })
    await expect(page.getByRole('navigation', { name: '聊天记录' })).toBeVisible()
    for (const name of ['视图选项', '添加工作区'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    await expect(page.getByText('我的聊天', { exact: true })).toBeVisible()
    for (const feature of ['我的BOT']) {
      await page.getByRole('button', { name: feature, exact: true }).click()
      await expect(
        page.getByRole('alert').filter({ hasText: '该功能暂未开发，敬请期待' }),
      ).toBeVisible()
    }
    const row = page.locator('[data-session-id][aria-current=page]')
    await page.getByText('我的聊天', { exact: true }).hover()
    await expect(row.locator('.tz-chat-row-time')).toBeVisible()
    await row.hover()
    await expect(row.locator('.tz-chat-row-time')).toBeHidden()
    await expect(row.getByRole('button', { name: /^会话.*的操作/ })).toBeVisible()
    const search = page.getByRole('textbox', { name: '搜索会话' })
    const trigger = page.getByRole('button', { name: '搜索会话' })
    await expect(search).toHaveCount(0)
    expect((await trigger.boundingBox())!.x).toBeGreaterThan(
      (await page.getByText('我的聊天', { exact: true }).boundingBox())!.x,
    )
    await page.keyboard.press('Meta+Alt+K')
    await expect(search).toBeFocused()
    await expect(page.getByRole('dialog', { name: '搜索聊天' })).toBeVisible()
    await page.keyboard.press('Escape')
    await input.fill('工作区管理验收')
    await input.press('Enter')
    await expect(greeting).toBeHidden()
    await expect(
      page.getByText('已通过真实 Host 接收：工作区管理验收。', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('header').getByRole('button', { name: '重命名', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: '连接与工作区', exact: true })).toHaveCount(0)
    await expect(page.getByText(/已连接/)).toHaveCount(0)
    await showMenu(page)
    await expect(page.getByRole('menuitem')).toHaveText([
      '置顶会话',
      '重命名',
      '归档会话',
      '删除会话',
    ])
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('工具与工作区验收')
    await page.getByRole('dialog').getByRole('button', { name: '重命名', exact: true }).click()
    await expect(
      page.locator('header').getByText('工具与工作区验收', { exact: true }),
    ).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    await trigger.click()
    const results = page.getByRole('dialog', { name: '搜索聊天' })
    await search.fill('不存在的会话名称')
    await expect(results.getByText('没有找到聊天')).toBeVisible()
    await search.fill('工具与工作区验收')
    await expect(results.getByRole('button', { name: /工具与工作区验收/ })).toBeVisible()
    await search.fill('已通过真实 Host 接收')
    await expect(results.locator('.tz-chat-snippet')).toContainText('已通过真实 Host 接收')
    await page.getByRole('button', { name: '清空搜索' }).click()
    await page.keyboard.press('Escape')
    await showMenu(page)
    await page.getByRole('menuitem', { name: '置顶会话' }).click()
    await expect(page.getByLabel('已置顶')).toBeVisible()
    await showMenu(page)
    await expect(page.getByRole('menuitem').locator('svg')).toHaveCount(4)
    await page.screenshot({ path: testInfo.outputPath('076-chat-desktop.png') })
    await page.keyboard.press('Escape')
    const archiveButton = page
      .locator(`[data-session-id="${id}"]`)
      .getByRole('button', { name: /^归档会话/ })
    await archiveButton.hover()
    await expect(archiveButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const alignment = await archiveButton.evaluate((el) => {
      const button = el.getBoundingClientRect()
      const icon = el.querySelector('svg')!.getBoundingClientRect()
      return Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2)
    })
    expect(alignment).toBeLessThan(1)
    await archiveButton.click()
    await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '视图选项' })).toHaveCount(0)
    await expect(trigger).toBeVisible()
    // Restoring remains a Host capability; this screen deliberately has no archived list.
    await host.runtime.ctx.workspaceRegistry.unarchiveSession(SessionId(id!))
    await page.locator(`[data-session-id="${id}"]`).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '通用', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    await expect(page.getByText('用量统计', { exact: false })).toHaveCount(0)
    await page.getByRole('button', { name: '标准', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '详细', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('064-settings-menu.png') })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    await expect(
      page.locator('header').getByText('工具与工作区验收', { exact: true }),
    ).toBeVisible()
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
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    const id = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const agent = host.runtime.ctx.agents.get(SessionId(id!))
    host.runtime.ctx.permissionPresets.set(agent.session, 'full-access')
    await page.locator('[contenteditable="true"][role="textbox"]').fill('TZ064 展示工具结果')
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

test('CHAT-SIMPLE delete cancellation, background/current deletion, running stop and reconnect', async ({
  page,
  context,
}) => {
  const host = await fixtureHost()
  try {
    await page.goto(host.login)
    const input = page.locator('[contenteditable="true"][role="textbox"]')
    await input.fill('删除验收消息')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.locator('[data-turn-process]')).toBeVisible()
    await expect(page.locator('[data-turn-process]')).toHaveCSS('justify-content', 'flex-start')
    await expect(page.getByRole('button', { name: /分叉/ })).toHaveCount(0)
    const original = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    const second = await context.newPage()
    await second.goto(new URL('/', host.login).href)
    await expect(second.locator(`[data-session-id="${original}"]`)).toBeVisible()
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await expect(page.locator('[data-session-id][aria-current=page]')).not.toHaveAttribute(
      'data-session-id',
      original!,
    )
    const newer = await page
      .locator('[data-session-id][aria-current=page]')
      .getAttribute('data-session-id')
    expect(host.runtime.ctx.sessions.get(SessionId(newer!)).header.cwd).not.toBe(
      host.runtime.ctx.sessions.get(SessionId(original!)).header.cwd,
    )
    const old = page.locator(`[data-session-id="${original}"]`)
    await old.hover()
    await old.getByRole('button', { name: /^会话.*的操作/ }).click()
    await page.getByRole('menuitem', { name: '删除会话' }).click()
    await expect(page.getByRole('dialog', { name: '删除会话' })).toHaveCSS('opacity', '1')
    const deleteButton = page
      .getByRole('dialog', { name: '删除会话' })
      .getByRole('button', { name: '删除', exact: true })
    expect(await deleteButton.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    await page.screenshot({ path: 'reports/p2/ui-repair-delete-desktop.png' })
    await page
      .getByRole('dialog', { name: '删除会话' })
      .getByRole('button', { name: '取消', exact: true })
      .click()
    expect(host.runtime.ctx.conversationTrash.has(SessionId(original!))).toBe(false)
    await expect(old).toBeVisible()
    await old.hover()
    await old.getByRole('button', { name: /^会话.*的操作/ }).click()
    await page.getByRole('menuitem', { name: '删除会话' }).click()
    await page
      .getByRole('dialog', { name: '删除会话' })
      .getByRole('button', { name: '删除', exact: true })
      .click()
    await expect(old).toHaveCount(0)
    await expect(second.locator(`[data-session-id="${original}"]`)).toHaveCount(0)
    await expect(page.locator('[data-session-id][aria-current=page]')).toHaveAttribute(
      'data-session-id',
      newer!,
    )
    await input.fill('持续运行')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
    await showMenu(page)
    await page.getByRole('menuitem', { name: '删除会话' }).click()
    await page
      .getByRole('dialog', { name: '删除会话' })
      .getByRole('button', { name: '删除', exact: true })
      .click()
    await expect(page.locator(`[data-session-id="${newer}"]`)).toHaveCount(0)
    await expect
      .poll(() => host.runtime.ctx.agents.get(SessionId(newer!))?.running ?? false)
      .toBe(false)
    expect(host.runtime.ctx.conversationTrash.has(SessionId(newer!))).toBe(true)
    await page.reload()
    await expect(input).toBeVisible()
    for (const id of [original, newer])
      await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开侧边栏' }).click()
    await expect(page.getByRole('navigation', { name: '聊天记录' })).toBeVisible()
    await expect(input).toBeHidden()
    expect((await page.locator('[data-sidebar-col]').boundingBox())!.width).toBe(390)
    await page.screenshot({ path: 'reports/p2/076-chat-mobile.png' })
    const mobileRow = page.locator('[data-session-id][aria-current=page]')
    await mobileRow.getByRole('button', { name: /^会话.*的操作/ }).click()
    await page.getByRole('menuitem', { name: '删除会话' }).click()
    await expect(page.getByRole('dialog', { name: '删除会话' })).toHaveCSS('opacity', '1')
    await page.screenshot({ path: 'reports/p2/ui-repair-delete-mobile.png' })
    await page
      .getByRole('dialog', { name: '删除会话' })
      .getByRole('button', { name: '取消' })
      .click()
    await page.locator('[data-session-id][aria-current=page]').getByRole('button').first().click()
    await expect(input).toBeVisible()
    await expect(page.getByRole('heading', { name: '今天，想一起完成什么？' })).toBeVisible()
    await expect.poll(async () => (await input.boundingBox())!.width).toBeGreaterThan(240)
    await page.screenshot({ path: 'reports/p2/076-chat-mobile-conversation.png' })
    await expect(page.getByRole('navigation', { name: '聊天记录' })).toHaveCount(0)
    await page.keyboard.press('Meta+Alt+K')
    await expect(page.getByRole('textbox', { name: '搜索会话' })).toBeFocused()
    await second.close()
  } finally {
    host.model.continueRuns()
    await Promise.all(context.pages().map((tab) => tab.close()))
    await host.dispose()
  }
})
