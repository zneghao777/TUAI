// Real installed Ego, synthetic site only. Run with the formal acceptance Host stopped.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EgoConnector } from '../../packages/product/ego-connector/lib/index.js'
import { startControlledSite } from './site/server.mjs'
const connector = new EgoConnector(),
  site = await startControlledSite(),
  root = await mkdtemp(join(tmpdir(), 'tz-p4-sdk-')),
  cases = []
let epoch = 1,
  observation
const call = (method, params = {}) =>
  connector.call(
    method,
    { ...params, leaseUntil: Date.now() + 30000 },
    epoch,
    AbortSignal.timeout(25000),
  )
const observe = async () => (observation = await call('observe'))
const ref = (name, role) => {
  const value = observation.refs.find(
    (r) => (!role || r.role === role) && r.description.includes('"' + name + '"'),
  )
  assert.ok(value, 'Observed target: ' + name)
  return value.id
}
async function act(kind, params = {}) {
  const result = await call('act', {
    action: { kind, pageId: observation.pageId, observationId: observation.id, ...params },
  })
  await observe()
  return result
}
async function check(name, work) {
  await work()
  cases.push(name)
  console.log('PASS', name)
}
try {
  const ready = await connector.start({
    name: 'TUAI P4 implementation acceptance',
    spaceId: Number(process.env.P4_EGO_SPACE_ID),
    epoch,
  })
  await observe()
  await act('navigate', { url: site.origin })
  await check('visible semantics exclude a hidden same-name button', async () =>
    assert.equal(
      observation.refs.filter((r) => r.role === 'button' && r.description.includes('"查询车次"'))
        .length,
      1,
    ),
  )
  await check('Shadow DOM fill uses current Ref', async () => {
    await act('fill', { ref: ref('Shadow note'), value: '合成 Shadow' })
    assert.match(observation.text, /合成 Shadow/)
  })
  await check('Frame fill uses current Ref', async () => {
    await act('fill', { ref: ref('Frame note', 'textbox'), value: '合成 Frame' })
    assert.match(observation.text, /合成 Frame/)
  })
  await check('select preserves native option semantics', async () => {
    await act('select', { ref: ref('席别'), value: 'premium' })
    assert.match(observation.text, /Premium/)
  })
  await check('checkbox reaches the requested state', async () => {
    const box = observation.refs.find((r) => r.role === 'checkbox')
    assert.ok(box)
    await act('check', { ref: box.id, checked: true })
    assert.match(observation.refs.find((r) => r.role === 'checkbox').description, /checked=true/)
    await act('check', {
      ref: observation.refs.find((r) => r.role === 'checkbox').id,
      checked: true,
    })
    assert.match(observation.refs.find((r) => r.role === 'checkbox').description, /checked=true/)
  })
  await check('old observation fails after DOM reordering', async () => {
    const old = observation
    await act('click', { ref: ref('重排页面') })
    await assert.rejects(
      call('act', {
        action: {
          kind: 'click',
          pageId: old.pageId,
          observationId: old.id,
          ref: old.refs.find((r) => r.description.includes('"动态目标"')).id,
        },
      }),
      /STALE_OBSERVATION/,
    )
  })
  await check('related popup is scoped to this task and can switch', async () => {
    await observe()
    await act('click', { ref: ref('打开关联页面') })
    const pages = await call('pages')
    const other = pages.find((p) => p.id !== observation.pageId)
    assert.ok(other)
    const original = observation.pageId
    await act('switch', { pageId: other.id })
    assert.match(observation.text, /Frame note/)
    await act('switch', { pageId: original })
  })
  await check('SDK download is saved before its round ends', async () => {
    const path = join(root, 'trip.txt')
    await call('act', {
      action: {
        kind: 'download',
        pageId: observation.pageId,
        observationId: observation.id,
        ref: ref('下载行程'),
      },
      downloadPath: path,
    })
    await observe()
    assert.match(await readFile(path, 'utf8'), /Synthetic itinerary/)
  })
  // downloadPath belongs to the connector command, never the model-facing action.
  await check('screenshot is a real PNG artifact', async () => {
    const path = join(root, 'page.png')
    await call('capture', { path, observationId: observation.id })
    const bytes = await readFile(path)
    assert.equal(bytes.readUInt32BE(0), 0x89504e47)
  })
  await check('structured wait, key and scroll preserve fresh observations', async () => {
    await act('wait', { ref: ref('查询车次') })
    await act('key', { key: 'Tab' })
    await act('scroll', { deltaY: 200 })
    await act('scroll', { deltaY: -200 })
    assert.ok(observation.fingerprint)
  })
  await check('login expiry is visible before continuation', async () => {
    await act('click', { ref: ref('登录', 'button') })
    assert.match(observation.text, /已登录/)
    await act('click', { ref: ref('使登录过期') })
    assert.match(observation.text, /登录已过期/)
  })
  await check('old epoch is rejected at connector dispatch', async () => {
    await connector.fence(++epoch)
    await assert.rejects(connector.call('observe', {}, epoch - 1), /CONTROL_EPOCH_STALE/)
    await observe()
  })
  await mkdir('reports/p4', { recursive: true })
  await writeFile(
    'reports/p4/connector-live.json',
    JSON.stringify(
      {
        kind: 'installed Ego SDK / controlled local site',
        capabilities: ready.capabilities,
        viewport: ready.viewport,
        cases,
      },
      null,
      2,
    ),
  )
} finally {
  await connector.close(false)
  await site.close()
  await rm(root, { recursive: true, force: true })
}
