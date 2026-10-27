import { realpathSync, existsSync, lstatSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sessionDir } from '@deepseek-ai/dsh-spill-local'
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
import * as ShellEnvironment from '@deepseek-ai/dsh-shell-env'

/** Tighten upstream's read capability to this explicitly selected workspace. */
const toolOwner = new AsyncLocalStorage<string>()
function within(root: string, path: string): boolean {
  const diff = relative(root, path)
  return diff !== '..' && !diff.startsWith('../') && !diff.startsWith('..\\') && !isAbsolute(diff)
}
class WorkspaceFileSystem extends SandboxedFileSystem {
  static override inject = ['sandboxPolicy', 'tianzhiaiHost']
  private readonly root = realpathSync(process.cwd())
  override async resolve(
    path: string,
    opts?: { cwd?: string; signal?: AbortSignal },
  ): Promise<FsTarget> {
    const target = await super.resolve(path, opts)
    const physical = this.processPath(target)
    const paths = this.ctx.tianzhiaiHost.paths
    const privateRoots = [paths.config, paths.data, paths.state, paths.cache].map((root) =>
      realpathSync(root),
    )
    // A Host directory nested inside the workspace remains private. Otherwise
    // the development TIANZHIAI_HOME override would expose other sessions.
    if (!within(this.root, physical) || privateRoots.some((root) => within(root, physical))) {
      const owner = toolOwner.getStore()
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
  await ctx.plugin(FileTools, { read: true, readImage: true, write: false, edit: false })
  await ctx.plugin(DirectoryTool)
  await ctx.plugin(Subprocess)
  await ctx.plugin(ShellEnvironment, { dshHome: ctx.tianzhiaiHost.paths.data })
  await ctx.plugin({
    name: 'tianzhiai-tool-owner',
    inject: ['tools'],
    apply(ctx: Context) {
      ctx.on('tools/execute', (exec, next) => toolOwner.run(exec.agent?.id ?? '', next))
    },
  })
  if (process.platform !== 'win32') {
    await ctx.plugin(Bash, {
      cwd: process.cwd(),
      timeoutMs: 15000,
      maxTimeoutMs: 30000,
      graceMs: 1000,
    })
    await ctx.plugin(BashTool, { enableRunInBackground: false, promoteOnTimeout: false })
  }
}
