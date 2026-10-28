import { test, expect } from '@playwright/test'
import { fixtureHost } from '../fixture-host.mjs'
import { createUserMessage } from '../../../packages/llm/llm/lib/index.js'
import { SessionId } from '../../../packages/core/session/lib/index.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { cpus, platform, arch } from 'node:os'
test.use({ trace: 'off' })
// Trace DOM snapshots distort the long-history benchmark.
test('真实 Host 一万条持久历史、分页锚点与持续输入', async ({ page }) => {
  test.setTimeout(180000)
  const count = Number(process.env.P2_HISTORY_COUNT ?? 10000)
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
    for (let turn = 1; turn <= count / 100; turn++) {
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
    await expect(page.locator('[contenteditable="true"][role="textbox"]')).toBeVisible()
    const row = page.locator('[data-session-id="p2-history-10000"]')
    await expect(row).toBeVisible()
    const opened = performance.now()
    await row.click()
    await expect(
      page.getByText(new RegExp(`历史记录 ${String(count).padStart(5, '0')}`)).first(),
    ).toBeVisible()
    const initialMs = performance.now() - opened
    console.log('history initial', initialMs)
    const more = page.locator('[class*="older_"] button')
    const scroller = page.locator('[data-conversation-scroll]')
    let pages = 0
    while (await more.count()) {
      await scroller.evaluate((el) => {
        el.scrollTop = 0
      })
      try {
        await more.click({ timeout: 5000 })
      } catch (error) {
        console.log(
          'PAGING DOM',
          await more.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return {
              rect: r.toJSON(),
              point: document
                .elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                .slice(0, 6)
                .map((e) => e.outerHTML.slice(0, 600)),
              parents: Array.from(
                document.querySelectorAll('[data-conversation-scroll], [data-chat-flow]'),
              ).map((e) => ({
                cls: e.className,
                rect: e.getBoundingClientRect().toJSON(),
                scroll: e.scrollTop,
                height: e.scrollHeight,
              })),
            }
          }),
        )
        throw error
      }
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
    // Original DSH retains loaded rows for turn navigation and browser find.
    expect(await page.locator('[data-chat-flow-kind="user"]').count()).toBe(count)
    await page.locator('[contenteditable="true"][role="textbox"]').fill('万条历史之后的新输入')
    const sendAt = performance.now()
    // Observe user-action-to-paint in the page; global accessibility queries over
    // 10,000 Copy buttons must not be mistaken for application input latency.
    await page.evaluate(() => {
      const metrics = { clicked: 0, rendered: 0 }
      Reflect.set(window, '__p2InputTiming', metrics)
      const button = document.querySelector('[data-composer-card] button[aria-label="发送消息"]')
      button?.addEventListener(
        'click',
        () => {
          metrics.clicked = performance.now()
        },
        { once: true },
      )
      const observer = new MutationObserver(() => {
        if (
          metrics.clicked &&
          Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')).some(
            (el) => el.textContent?.includes('万条历史之后的新输入'),
          )
        ) {
          observer.disconnect()
          requestAnimationFrame(() => {
            metrics.rendered = performance.now()
          })
        }
      })
      observer.observe(document.querySelector('[data-chat-flow]') ?? document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
    await page
      .locator('[data-composer-card]')
      .getByRole('button', { name: '发送消息', exact: true })
      .click()
    await expect.poll(() => host.model.calls.length).toBeGreaterThan(0)
    console.log('history new accepted')
    // DSH intentionally follows the user's own submission, while remote growth preserves reading.
    await expect(
      page
        .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
        .last(),
    ).toContainText('万条历史之后的新输入', { timeout: 60000 })
    await expect(
      page
        .locator('[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])')
        .last(),
    ).toBeInViewport()
    const metrics = {
      environment: {
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0].model,
        browser: 'Chrome',
        viewport: '1440x1000',
      },
      historyMessages: count,
      seededMs,
      initialMs,
      pages,
      automationElapsedMs: performance.now() - sendAt,
      acceptedAndRenderedMs: await page.evaluate(() => {
        const metric = Reflect.get(window, '__p2InputTiming')
        return metric.rendered - metric.clicked
      }),
      renderedArticles: await page.locator('article').count(),
      pageElements: await page.locator('*').count(),
    }
    await mkdir('reports/p2', { recursive: true })
    await writeFile('reports/p2/performance.json', JSON.stringify(metrics, null, 2) + '\n')
    expect(metrics.initialMs).toBeLessThan(1000)
    expect(metrics.acceptedAndRenderedMs).toBeGreaterThan(0)
    expect(metrics.acceptedAndRenderedMs).toBeLessThan(2000)
    await page.screenshot({ path: 'reports/p2/08-万条历史.png' })
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: 'reports/p2/history-debug.png' })
    throw error
  } finally {
    await page.close()
    await host.dispose()
  }
})
