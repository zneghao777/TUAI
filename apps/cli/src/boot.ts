/**
 * Adapted from DSH app-boot at 22ddee3 (MIT, provenance/DSH-LICENSE).
 * Retains Loader → Include → Patch → Group and disposal order.
 * Differences: explicit profiles, no DSH_HOME or dynamic bundle installation,
 * all enabled P0 plugins required, bounded startup and cleanup.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, FiberState } from '@deepseek-ai/cordis'
import Loader, { type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import Include, { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import Group from '@deepseek-ai/cordis-plugin-group'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { load } from 'js-yaml'
import { z } from 'zod'

const profileSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  config: z.string().min(1),
  patches: z.array(z.string().min(1)),
})

export interface BootOptions {
  patches?: readonly string[]
  args?: readonly string[]
  timeoutMs?: number
  prepare?: (ctx: Context) => void | Promise<void>
  exit?: (code: number) => void
}

export async function bounded<T>(
  work: Promise<T>,
  label: string,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时`)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function bootProfile(manifestPath: string, options: BootOptions = {}) {
  const filename = resolve(manifestPath)
  const profile = profileSchema.parse(JSON.parse(await readFile(filename, 'utf8')))
  const configPath = resolve(dirname(filename), profile.config)
  const patchPaths = [
    ...profile.patches.map((path) => resolve(dirname(filename), path)),
    ...(options.patches ?? []).map((path) => resolve(path)),
  ]
  const patches: PatchOptions[] = []
  for (const path of patchPaths) {
    const value: unknown = load(await readFile(path, 'utf8'), { schema: entryListSchema })
    const rows = z
      .array(
        z.strictObject({
          insert: z.array(
            z.strictObject({
              id: z.string().min(1),
              name: z.string().min(1),
              config: z.unknown().optional(),
              disabled: z.boolean().optional(),
            }),
          ),
        }),
      )
      .parse(value)
    patches.push(
      ...rows.map((row) => ({
        insert: row.insert.map((entry) => ({
          id: entry.id,
          name: entry.name,
          config: entry.config,
          ...(entry.disabled === undefined ? {} : { disabled: entry.disabled }),
        })),
      })),
    )
  }
  const ctx = new Context()
  const limit = options.timeoutMs ?? 5000
  try {
    ctx.baseUrl = pathToFileURL(dirname(configPath) + '/').href
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.group = Group
    provideCmdline(ctx, { args: options.args ?? [], exit: options.exit ?? (() => {}) })
    await bounded(
      (async () => {
        await options.prepare?.(ctx)
        const rootInclude: EntryOptions = {
          id: 'include',
          name: 'cordis:include',
          config: { path: pathToFileURL(configPath).href, patches },
        }
        await ctx.loader.create(rootInclude)
        await ctx.loader.await()
        const failures = [...ctx.loader.entries()].filter(
          (entry) => !entry.disabled && entry.fiber?.state !== FiberState.ACTIVE,
        )
        if (failures.length) {
          const details: string[] = []
          for (const entry of failures) {
            let reason = '模块未加载或依赖服务未就绪'
            if (entry.fiber?.state === FiberState.FAILED) {
              try {
                await entry.fiber.await()
              } catch (error) {
                reason = error instanceof Error ? error.message : '插件加载失败'
              }
            }
            details.push(`${entry.id} (${entry.options.name})：${reason}`)
          }
          throw new Error(`Profile 插件未就绪：${details.join('; ')}`)
        }
      })(),
      'Profile 启动',
      limit,
    )
    const entries = [...ctx.loader.entries()].map((entry) => ({
      id: entry.id,
      module: entry.options.name,
      enabled: !entry.disabled,
      state: entry.fiber?.state,
    }))
    return {
      ctx,
      profile: profile.name,
      configuration: configPath,
      patchPaths,
      entries,
      dispose: () => bounded(ctx.fiber.dispose(), 'Profile 退出', limit),
    }
  } catch (error) {
    await bounded(ctx.fiber.dispose(), '启动失败清理', limit)
    throw error
  }
}
