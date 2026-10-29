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
import type {} from '@deepseek-ai/dsh-permission-presets'
import Schema from '@deepseek-ai/schemastery'
import {
  ConversationSettingsSchema,
  ConversationSettingsFields,
} from '@deepseek-ai/dsh-client-ui-conversation/src/submission-settings.ts'
import {
  appearanceBootInjections,
  ProductAppearanceSchema,
  validateAppearance,
} from './appearance.ts'

type Namespace = import('@deepseek-ai/dsh-settings/types').SettingsNamespace
interface PreferenceDefinition {
  ns: Namespace
  schema: SettingsDescriptor['schema']
  base: Record<string, unknown>
  fields: readonly string[]
  validate(value: Record<string, unknown>): void
}
const definitions: PreferenceDefinition[] = [
  {
    ns: brandString<Namespace>(CHAT_SETTINGS_NAMESPACE),
    schema: ChatSettingsSchema.toJSON(),
    base: ChatSettingsSchema({ transcriptView: 'standard', linkOpening: 'new-tab' }),
    fields: Object.keys(ChatSettingsFields),
    validate: (value) => {
      ChatSettingsSchema(value)
    },
  },
  {
    ns: brandString<Namespace>('ui-conversation'),
    schema: ConversationSettingsSchema.toJSON(),
    base: { ...ConversationSettingsSchema({}) },
    fields: Object.keys(ConversationSettingsFields),
    validate: (value) => {
      ConversationSettingsSchema(value)
    },
  },
  {
    ns: brandString<Namespace>('ui-theme'),
    schema: ProductAppearanceSchema.toJSON(),
    base: {
      ...Schema.resolve(
        { preference: 'light', fontSize: 15, codeFontSize: 12 },
        ProductAppearanceSchema,
        {},
      )[0],
    },
    fields: Object.keys(Schema.resolve({}, ProductAppearanceSchema, {})[0]),
    validate: (value) => {
      validateAppearance(value)
    },
  },
]
const storedSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  user: z.record(z.string(), z.unknown()),
})

class ChatPreferences implements SettingsProvider {
  readonly writable = true
  private current: { revision: number; user: Record<string, unknown> } = { revision: 0, user: {} }
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly ctx: Context,
    readonly documentPath: string,
    private readonly definition: PreferenceDefinition,
  ) {}
  async load() {
    try {
      this.current = storedSchema.parse(JSON.parse(await readFile(this.documentPath, 'utf8')))
      // Read compatibility only: a nonempty pre-palette document used the forest theme.
      // Keep the file and revision untouched until the user explicitly saves again.
      if (
        this.definition.ns === 'ui-theme' &&
        !Object.hasOwn(this.current.user, 'palette') &&
        Object.keys(this.current.user).length > 0
      ) {
        this.current = { ...this.current, user: { ...this.current.user, palette: 'forest' } }
      }
      if (
        this.definition.ns === 'permission' &&
        this.current.user.defaultPreset === 'workspace-write'
      ) {
        this.current = {
          revision: this.current.revision + 1,
          user: { ...this.current.user, defaultPreset: 'readonly' },
        }
        const temporary = `${this.documentPath}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(this.current) + '\n', {
            flag: 'wx',
            mode: 0o600,
            flush: true,
          })
          await rename(temporary, this.documentPath)
        } finally {
          await unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT') throw error
          })
        }
      }
      this.validate(this.current.user)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  describe(): SettingsDescriptor[] {
    return [
      {
        ns: this.definition.ns,
        autoGenerate: false,
        schema: this.definition.schema,
        value: { ...this.definition.base, ...this.current.user },
        base: this.definition.base,
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
          if (op.path.length !== 1 || !this.definition.fields.includes(op.path[0]!))
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
      if (!this.definition.fields.includes(field)) throw new Error('不支持的对话偏好字段')
    this.definition.validate({ ...this.definition.base, ...user })
  }
  private write(
    ns: string,
    revision: number | undefined,
    change: (value: Record<string, unknown>) => Record<string, unknown>,
  ) {
    const operation = this.pending.then(async () => {
      if (ns !== this.definition.ns) throw new Error('当前 Host 未启用该设置域')
      if (revision !== undefined && revision !== this.current.revision)
        throw new SettingsConflictError(this.definition.ns, revision, this.current.revision)
      const user = change(this.current.user)
      // Pin the current default on the first save so a new font-only document is
      // distinguishable from legacy documents on the next Host start. Empty means reset.
      if (
        this.definition.ns === 'ui-theme' &&
        !Object.hasOwn(user, 'palette') &&
        Object.keys(user).length > 0
      ) {
        user.palette = this.definition.base.palette
      }
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
      this.ctx.emit('settings/document-updated', this.definition.ns, next.revision)
    })
    this.pending = operation.catch(() => {})
    return operation
  }
  async dispose() {
    await this.pending
  }
}

export async function mountChatSettings(ctx: Context) {
  const permission: PreferenceDefinition = {
    ns: brandString<Namespace>('permission'),
    schema: Schema.object({
      defaultPreset: Schema.union(['readonly', 'full-access']).required(),
    }).toJSON(),
    base: {
      defaultPreset:
        ctx.tianzhiaiHost.settings.defaultPermissionPreset === 'full-access'
          ? 'full-access'
          : 'readonly',
    },
    fields: ['defaultPreset'],
    validate: (value) => {
      z.strictObject({
        defaultPreset: z.enum(['readonly', 'full-access']),
      }).parse(value)
    },
  }
  const sections = [...definitions, permission].map(
    (definition) =>
      new ChatPreferences(
        ctx,
        join(
          ctx.tianzhiaiHost.paths.config,
          definition.ns === CHAT_SETTINGS_NAMESPACE
            ? 'chat-preferences.json'
            : `${definition.ns}-preferences.json`,
        ),
        definition,
      ),
  )
  for (const section of sections) await section.load()
  ctx.on('webserver/index-inject', (table) => {
    const appearance = sections.find((section) => section.describe()[0]?.ns === 'ui-theme')
    if (appearance) {
      const settings = validateAppearance(
        z.record(z.string(), z.unknown()).parse(appearance.describe()[0]!.value),
      )
      table.push(...appearanceBootInjections(settings))
    }
  })
  const permissionSection = sections.find((section) => section.describe()[0]?.ns === 'permission')!
  ctx.effect(() =>
    ctx.permissionPresets.useDefaultSettings(() => {
      const value = permissionSection.describe()[0]!.value
      return z.object({ defaultPreset: z.string() }).parse(value)
    }),
  )
  ctx.effect(() => async () => {
    for (const section of sections) await section.dispose()
  })
  const sectionOf = (ns: string) => {
    const section = sections.find((section) => section.describe()[0]?.ns === ns)
    if (!section) throw new Error('当前 Host 未启用该设置域')
    return section
  }
  const provider: SettingsProvider = {
    writable: true,
    describe: () => sections.flatMap((section) => section.describe()),
    prepareDocument: () => sections[0]!.prepareDocument(),
    update: (ns, patch, rev) => sectionOf(ns).update(ns, patch, rev),
    replace: (ns, value, rev) => sectionOf(ns).replace(ns, value, rev),
    mutate: (ns, ops, rev) => sectionOf(ns).mutate(ns, ops, rev),
  }
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
