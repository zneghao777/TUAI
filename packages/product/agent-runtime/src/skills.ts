import { Context, Service } from '@deepseek-ai/cordis'
import { isAbsolute, join, relative } from 'node:path'
import { mkdir, mkdtemp, writeFile, realpath, lstat, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SkillRegistry, {
  type SkillViewOptions,
  type SkillDefinition,
  type SkillSummary,
} from '@deepseek-ai/dsh-skill'
import * as SkillTool from '@deepseek-ai/dsh-tool-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SkillStore } from './skills/store.ts'
export type * from './skills/types.ts'
export { SkillStore } from './skills/store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillLibrary: SkillLibrary
  }
}

export class SkillLibrary extends Service {
  static inject = ['tianzhiaiHost']
  readonly store: SkillStore
  private readonly copies = new WeakMap<Agent, Map<string, Promise<string>>>()
  constructor(ctx: Context) {
    super(ctx, 'skillLibrary')
    this.store = new SkillStore(join(ctx.tianzhiaiHost.paths.business, 'skills.sqlite3'))
    ctx.effect(() => () => this.store.close())
  }
  /** A session and its workspace-sharing forks may read registered copies. */
  ownsCopy(agent: Agent, path: string): boolean {
    if (!agent.session.header.cwd) return false
    const workspace = realpathSync(agent.session.header.cwd)
    for (const root of this.store.runtimeCopies(workspace)) {
      const part = relative(root, path)
      if (
        part === '' ||
        (part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part))
      )
        return true
    }
    return false
  }

  /** Materialize data in private runtime storage; never install or execute anything. */
  materialize(id: string, version: number, agent: Agent): Promise<string> {
    const key = JSON.stringify([id, version])
    let copies = this.copies.get(agent)
    if (!copies) {
      copies = new Map()
      this.copies.set(agent, copies)
    }
    const existing = copies.get(key)
    if (existing) return existing
    const pending = (async () => {
      if (!agent.session.header.cwd) throw new Error('技能资源需要当前会话工作区')
      const workspace = await realpath(agent.session.header.cwd)
      const cache = await realpath(this.ctx.tianzhiaiHost.paths.cache)
      const root = join(cache, 'skill-runtime')
      await mkdir(root, { recursive: true, mode: 0o700 })
      const info = await lstat(root)
      if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(root)) !== root)
        throw new Error('技能运行目录不合法')
      const directory = await mkdtemp(join(root, 'skill-'))
      try {
        const p = this.store.package(id, version)
        for (const file of p.files) {
          const parts = file.path.split('/')
          if (parts.length > 1)
            await mkdir(join(directory, ...parts.slice(0, -1)), { recursive: true, mode: 0o700 })
          await writeFile(join(directory, file.path), Buffer.from(file.data, 'base64'), {
            flag: 'wx',
            mode: 0o400,
          })
        }
        this.store.recordRuntimeCopy(workspace, directory)
      } catch (error) {
        await rm(directory, { recursive: true, force: true })
        throw error
      }
      return directory
    })()
    copies.set(key, pending)
    pending.catch(() => {
      if (copies.get(key) === pending) copies.delete(key)
    })
    return pending
  }
}

function turnOf(agent: Agent | undefined): number | undefined {
  if (!agent || agent.status !== 'running') return undefined
  const start = agent.session.snapshotEvents().findLast((e) => e.type === 'turn/start')
  return start?.seq
}
function summary(id: string, version: number, store: SkillStore): SkillSummary {
  const p = store.package(id, version)
  return {
    name: p.name,
    description: p.description,
    source: 'personal',
    provider: 'tuai',
    invocation: { modelInvocable: p.modelInvocable, userInvocable: p.userInvocable },
    resourceBase: {
      kind: 'opaque',
      description: `Skill version ${version}, sha256 ${p.digest}. Read packaged resources with skill_resource(name, path). Scripts are resources, never permission grants.`,
    },
  }
}

