/** Persistent product storage behind DSH's original settings controller and codec. */
import { readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
} from '@deepseek-ai/dsh-settings'
import { SettingsController, type SettingsProvider } from '@deepseek-ai/dsh-api-settings-controller'
import {
  CHAT_SETTINGS_NAMESPACE,
  ChatSettingsSchema,
  ChatSettingsFields,
} from '@deepseek-ai/dsh-client-ui-chat/src/chat-settings.ts'
import { z } from 'zod'

const namespace =
  brandString<import('@deepseek-ai/dsh-settings/types').SettingsNamespace>(CHAT_SETTINGS_NAMESPACE)
const storedSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  user: z.record(z.string(), z.unknown()),
})
const base = ChatSettingsSchema({ transcriptView: 'standard', linkOpening: 'new-tab' })

class ChatPreferences implements SettingsProvider {
  readonly writable = true
  private current: { revision: number; user: Record<string, unknown> } = { revision: 0, user: {} }
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly ctx: Context,
    readonly documentPath: string,
  ) {}
  async load() {
    try {
      this.current = storedSchema.parse(JSON.parse(await readFile(this.documentPath, 'utf8')))
      this.validate(this.current.user)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  describe(): SettingsDescriptor[] {
    return [
      {
        ns: namespace,
        autoGenerate: false,
        schema: ChatSettingsSchema.toJSON(),
        value: ChatSettingsSchema({ ...base, ...this.current.user }),
        base,
        user: { ...this.current.user },
        applies: 'live',
        secrets: [],
        revision: this.current.revision,
      },
    ]
  }
  async prepareDocument() {
    return this.documentPath
  }
  update(ns: string, patch: unknown, revision?: number) {
    return this.write(ns, revision, (current) => ({ ...current, ...this.section(patch) }))
  }
  replace(ns: string, section: unknown, revision?: number) {
    return this.write(ns, revision, () => this.section(section))
  }
  mutate(ns: string, ops: readonly SettingsPathOp[], revision?: number) {
    return this.write(ns, revision, (current) => {
      let next = { ...current }
      for (const op of ops) {
        if (op.path.length === 0) next = op.op === 'unset' ? {} : this.section(op.value)
        else {
          if (op.path.length !== 1 || !Object.hasOwn(ChatSettingsFields, op.path[0]!))
            throw new Error('不支持的对话偏好字段')
          const field = op.path[0]!
          if (op.op === 'unset') delete next[field]
          else next[field] = op.value
        }
      }
      return next
    })
  }
  private section(value: unknown): Record<string, unknown> {
    return z.record(z.string(), z.unknown()).parse(value)
  }
  private validate(user: Record<string, unknown>) {
    for (const field of Object.keys(user))
      if (!Object.hasOwn(ChatSettingsFields, field)) throw new Error('不支持的对话偏好字段')
    ChatSettingsSchema({ ...base, ...user })
  }
  private write(
    ns: string,
    revision: number | undefined,
    change: (value: Record<string, unknown>) => Record<string, unknown>,
  ) {
    const operation = this.pending.then(async () => {
      if (ns !== namespace) throw new Error('当前 Host 未启用该设置域')
      if (revision !== undefined && revision !== this.current.revision)
        throw new SettingsConflictError(namespace, revision, this.current.revision)
      const user = change(this.current.user)
      this.validate(user)
      const next = { revision: this.current.revision + 1, user }
      const temp = `${this.documentPath}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, JSON.stringify(next) + '\n', { mode: 0o600, flag: 'wx' })
        await rename(temp, this.documentPath)
      } finally {
        await unlink(temp).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
      this.current = next
      this.ctx.emit('settings/document-updated', namespace, next.revision)
    })
    this.pending = operation.catch(() => {})
    return operation
  }
  async dispose() {
    await this.pending
  }
}

export async function mountChatSettings(ctx: Context) {
  const provider = new ChatPreferences(
    ctx,
    join(ctx.tianzhiaiHost.paths.config, 'chat-preferences.json'),
  )
  await provider.load()
  ctx.effect(() => () => provider.dispose())
  await ctx.plugin({
    name: 'tianzhiai-chat-settings',
    apply(scope: Context) {
      new SettingsController(scope, {
        provider,
        mountCredentials: false,
        openTextFile: async () => {
          throw new Error('当前 Web Host 不提供原生设置文件打开')
        },
      })
    },
  })
}
