import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { createUserMessage } from '../../../packages/llm/llm/lib/index.js'
import { SessionId } from '../../../packages/core/session/lib/index.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { cpus, platform, arch } from 'node:os'
test('真实 Host 一万条持久历史、分页锚点与持续输入', async ({ page }) => {
  test.setTimeout(120000)
  const host = await fixtureHost(),
    id = SessionId('p2-history-10000'),
    started = performance.now()
  try {
    const seed = await host.runtime.ctx.agents.create({
      sessionId: id,
      agentOptions: { provider: 'p2-controlled', model: 'controlled' },
      meta: { cwd: process.cwd() },
    })
    const session = seed.agent.session
    session.append('model/selection', { provider: 'p2-controlled', model: 'controlled' })
    for (let turn = 1; turn <= 100; turn++) {
      session.append('turn/start', { turn })
      for (let index = 0; index < 100; index++)
        session.append(
          'user/message',
          createUserMessage({
            content: [
              {
                type: 'text',
                text: `历史记录 ${String((turn - 1) * 100 + index + 1).padStart(5, '0')} · 受控持久化验收`,
              },
            ],
            source: { kind: 'user' },
          }),
          { surfaceOp: 'append' },
        )
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    session.append('session/title', {
      title: '一万条历史验收',
      messageSeqs: [],
      source: { kind: 'user' },
    })
    await host.runtime.ctx.sessionPersistence.flush()
    await seed.dispose()
    const seededMs = performance.now() - started
    console.log('history seeded', seededMs)
    await page.goto(host.login)
    await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
    const row = page
      .getByRole('navigation', { name: '会话历史' })
      .locator('[data-session-id="p2-history-10000"]')
    await expect(row).toBeVisible()
    const opened = performance.now()
    await row.click()
    await expect(page.getByText(/历史记录 10000/).first()).toBeVisible()
    const initialMs = performance.now() - opened
    console.log('history initial', initialMs)
    const more = page.getByRole('button', { name: '加载更早记录' })
    const scroller = page.locator('[class*="conversation_"]').first()
    let pages = 0
    while (await more.count()) {
      await scroller.evaluate((el) => {
        el.scrollTop = 0
      })
      await more.click()
      await expect.poll(async () => !(await more.count()) || (await more.isEnabled())).toBe(true)
      pages++
      if (pages % 10 === 0) console.log('history pages', pages)
      if (pages > 80) throw new Error('历史分页没有收敛')
    }
    console.log('history loaded', pages)
    await scroller.evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(page.getByText(/历史记录 00001/).first()).toBeVisible()
    expect(await page.locator('[data-message-kind="user"]').count()).toBeLessThan(40)
    const before = await scroller.evaluate((el) => el.scrollTop)
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('万条历史之后的新输入')
    const sendAt = performance.now()
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(() => host.model.calls.length).toBeGreaterThan(0)
    console.log('history new accepted')
    await expect(page.getByText(/历史记录 00001/).first()).toBeVisible()
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(before + 100)
    await page.getByRole('button', { name: '回到最新消息' }).click()
    await expect(page.locator('[data-message-kind="assistant"]').last()).toContainText(
      '万条历史之后的新输入',
    )
    const metrics = {
      environment: {
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0].model,
        browser: 'Chrome',
        viewport: '1440x1000',
      },
      historyMessages: 10000,
      seededMs,
      initialMs,
      pages,
      acceptedAndRenderedMs: performance.now() - sendAt,
      renderedArticles: await page.locator('article').count(),
      pageElements: await page.locator('*').count(),
    }
    await mkdir('reports/p2', { recursive: true })
    await writeFile('reports/p2/performance.json', JSON.stringify(metrics, null, 2) + '\n')
    await page.screenshot({ path: 'reports/p2/08-万条历史.png' })
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: 'reports/p2/history-debug.png' })
    throw error
  } finally {
    await page.close()
    await host.dispose()
  }
})
