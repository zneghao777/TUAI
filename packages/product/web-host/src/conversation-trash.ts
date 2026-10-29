import { Context, Service } from '@deepseek-ai/cordis'
import { defineDomain, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'

const spec = defineDomain({
  name: 'tianzhiai_conversation_trash',
  version: 1,
  global: { schema: z.object({ ids: z.array(z.string()) }), initial: { ids: [] } },
  tables: {},
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    conversationTrash: ConversationTrash
  }
}

/** Durable deletion is distinct from archival; user files and recovery logs stay on disk. */
export class ConversationTrash extends Service {
  static inject = ['storageDomain', 'workspaceRegistry']
  private domain!: Domain<typeof spec>
  private pending: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'conversationTrash')
  }

  protected async [Service.init]() {
    this.domain = await this.ctx.storageDomain.open(spec)
    this.ctx.effect(() => async () => {
      await this.pending
      await this.domain.close()
    })
  }

  has(id: SessionId): boolean {
    return this.domain.global.get().ids.includes(id)
  }

  delete(id: SessionId): Promise<void> {
    const operation = this.pending.then(async () => {
      if (this.has(id)) return
      // The existing archive seam stops turns, jobs and subagents and fences later deliveries.
      await this.ctx.workspaceRegistry.archiveSession(id, { stopActivity: true })
      // Already archived sessions also need cancellation on a repeated cleanup attempt.
      await this.ctx.parallel('workspace/session-stop', { sessionId: id })
      await this.domain.global.set({ ids: [...this.domain.global.get().ids, id] })
      this.ctx.emit('api-session/removed', id)
    })
    this.pending = operation.catch(() => {})
    return operation
  }
}
