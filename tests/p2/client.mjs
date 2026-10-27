import { createRequire } from 'node:module'
import { Context } from '../../vendor/cordis/lib/index.js'
import { installConnection } from '../../packages/client/connection/lib/client.node.js'
import * as Registry from '../../packages/typert/registry/lib/client.node.js'
import * as Gateway from '../../packages/api/gateway/lib/client.node.js'
import * as Remotes from '../../packages/api/remotes/lib/client.js'
import * as Uploads from '../../packages/client/file-upload/lib/client.js'
import * as Sessions from '../../packages/api/session-controller/lib/client.js'
import platform from '../../packages/product/web-host/lib/typert.remote-client.js'
const require = createRequire(new URL('../../packages/api/gateway/package.json', import.meta.url))
const WebSocket = require('ws')
export async function clientFor(runtime) {
  const base = `http://127.0.0.1:${runtime.ctx.webServer.port}/`
  const auth = await fetch(runtime.ctx.connection.authenticatedUrl(base), { redirect: 'manual' })
  if (auth.status !== 303) throw new Error(`Login ${auth.status}`)
  const cookie = auth.headers.get('set-cookie').split(';')[0]
  const ctx = new Context()
  installConnection(ctx, {
    interactions: 'answer',
    transport: {
      fetch: (input, init) =>
        fetch(new URL(input, base), {
          ...init,
          headers: { ...init.headers, Cookie: cookie, Origin: new URL(base).origin },
        }),
      streamBaseUrl: base,
      createWebSocket: (url) =>
        new WebSocket(url, { headers: { Cookie: cookie, Origin: new URL(base).origin } }),
    },
  })
  await ctx.plugin(Registry)
  await ctx.plugin(Gateway)
  await ctx.plugin(Remotes)
  await ctx.remote.$mount(platform)
  await ctx.plugin(Uploads)
  await ctx.plugin(Sessions)
  await until(() => ctx.connection.generation.getSnapshot())
  return { ctx, base, cookie, dispose: () => ctx.fiber.dispose() }
}
export async function until(fn, timeout = 8000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for observed state')
    await new Promise((r) => setTimeout(r, 10))
  }
}
