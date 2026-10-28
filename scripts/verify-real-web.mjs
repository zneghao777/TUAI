// Explicit opt-in real network acceptance, using only Tianzhi's own encrypted key.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, chmod, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { startWebHost } from '../apps/cli/lib/web.js'
import { resolveHostPaths } from '../packages/product/host-config/lib/index.js'
assert.equal(process.argv[2], '--run')
const original = resolveHostPaths()
const home = await mkdtemp(join(tmpdir(), 'tianzhiai-web-acceptance-'))
const previous = process.env.TIANZHIAI_HOME
const report = { provider: 'deepseek', fetch: null, search: null }
let runtime, browser
try {
  await mkdir(join(home, 'config'), { mode: 0o700 })
  for (const name of ['model-providers.json', 'model-secrets.key', 'model-secrets.enc']) {
    const path = join(home, 'config', name)
    await copyFile(join(original.config, name), path)
    await chmod(path, 0o600)
  }
  process.env.TIANZHIAI_HOME = home
  runtime = await startWebHost({ port: 0 })
  for (const kind of ['fetch', 'search']) {
    try {
      const value =
        kind === 'fetch'
          ? await runtime.ctx.web.fetch({ url: 'https://example.com/' }, AbortSignal.timeout(30000))
          : await runtime.ctx.web.search(
              { query: 'TypeScript official documentation handbook', maxResults: 3 },
              AbortSignal.timeout(45000),
            )
      report[kind] = {
        ok: true,
        ...(kind === 'search'
          ? { sources: value.sources.length, urls: value.sources.map((source) => source.url) }
          : { status: value.statusCode, characters: value.body.content.length }),
      }
      if (kind === 'search') assert.ok(value.sources.length > 0)
      else {
        assert.equal(value.statusCode, 200)
        assert.match(value.body.content, /Example Domain/)
      }
    } catch (error) {
      report[kind] = {
        ok: false,
        code: error.code ?? error.name,
        message: String(error.message).slice(0, 500),
      }
    }
  }
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(
    runtime.ctx.connection.authenticatedUrl(`http://127.0.0.1:${runtime.ctx.webServer.port}/`),
  )
  await page
    .getByRole('textbox', { name: '消息', exact: true })
    .fill(
      'TZ064 真实 Web 工具验收：先实际调用 web_search 搜索 TypeScript 官方文档，然后调用 web_fetch 获取 https://example.com/，最后用一句中文回答网页标题。只使用这两个 Web 工具，不执行 Shell 或其他工具。',
    )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.locator('[data-turn-process]').waitFor({ timeout: 120000 })
  const session = runtime.ctx.sessions
    .list()
    .find((session) => session.snapshotEvents().some((event) => event.type === 'turn/end'))
  const events = session.snapshotEvents()
  const calls = events.filter((event) => event.type === 'tool/call').map((event) => event.data.name)
  const outcomes = events.filter((event) => event.type === 'tool/result')
  report.model = {
    calls,
    results: outcomes.length,
    errors: outcomes.filter((event) => event.data.message.isError).length,
    pageErrors: errors,
  }
  assert.ok(calls.includes('web_search') && calls.includes('web_fetch'))
  assert.equal(report.model.errors, 0)
  const turn = page.locator('[data-turn-process]').last()
  if ((await turn.getAttribute('aria-expanded')) === 'false') await turn.click()
  const processGroup = page.locator('[data-step-process] button[data-process-activity]').last()
  if (
    (await processGroup.count()) &&
    (await processGroup.getAttribute('aria-expanded')) === 'false'
  )
    await processGroup.click()
  await expect(page.locator('[data-tool="web_search"]').first()).toBeVisible()
  await expect(page.locator('[data-tool="web_fetch"]').first()).toBeVisible()
  await page.screenshot({ path: 'reports/p2/064-real-web.png' })
  assert.deepEqual(errors, [])
  await mkdir('reports/p2', { recursive: true })
  await writeFile('reports/p2/064-real-web.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  assert.ok(report.fetch.ok && report.search.ok, 'Real web acceptance did not pass')
} finally {
  await browser?.close()
  await runtime?.dispose()
  if (previous === undefined) delete process.env.TIANZHIAI_HOME
  else process.env.TIANZHIAI_HOME = previous
  await rm(home, { recursive: true, force: true })
}
