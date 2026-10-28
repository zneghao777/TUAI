/** Product directory policy; DSH remains the owner of Workspace and Session state. */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { mkdir, lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionCreateRequest } from '@deepseek-ai/dsh-api-session-controller'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import SessionController from '@deepseek-ai/dsh-api-session-controller'
import WorkspaceController from '@deepseek-ai/dsh-api-workspace-controller'

export class ManagedSessionController extends SessionController {
  constructor(ctx: Context) {
    super(
      ctx,
      { nativeOpen: false },
      {
        prepareCreate: async (request): Promise<SessionCreateRequest> => {
          if (request.cwd !== undefined || request.workspaceId !== undefined)
            throw new RemoteError('gateway/bad-request', '新会话使用自动创建的独立工作区', {})
          const id = request.sessionId ?? SessionId(randomUUID())
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
            throw new RemoteError('gateway/bad-request', '会话标识不合法', {})
          const root = join(ctx.tianzhiaiHost.paths.data, 'workspaces')
          await mkdir(root, { recursive: true, mode: 0o700 })
          if ((await lstat(root)).isSymbolicLink()) throw new Error('工作区根目录不可为符号链接')
          const directory = join(await realpath(root), id)
          await mkdir(directory, { mode: 0o700 }).catch((error) => {
            if (error?.code !== 'EEXIST') throw error
          })
          if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
            throw new Error('工作区目录不合法')
          const workspace = await ctx.workspaceRegistry.create(directory, '新会话')
          return { ...request, sessionId: id, workspaceId: workspace.id }
        },
      },
    )
  }
}

/** Keep original archive/pin/feed contracts; custom directory management is not exposed. */
export class ManagedWorkspaceController extends WorkspaceController {
  override async create(): Promise<never> {
    throw new RemoteError('gateway/bad-request', '工作区由新会话自动创建', {})
  }
  override async initializeDefault() {
    return undefined
  }
}
