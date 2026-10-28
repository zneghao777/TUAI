import * as SearchTools from '@deepseek-ai/dsh-tool-fs-search'
import * as TodoTools from '@deepseek-ai/dsh-tool-todo'
import { realpathSync, existsSync, lstatSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sessionDir } from '@deepseek-ai/dsh-spill-local'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs'
import Attachments from '@deepseek-ai/dsh-attachment-local'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import * as FileTools from '@deepseek-ai/dsh-tool-fs'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import * as DirectoryTool from '@deepseek-ai/dsh-tool-working-directory'
import Bash from '@deepseek-ai/dsh-bash-sandbox'
import * as BashTool from '@deepseek-ai/dsh-tool-bash'
import Jobs from '@deepseek-ai/dsh-jobs-local'
import * as JobTools from '@deepseek-ai/dsh-tool-jobs'
import Terminals from '@deepseek-ai/dsh-terminal'
import * as TerminalBackend from '@deepseek-ai/dsh-terminal-bash'
import * as TerminalTools from '@deepseek-ai/dsh-tool-terminal'
import * as ShellEnvironment from '@deepseek-ai/dsh-shell-env'

/** Tighten upstream's read capability to this explicitly selected workspace. */
const toolOwner = new AsyncLocalStorage<ToolExecution>()
function within(root: string, path: string): boolean {
  const diff = relative(root, path)
  return diff !== '..' && !diff.startsWith('../') && !diff.startsWith('..\\') && !isAbsolute(diff)
}
class WorkspaceFileSystem extends SandboxedFileSystem {
  static override inject = ['sandboxPolicy', 'tianzhiaiHost']
  override async resolve(
    path: string,
    opts?: { cwd?: string; signal?: AbortSignal },
  ): Promise<FsTarget> {
    const exec = toolOwner.getStore()
    const agent = exec?.agent ?? this.ctx.get('agents')?.currentInitiator()
    const root = realpathSync(agent?.session.header.cwd ?? process.cwd())
    const target = await super.resolve(path, { ...opts, cwd: opts?.cwd ?? root })
    const physical = this.processPath(target)
    const paths = this.ctx.tianzhiaiHost.paths
    const privateRoots = [paths.config, paths.data, paths.state, paths.cache].map((root) =>
      realpathSync(root),
    )
    // A Host directory nested inside the workspace remains private. Otherwise
    // the development TIANZHIAI_HOME override would expose other sessions.
    const ownWorkspace = within(root, physical) && within(realpathSync(paths.data), root)
    const mode = this.ctx.sandboxPolicy.resolve(agent ? { session: agent.session } : {}).mode
    if (
      (!within(root, physical) && mode !== 'danger-full-access') ||
      (!ownWorkspace && privateRoots.some((privateRoot) => within(privateRoot, physical)))
    ) {
      const owner = agent?.id
      const ownDirectory = owner
        ? sessionDir(join(this.ctx.tianzhiaiHost.paths.artifacts, 'spill'), owner)
        : undefined
      if (ownDirectory && existsSync(ownDirectory) && !lstatSync(ownDirectory).isSymbolicLink()) {
        const ownSpill = realpathSync(ownDirectory)
        if (within(realpathSync(paths.artifacts), ownSpill) && within(ownSpill, physical))
          return target
      }
      throw new FsError('路径超出当前工作区授权范围', 'FS_SANDBOX_DENIED')
    }
    return target
  }
}

export async function mountHostTools(ctx: Context) {
  await ctx.plugin(SandboxPolicy, { mode: 'read-only', workspaceRoot: process.cwd() })
  await ctx.plugin(Sandbox, {})
  await ctx.plugin(WorkspaceFileSystem, { cwd: process.cwd() })
  await ctx.plugin(Attachments, { dshHome: ctx.tianzhiaiHost.paths.data })
  await ctx.plugin(WorkingDirectory)
  await ctx.plugin(FileTools, { read: true, readImage: true, write: true, edit: true })
  await ctx.plugin(DirectoryTool)
  await ctx.plugin(Subprocess)
  await ctx.plugin(SearchTools, { sampleOverCapGlobResults: true })
  await ctx.plugin(TodoTools, { allowParallelInProgress: true })
  await ctx.plugin(ShellEnvironment, { dshHome: ctx.tianzhiaiHost.paths.data })
  await ctx.plugin({
    name: 'tianzhiai-tool-owner',
    inject: ['tools', 'fs', 'workingDirectory'],
    apply(ctx: Context) {
      ctx.on('tools/execute', (exec, next) => toolOwner.run(exec, next))
      const searched = new WeakMap<ToolExecution, string>()
      ctx.on('tools/pre-execute', async (exec, next) => {
        if (!['glob', 'grep'].includes(exec.name)) return next()
        if (!exec.agent) return { kind: 'deny', reason: '搜索必须关联当前会话' }
        const args = exec.arguments
        if (
          typeof args !== 'object' ||
          args === null ||
          ('path' in args && typeof args.path !== 'string')
        )
          return { kind: 'deny', reason: '搜索路径不合法' }
        try {
          const agent = exec.agent
          await toolOwner.run(exec, async () => {
            const cwd = await ctx.workingDirectory.ensure(agent, exec.signal)
            await ctx.fs.resolve('path' in args ? String(args.path) : '.', {
              cwd,
              signal: exec.signal,
            })
          })
          searched.set(exec, JSON.stringify(args))
          return next()
        } catch (error) {
          return {
            kind: 'deny',
            reason: error instanceof Error ? error.message : '搜索目录校验失败',
          }
        }
      })
      ctx.tools.guard((exec) =>
        ['glob', 'grep'].includes(exec.name) &&
        searched.get(exec) !== JSON.stringify(exec.arguments)
          ? '搜索调用没有有效的目录授权'
          : undefined,
      )
    },
  })
  if (process.platform !== 'win32') {
    await ctx.plugin(Bash, {
      cwd: process.cwd(),
      timeoutMs: 15000,
      maxTimeoutMs: 30000,
      graceMs: 1000,
    })
    await ctx.plugin(Jobs)
    await ctx.plugin(JobTools, { maxConsecutiveWakes: 3 })
    await ctx.plugin(BashTool, { enableRunInBackground: true, promoteOnTimeout: true })
    await ctx.plugin(Terminals)
    await ctx.plugin(TerminalBackend, {})
    await ctx.plugin(TerminalTools, {})
  }
}
