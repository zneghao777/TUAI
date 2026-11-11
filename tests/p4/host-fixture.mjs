// Explicit offline acceptance launcher; never imported by product boot.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebHost } from '../../apps/cli/lib/web.js'
import {
  MockAdapter,
  textResponse,
  toolCallResponse,
} from '../../packages/product/agent-runtime/lib/fixture-model.js'
import { EgoConnector, ConnectorError } from '../../packages/product/ego-connector/lib/index.js'
import { createUserMessage } from '../../packages/llm/llm/lib/index.js'
import { startControlledSite } from './site/server.mjs'
const launchedAt = Date.now()
const site = await startControlledSite()
const root = process.env.P4_REUSE_ROOT ?? (await mkdtemp(join(tmpdir(), 'tz-p4-live-')))
process.env.TUAI_HOME = root
const parsedText = (message) =>
  message?.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n') ?? ''
class AcceptanceModel extends MockAdapter {
  constructor() {
    super([])
  }
  async listModels() {
    return [{ provider: 'p4-controlled', id: 'controlled', name: 'P4 受控验收模型' }]
  }
  async *stream(options) {
    const call = (name, args) => toolCallResponse(crypto.randomUUID(), name, args)
    if (options.system?.startsWith('You are the independent browser action reviewer')) {
      const value = JSON.parse(parsedText(options.messages[0])),
        target = value.observation.refs.find((r) => r.id === value.action.ref)?.description ?? ''
      const external = target.includes('创建测试预订')
      yield* textResponse(
        JSON.stringify({
          kind: external
            ? 'external_submit'
            : value.action.kind === 'fill' ||
                value.action.kind === 'check' ||
                value.action.kind === 'select'
              ? 'local_change'
              : 'read',
          reason: '依据当前合成页面及目标控件进行受控验收',
          evidenceQuotes: [external ? '测试商户：P4 Travel' : '出行查询'],
          ...(external
            ? {
                summary: {
                  merchant: 'P4 Travel',
                  itinerary: 'Milano → Roma',
                  dataScope: '合成测试用户',
                  amount: '35',
                  currency: 'EUR',
                  terms: '仅创建测试预订；未付款，未出票',
                  action: '创建一笔测试预订',
                },
              }
            : {}),
        }),
      )
      return
    }
    if (options.system?.startsWith('Read-only order reconciliation.')) {
      const value = JSON.parse(parsedText(options.messages[0])),
        id = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.exec(value.observation.text)?.[0]
      yield* textResponse(
        JSON.stringify(
          id
            ? {
                orderId: id,
                orderState: 'reserved',
                amount: '35',
                currency: 'EUR',
                itinerary: 'Milano → Roma',
                paid: false,
                ticketed: false,
                quotes: [id, 'reserved'],
              }
            : null,
        ),
      )
      return
    }
    const messages = options.messages,
      requestIndex = messages.findLastIndex((m) => m.role === 'user' && m.source?.kind === 'user'),
      request = parsedText(messages[requestIndex])
    const returnIndex = messages.findLastIndex((m) => m.source?.kind === 'browser-return'),
      continuing = returnIndex > requestIndex
    const results = messages
      .slice(continuing ? returnIndex : requestIndex)
      .filter((m) => m.role === 'tool')
    if (results.some((m) => m.isError)) {
      yield* textResponse('P4 验收停止：' + parsedText(results.find((m) => m.isError)))
      return
    }
    const values = results
      .map((m) => {
        try {
          return JSON.parse(parsedText(m))
        } catch {
          return null
        }
      })
      .filter(Boolean)
    const browser = values.find((v) => v.id && v.controlEpoch),
      observation = values.findLast((v) => v.refs),
      browserId = browser?.id ?? this.browserId
    if (browser?.id) this.browserId = browser.id
    const state = runtime?.ctx.browsers
      .list({ ownerId: runtime.ctx.browsers.ownerId, sessionId: options.sessionId })
      .at(-1)
    const action = (kind, fields = {}) =>
      call('browser_act', {
        browserId: state?.id ?? browserId,
        observationId: observation.id,
        controlEpoch: state.controlEpoch,
        action: { kind, pageId: observation.pageId, ...fields },
      })
    const ref = (needle) => observation?.refs.find((r) => r.description.includes(needle))?.id
    if (request.includes('P4 真实站点')) {
      if (continuing) {
        if (!results.length) yield* call('browser_observe', { browserId: state.id })
        else
          yield* textResponse(
            '已沿原 Task / Execution 重新观察当前 Italo 页面。当前页面：' +
              observation.url +
              '；' +
              observation.title +
              '。本次只验证公开查询和接管；未创建订单、未付款、未出票。',
          )
      } else {
        if (!results.length) yield* call('browser_open', {})
        else if (results.length === 1) yield* call('browser_observe', { browserId })
        else if (results.length === 2)
          yield* action('navigate', { url: 'https://www.italotreno.com/it' })
        else if (results.length === 3) yield* call('browser_observe', { browserId })
        else if (results.length === 4)
          yield* call('browser_need_human', {
            browserId,
            reason:
              '真实站点验收：请接管，试用系统中文输入法，再查询 2026-11-15 Milano → Roma。完成后明确交还 Agent；本次不创建订单。',
          })
        else yield* textResponse('等待真实人工接管；只查询，不创建订单。')
      }
      return
    }
    if (
      continuing &&
      state?.transaction &&
      ['submitted', 'unknown', 'reconciled'].includes(state.transaction.state)
    ) {
      if (!results.length) yield* call('browser_observe', { browserId: state.id })
      else if (results.length === 1) yield* action('click', { ref: ref('只读核验预订') })
      else if (results.length === 2) yield* call('browser_observe', { browserId: state.id })
      else if (results.length === 3)
        yield* call('browser_reconcile', { browserId: state.id, observationId: observation.id })
      else yield* textResponse('受控预订已只读核验；未付款、未出票。未重复提交。')
      return
    }
    if (continuing) {
      if (!results.length) yield* call('browser_observe', { browserId: state.id })
      else if (results.length === 1) yield* action('click', { ref: ref('查询车次') })
      else if (results.length === 2) yield* call('browser_observe', { browserId: state.id })
      else
        yield* textResponse(
          '已从原 Task / Execution 的当前登录页面继续查询。Milano → Roma，2026-11-15，测试车次已核对；尚未付款或出票。',
        )
      return
    }
    if (request.includes('P4 事务')) {
      if (!results.length) yield* call('browser_observe', { browserId: state.id })
      else if (results.length === 1)
        yield* action('check', {
          ref: observation.refs.find((r) => r.role === 'checkbox').id,
          checked: true,
        })
      else if (results.length === 2) yield* call('browser_observe', { browserId: state.id })
      else if (results.length === 3) yield* action('click', { ref: ref('创建测试预订') })
      else yield* textResponse('等待用户具体批准。')
      return
    }
    if (request.includes('P4 出行')) {
      const step = results.length
      if (step === 0) yield* call('browser_open', {})
      else if (step === 1) yield* call('browser_observe', { browserId })
      else if (step === 2) yield* action('navigate', { url: site.origin + '/?fault=after-accept' })
      else if (step === 3) yield* call('browser_observe', { browserId })
      else if (step === 4) yield* action('click', { ref: ref('查询车次') })
      else if (step === 5) yield* call('browser_observe', { browserId })
      else if (step === 6)
        yield* call('browser_need_human', {
          browserId,
          reason: '请接管当前页面完成合成登录和中文备注，然后明确交还 Agent。',
        })
      else yield* textResponse('等待人工接管。')
      return
    }
    yield* textResponse('这是 P4 受控验收模型；输入“P4 出行验收”启动合成网站任务。')
  }
}
class AuthorizedAcceptanceConnector extends EgoConnector {
  async call(method, params, epoch, signal) {
    const target = this.observation?.refs.find((r) => r.id === params.action?.ref)
    const value = await super.call(method, params, epoch, signal)
    if (method === 'observe') this.observation = value
    if (
      process.env.P4_DROP_SUBMIT_RECEIPT === '1' &&
      method === 'act' &&
      target?.description.includes('创建测试预订')
    )
      throw new ConnectorError('CONTROLLED_RECEIPT_LOST_AFTER_DISPATCH', true)
    return value
  }

