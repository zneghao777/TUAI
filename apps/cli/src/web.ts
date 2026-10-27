import type {} from '@deepseek-ai/dsh-client-connection'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { EnvironmentCredentials, loadHostSettings, resolveHostPaths } from '@tianzhiai/host-config'
import { mountWebHost, type WebHostOptions } from '@tianzhiai/web-host'
import { bootProfile } from './boot.ts'

/** Start the real P1 profile and P2 Host. Test adapters are supplied only by a separate test launcher. */
export async function startWebHost(
  options: Partial<WebHostOptions> = {},
  prepare?: (ctx: Context) => Promise<void>,
) {
  const paths = resolveHostPaths()
  const settings = await loadHostSettings(paths)
  const runtime = await bootProfile(
    fileURLToPath(new URL('../../../profiles/production.json', import.meta.url)),
    {
      timeoutMs: 15000,
      prepare(ctx) {
        ctx.provide('tianzhiaiHost', { paths, settings, credentials: new EnvironmentCredentials() })
      },
    },
  )
  try {
    await prepare?.(runtime.ctx)
    await mountWebHost(runtime.ctx, {
      port: options.port ?? 3100,
      distIndex:
        options.distIndex ?? fileURLToPath(new URL('../../web/dist/index.html', import.meta.url)),
      ...(options.host === undefined ? {} : { host: options.host }),
      ...(options.trustedHosts === undefined ? {} : { trustedHosts: options.trustedHosts }),
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.model === undefined ? {} : { model: options.model }),
    })
    return runtime
  } catch (error) {
    await runtime.dispose()
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      'trusted-host': { type: 'string', multiple: true },
    },
  })
  const runtime = await startWebHost({
    port: Number(values.port ?? '3100'),
    ...(values.host ? { host: values.host } : {}),
    trustedHosts: values['trusted-host'] ?? [],
  })
  console.log(
    runtime.ctx.connection.authenticatedUrl(
      `http://${values.host ?? '127.0.0.1'}:${runtime.ctx.webServer.port}/`,
    ),
  )
  let closing = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      if (closing) return
      closing = true
      void runtime.dispose().catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
    })
}
