import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebHost } from '../../apps/cli/lib/web.js'
const home = await mkdtemp(join(tmpdir(), 'tianzhiai-p2-'))
process.env.TUAI_HOME = home
let runtime
try {
  runtime = await startWebHost({ port: 0 })
  const base = `http://127.0.0.1:${runtime.ctx.webServer.port}/`
  const login = await fetch(runtime.ctx.connection.authenticatedUrl(base), { redirect: 'manual' })
  console.log('Host start and login', login.status, Boolean(login.headers.get('set-cookie')))
} finally {
  await runtime?.dispose()
  await rm(home, { recursive: true, force: true })
}