  async start(options) {
    return super.start({
      ...options,
      ...(process.env.P4_EGO_SPACE_ID ? { spaceId: Number(process.env.P4_EGO_SPACE_ID) } : {}),
    })
  }
}
let runtime
runtime = await startWebHost(
  {
    port: Number(process.env.P4_PORT ?? 0),
    ...(process.env.P4_DIST_INDEX ? { distIndex: process.env.P4_DIST_INDEX } : {}),
    provider: 'p4-controlled',
    model: 'controlled',
  },
  async (ctx) => {
    ctx.llm.registerAdapter(['p4-controlled'], new AcceptanceModel())
    ctx.browsers.connectorFactory = () => new AuthorizedAcceptanceConnector()
    ctx.on('agent/created', ({ agent }) => {
      ctx.permissionPresets.set(agent.session, 'full-access')
      return undefined
    })
  },
)
let autoSessionId = process.env.P4_REUSE_ROOT
  ? runtime.ctx.browsers.forOwner(runtime.ctx.browsers.ownerId).at(-1)?.sessionId
  : undefined
if (process.env.P4_AUTO_START) {
  const created = await runtime.ctx.sessionController.create({})
  autoSessionId = created.sessionId
  const { agent } = await runtime.ctx.sessionController.resolveAgent(autoSessionId)
  agent.followup(
    createUserMessage({
      source: { kind: 'user' },
      content: [
        {
          type: 'text',
          text: process.env.P4_TRAVEL
            ? 'P4 真实站点：在 Italo 查询 2026-11-15 Milano 到 Roma，1 位成人。等待我接管操作并明确归还，之后从当前页面继续；不创建订单。'
            : 'P4 出行验收：查询 Milano 到 Roma，2026-11-15；等待我接管登录，明确归还后继续。',
        },
      ],
    }),
  )
  await agent.whenIdle()
}
const baseURL = `http://127.0.0.1:${runtime.ctx.webServer.port}/`
await writeFile(
  process.env.P4_RUNTIME_FILE ?? '/tmp/tianzhiai-p4-runtime.json',
  JSON.stringify({
    baseURL,
    authURL: runtime.ctx.connection.authenticatedUrl(baseURL),
    site: site.origin,
    root,
    autoSessionId,
    hostPid: process.pid,
    launchedAt,
  }),
  { mode: 0o600 },
)
console.log(
  JSON.stringify({
    baseURL,
    site: site.origin,
    root,
    mode: 'controlled model / real Ego connector',
  }),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void Promise.all([runtime.dispose(), site.close()]).finally(() => process.exit())
  })
