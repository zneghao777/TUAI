import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { registerDemo, runPrompt } from '@tianzhiai/agent-runtime'
import { bootProfile } from './boot.ts'
import {
  EnvironmentCredentials,
  loadHostSettings,
  publicHostIdentity,
  redactDiagnostic,
  resolveHostPaths,
  type HostPaths,
  type HostSettings,
} from '@tianzhiai/host-config'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianzhiaiHost: { paths: HostPaths; settings: HostSettings; credentials: EnvironmentCredentials }
  }
}

let activeSettings: HostSettings | undefined

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      version: { type: 'boolean' },
      help: { type: 'boolean' },
      check: { type: 'boolean' },
      profile: { type: 'string' },
      patch: { type: 'string', multiple: true },
      prompt: { type: 'string' },
      session: { type: 'string' },
      resume: { type: 'boolean' },
      demo: { type: 'boolean' },
      model: { type: 'string' },
    },
  })
  if (values.version) {
    console.log('TIanZhiAi 0.0.1')
    return
  }
  if (values.help) {
    console.log(
      'TIanZhiAi [--profile production|development|<manifest.json>] [--check] [--prompt <输入> --session <标识> --resume --model <模型>] [--demo] [--patch <file>]',
    )
    return
  }
  const paths = resolveHostPaths()
  const settings = await loadHostSettings(paths)
  activeSettings = settings
  const selected = values.profile ?? process.env.TIANZHIAI_PROFILE ?? settings.profile
  const manifest = ['production', 'development'].includes(selected)
    ? fileURLToPath(new URL(`../../../profiles/${selected}.json`, import.meta.url))
    : resolve(selected)
  let exitRequested: number | undefined
  let requestExit = (code: number) => {
    exitRequested = code
  }
  const runtime = await bootProfile(manifest, {
    patches: values.patch ?? [],
    args: positionals,
    exit: (code) => {
      requestExit(code)
    },
    prepare(ctx) {
      ctx.provide('tianzhiaiHost', { paths, settings, credentials: new EnvironmentCredentials() })
    },
  })
  if (values.prompt !== undefined || values.demo) {
    const cancellation = new AbortController()
    const cancel = () => cancellation.abort(new Error('用户取消'))
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    try {
      if (values.demo) registerDemo(runtime.ctx)
      const result = await runPrompt(runtime.ctx, {
        sessionId: values.session ?? randomUUID(),
        text: values.prompt ?? '运行离线核心演示',
        ...(values.resume ? { resume: true } : {}),
        ...(values.demo
          ? { provider: 'fixture', model: 'fixture' }
          : values.model
            ? { model: values.model }
            : {}),
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(120000)]),
      })
      console.log(JSON.stringify(result))
      if (result.turnEndReason?.kind !== 'completed') process.exitCode = 1
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
      await runtime.dispose()
    }
    return
  }
  console.log(
    JSON.stringify({
      product: 'TIanZhiAi',
      profile: runtime.profile,
      host: publicHostIdentity(settings, paths.platform, 'local'),
      configuration: runtime.configuration,
      patches: runtime.patchPaths,
      entries: runtime.entries,
    }),
  )
  if (values.check || exitRequested !== undefined) {
    await runtime.dispose()
    process.exitCode = exitRequested ?? 0
    return
  }
  let stopping: Promise<void> | undefined
  const keepAlive = setInterval(() => {}, 30_000)
  const stop = (code = 0) => {
    if (stopping) return stopping
    clearInterval(keepAlive)
    stopping = runtime
      .dispose()
      .then(() => {
        process.exitCode = code
      })
      .finally(() => {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
        process.off('unhandledRejection', onFatal)
        process.off('uncaughtException', onFatal)
      })
    return stopping
  }
  const onSignal = () => {
    void stop().catch(onStopFailure)
  }
  const onFatal = () => {
    console.error('TIanZhiAi：运行异常，正在清理资源。')
    void stop(1).catch(onStopFailure)
  }
  const onStopFailure = () => {
    console.error('TIanZhiAi：资源清理未完成。')
    process.exit(1)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.on('unhandledRejection', onFatal)
  process.on('uncaughtException', onFatal)
  requestExit = (code) => {
    void stop(code).catch(onStopFailure)
  }
}

main().catch((error) => {
  console.error(
    redactDiagnostic(
      `TIanZhiAi：${error instanceof Error ? error.message : '启动失败'}`,
      activeSettings,
    ),
  )
  process.exitCode = 1
  // Cleanup has already had its bounded attempt. A failed plugin may still own
  // handles; give stderr time to drain, then force a failed CLI process to exit.
  setTimeout(() => process.exit(1), 250).unref()
})
