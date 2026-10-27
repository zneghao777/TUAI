import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resolveHostPaths,
  loadHostSettings,
  parseHostSettings,
  EnvironmentCredentials,
  publicHostIdentity,
  redactDiagnostic,
} from '../packages/product/host-config/lib/index.js'
import {
  createRemotePlatform,
  validateHostPath,
  parseClientConfig,
} from '../packages/product/platform/lib/index.js'

test('data domains use Host OS paths and reject relative overrides', () => {
  const mac = resolveHostPaths({ platform: 'darwin', home: '/Users/中文 用户', env: {} })
  assert.equal(mac.sessions, '/Users/中文 用户/Library/Application Support/TIanZhiAi/data/sessions')
  const windows = resolveHostPaths({
    platform: 'win32',
    home: 'C:\\Users\\中文 用户',
    env: { APPDATA: 'D:\\应用 数据' },
  })
  assert.equal(windows.config, 'D:\\应用 数据\\TIanZhiAi\\config')
  const linux = resolveHostPaths({
    platform: 'linux',
    home: '/home/user',
    env: {
      XDG_CONFIG_HOME: '/config',
      XDG_DATA_HOME: '/data',
      XDG_STATE_HOME: '/state',
      XDG_CACHE_HOME: '/cache',
    },
  })
  assert.equal(linux.config, '/config/TIanZhiAi')
  assert.equal(linux.sessions, '/data/TIanZhiAi/sessions')
  assert.equal(linux.logs, '/state/TIanZhiAi/logs')
  assert.equal(linux.temporary, '/cache/TIanZhiAi/tmp')
  const override = resolveHostPaths({
    platform: 'linux',
    home: '/home/user',
    env: { TIANZHIAI_HOME: '/中文 独立目录' },
  })
  assert.equal(override.downloads, '/中文 独立目录/data/downloads')
  assert.notEqual(override.sessions, override.browserProfiles)
  assert.throws(() => resolveHostPaths({ env: { TIANZHIAI_HOME: './relative' } }), /绝对路径/)
  assert.throws(
    () =>
      resolveHostPaths({
        platform: 'linux',
        home: '/home/user',
        env: { XDG_DATA_HOME: 'relative' },
      }),
    /绝对路径/,
  )
})

test('Chinese directories, persistent identity and credential-only Host projection', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), '天质 配置 '))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const paths = resolveHostPaths({ env: { TIANZHIAI_HOME: directory } })
  const first = await loadHostSettings(paths)
  assert.equal(first.hostId, (await loadHostSettings(paths)).hostId)
  const secret = randomUUID()
  const settings = parseHostSettings({
    ...first,
    credentialReferences: {
      model: { source: 'environment', name: 'TIANZHIAI_SECRET_MODEL' },
    },
  })
  const environment = { TIANZHIAI_SECRET_MODEL: secret }
  const store = new EnvironmentCredentials(environment)
  assert.deepEqual(await store.resolve(settings.credentialReferences.model), {
    available: true,
    value: secret,
  })
  assert.deepEqual(
    await new EnvironmentCredentials({}).resolve(settings.credentialReferences.model),
    { available: false, reason: 'not_found' },
  )
  assert.equal(JSON.stringify(store), '{}')
  assert.equal(redactDiagnostic(`message ${secret}`, settings, environment), 'message [REDACTED]')
  const client = publicHostIdentity(settings, paths.platform, 'remote')
  assert.deepEqual(Object.keys(client).sort(), ['executionLocation', 'id', 'os'])
  assert.equal(JSON.stringify(client).includes(secret), false)
  assert.equal((await readFile(paths.hostConfig, 'utf8')).includes(secret), false)
  assert.throws(
    () => parseHostSettings({ ...first, apiKey: secret }),
    (error) => !error.message.includes(secret),
  )
  await writeFile(paths.hostConfig, '{invalid')
  await assert.rejects(loadHostSettings(paths), /合法 JSON/)
  if (process.platform !== 'win32') assert.equal((await stat(paths.config)).mode & 0o777, 0o700)
})

test('remote paths stay Host-bound and unavailable operations remain explicit', async () => {
  const host = { id: 'windows-host', os: 'win32', executionLocation: 'remote' }
  const platform = createRemotePlatform(host, 'mobile')
  assert.equal(platform.capabilities.localHost, false)
  assert.equal(platform.capabilities.chooseDirectory, false)
  assert.equal((await platform.chooseDirectory()).code, 'unavailable')
  assert.equal(validateHostPath(host, { hostId: host.id, path: 'C:\\中文 目录' }).available, true)
  assert.equal(
    validateHostPath(host, { hostId: host.id, path: '/phone/local' }).code,
    'invalid_path',
  )
  assert.equal(
    (await platform.openPath({ hostId: 'other-host', path: 'C:\\data' })).code,
    'wrong_host',
  )
  assert.equal(parseClientConfig(host).available, true)
  assert.equal(parseClientConfig({ ...host, credentialReferences: {} }).available, false)
})
