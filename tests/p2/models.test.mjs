import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, stat, chmod, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureHost } from './fixture-host.mjs'
import { clientFor } from './client.mjs'
import { startWebHost } from '../../apps/cli/lib/web.js'
import { SecretStore } from '../../packages/product/host-config/lib/index.js'

const exampleKey = 'test-only-model-key-not-real'
async function endpoint() {
  const seen = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    seen.push({ path: req.url, key: req.headers['x-api-key'], body })
    if (req.headers['x-api-key'] === 'invalid-test-key') {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'invalid-test-key must not leak' } }))
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    seen,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
const provider = (baseURL) => ({
  id: 'local-model',
  name: '本机测试',
  baseURL,
  models: [{ id: 'test-model', name: 'Test' }],
})

test('模型配置经鉴权和生成 codec 保存，目录立即可见且密钥不回传', async () => {
  const host = await fixtureHost(),
    api = await endpoint()
  const client = await clientFor(host.runtime)
  try {
    assert.equal(
      (
        await fetch(new URL('api/platform/saveModelProvider', client.base), {
          method: 'POST',
          body: '{}',
        })
      ).status,
      401,
    )
    const initial = await client.ctx.remote.platform.modelProviders()
    assert.equal(initial.ok, true)
    const saved = await client.ctx.remote.platform.saveModelProvider({
      revision: initial.value.revision,
      provider: provider(api.url),
      apiKey: exampleKey,
    })
    assert.equal(saved.ok, true)
    assert.equal(saved.value.providers.find((p) => p.id === 'local-model').configured, true)
    assert.equal(JSON.stringify(saved).includes(exampleKey), false)
    const catalog = await client.ctx.remote.session.modelCatalog()
    assert.equal(catalog.ok, true)
    assert.ok(
      catalog.value.groups.some((g) => g.id === 'local-model' && g.models[0].id === 'test-model'),
    )
    const result = await client.ctx.remote.platform.testModelProvider({
      provider: provider(api.url),
    })
    assert.equal(result.ok, true)
    assert.equal(result.value.ok, true)
    assert.equal(api.seen[0].key, exampleKey)
    assert.equal(api.seen[0].path, '/v1/messages')
    const invalid = await client.ctx.remote.platform.testModelProvider({
      provider: provider(api.url),
      apiKey: 'invalid-test-key',
    })
    assert.equal(invalid.value.ok, false)
    assert.equal(JSON.stringify(invalid).includes('invalid-test-key'), false)
    const config = join(host.home, 'config')
    for (const name of await readdir(config)) {
      if (name.endsWith('.lock')) continue
      assert.equal(
        (await readFile(join(config, name))).includes(Buffer.from(exampleKey)),
        false,
        name,
      )
    }
    assert.equal((await stat(join(config, 'model-secrets.key'))).mode & 0o777, 0o600)
    assert.equal((await stat(join(config, 'model-secrets.enc'))).mode & 0o777, 0o600)
  } finally {
    await client.dispose()
    await host.dispose()
    await api.close()
  }
})

test('配置版本冲突、重复模型和更换地址不复用旧密钥', async () => {
  const host = await fixtureHost(),
    api = await endpoint()
  try {
    const manager = host.runtime.ctx.modelManager
    const first = await manager.save({
      revision: 0,
      provider: provider(api.url),
      apiKey: exampleKey,
    })
    await assert.rejects(
      manager.save({ revision: 0, provider: provider(api.url), apiKey: 'replacement' }),
      /其他窗口/,
    )
    await assert.rejects(
      manager.save({
        revision: first.revision,
        provider: { ...provider(api.url), baseURL: `${api.url}/other` },
      }),
      /重新填写/,
    )
    await assert.rejects(
      manager.test({ provider: { ...provider(api.url), baseURL: `${api.url}/other` } }),
      /API Key/,
    )
    await assert.rejects(
      manager.save({
        revision: first.revision,
        provider: {
          ...provider(api.url),
          models: [
            { id: 'same', name: 'A' },
            { id: 'same', name: 'B' },
          ],
        },
      }),
      /不合法/,
    )
    const results = await Promise.allSettled([
      manager.save({
        revision: first.revision,
        provider: { ...provider(api.url), name: '一个窗口' },
      }),
      manager.save({
        revision: first.revision,
        provider: { ...provider(api.url), name: '另一个窗口' },
      }),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const latest = await manager.snapshot()
    const removed = await manager.remove({ revision: latest.revision, id: 'local-model' })
    assert.equal(
      removed.providers.some((p) => p.id === 'local-model'),
      false,
    )
    assert.equal(
      host.runtime.ctx.llm.listProviders().some((p) => p.id === 'local-model'),
      false,
    )
    await assert.rejects(manager.test({ provider: provider(api.url) }), /API Key/)
    assert.equal(api.seen.length, 0)
  } finally {
    await host.dispose()
    await api.close()
  }
})

test('模型配置与加密密钥在 Host 重启后恢复', async () => {
  const host = await fixtureHost(),
    api = await endpoint()
  let restarted
  try {
    await host.runtime.ctx.modelManager.save({
      revision: 0,
      provider: provider(api.url),
      apiKey: exampleKey,
    })
    await host.runtime.dispose()
    restarted = await startWebHost({ port: 0 })
    const restored = await restarted.ctx.modelManager.snapshot()
    assert.equal(restored.revision, 1)
    assert.equal(restored.providers.find((p) => p.id === 'local-model').configured, true)
    assert.equal((await restarted.ctx.modelManager.test({ provider: provider(api.url) })).ok, true)
    assert.equal(api.seen[0].key, exampleKey)
  } finally {
    await restarted?.dispose()
    await host.dispose()
    await api.close()
  }
})

test('加密凭据拒绝宽权限、被篡改内容和丢失包装密钥', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tianzhiai-secrets-'))
  try {
    const store = new SecretStore(root)
    await Promise.all([store.set('first', 'test-secret-1'), store.set('second', 'test-secret-2')])
    assert.equal(await store.get('first'), 'test-secret-1')
    assert.equal(await store.get('second'), 'test-secret-2')
    await chmod(join(root, 'model-secrets.key'), 0o644)
    await assert.rejects(store.get('first'), /仅当前/)
    await chmod(join(root, 'model-secrets.key'), 0o600)
    const encoded = await readFile(join(root, 'model-secrets.enc'))
    const changed = Buffer.from(encoded)
    changed[changed.length - 1] ^= 1
    await writeFile(join(root, 'model-secrets.enc'), changed)
    await assert.rejects(store.get('first'), /解密失败/)
    await writeFile(join(root, 'model-secrets.enc'), encoded)
    await rm(join(root, 'model-secrets.key'))
    await assert.rejects(store.set('third', 'test-secret-3'), /缺失/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