/** Reuse the DSH registry contract; product selection adds immutable per-turn versions. */
class ProductSkills extends SkillRegistry {
  static inject = ['skillLibrary', 'agents']
  private agent(options: SkillViewOptions): Agent | undefined {
    return this.ctx.agents.list().find((agent) => agent === options.scope)
  }
  private selected(options: SkillViewOptions) {
    const agent = this.agent(options)
    return this.ctx.skillLibrary.store.selection(agent?.id, turnOf(agent))
  }
  override async snapshot(options: SkillViewOptions = {}) {
    options.signal?.throwIfAborted()
    const base = await super.snapshot(options)
    const store = this.ctx.skillLibrary.store
    const values = new Map(base.skills.map((s) => [s.name, s]))
    for (const [id, version] of Object.entries(this.selected(options))) {
      if (!store.enabled(id)) continue
      const value = summary(id, version, store)
      values.set(value.name, value)
    }
    return {
      complete: base.complete,
      skills: [...values.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }
  }
  override async get(
    name: string,
    options: SkillViewOptions = {},
  ): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted()
    const store = this.ctx.skillLibrary.store
    const item = store.list().find((s) => s.name === name)
    if (!item) return super.get(name, options)
    const version = this.selected(options)[item.id]
    if (version === undefined || !item.enabled) return undefined
    const p = store.package(item.id, version)
    const agent = this.agent(options),
      turn = turnOf(agent)
    const directory = agent
      ? await this.ctx.skillLibrary.materialize(item.id, version, agent)
      : undefined
    options.signal?.throwIfAborted()
    if (!store.enabled(item.id)) return undefined
    if (agent && turn !== undefined) store.used(item.id, version, agent.id, turn)
    return {
      ...summary(item.id, version, store),
      ...(directory ? { resourceBase: { kind: 'directory' as const, path: directory } } : {}),
      content: p.body,
      metadata: { skillId: item.id, version, digest: p.digest },
    }
  }
}

export async function mountSkills(ctx: Context) {
  await ctx.plugin(SkillLibrary)
  await ctx.plugin(ProductSkills)
  await ctx.plugin(SkillTool)
  await ctx.plugin({
    name: 'tianzhiai-skill-resources',
    inject: ['tools', 'skills', 'skillLibrary'],
    apply(ctx: Context) {
      ctx.tools.register(
        defineTool({
          name: 'skill_resource',
          description:
            'Read one file packaged with an enabled skill at this turn’s frozen version. Does not execute scripts or grant tool permissions.',
          parameters: {
            name: { type: 'string', required: true },
            path: { type: 'string', required: true },
          },
          output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
          async execute(args, exec) {
            if (!exec.agent) throw new Error('技能资源读取需要当前会话')
            const item = ctx.skillLibrary.store.list().find((item) => item.name === args.name)
            const turn = turnOf(exec.agent)
            const visible = (
              await ctx.skills.list({ scope: exec.agent, signal: exec.signal })
            ).find((item) => item.name === args.name)
            if (
              !visible ||
              (!visible.invocation.modelInvocable &&
                (!item ||
                  turn === undefined ||
                  !ctx.skillLibrary.store.hasUse(item.id, exec.agent.id, turn)))
            )
              throw new Error('此技能需要用户在当前回合显式调用')
            const skill = await ctx.skills.get(args.name, {
              scope: exec.agent,
              signal: exec.signal,
            })
            if (
              !skill ||
              typeof skill.metadata?.skillId !== 'string' ||
              typeof skill.metadata.version !== 'number'
            )
              throw new Error('技能不可用')
            const file = ctx.skillLibrary.store.file({
              id: skill.metadata.skillId,
              version: skill.metadata.version,
              path: args.path,
            })
            if (file.text === null) throw new Error('此资源为二进制文件，请在技能页下载查看')
            if (Buffer.byteLength(file.text) > 128 * 1024)
              throw new Error('资源超过 128 KB，请拆分后再导入')
            return file.text
          },
        }),
      )
    },
  })
}
