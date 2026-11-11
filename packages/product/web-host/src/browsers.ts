import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@tuai/browser-service'
import type {
  ApprovalRequest,
  BrowserFollowFrame,
  BrowserSnapshot,
  ControlRequest,
} from '@tuai/browser-service/types'

/** Owner-only browser domain. Media and input use the same caller/resource check. */
export class BrowserRemote extends TypertRemoteService {
  static inject = ['browsers', 'conversationTrash']
  constructor(ctx: Context) {
    super(ctx, 'browserRemote', { namespace: 'browsers' })
  }
  private caller(sessionId: string) {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner')
      throw new Error('BROWSER_OWNER_REQUIRED')
    if (this.ctx.conversationTrash.has(sessionId as import('@deepseek-ai/dsh-session').SessionId))
      throw new Error('BROWSER_NOT_FOUND')
    return { ownerId: this.ctx.browsers.ownerId, sessionId }
  }
  @Remote list(sessionId: string): BrowserSnapshot[] {
    return this.ctx.browsers.list(this.caller(sessionId))
  }
  @Remote({ mode: 'stream' })
  async *follow(sessionId: string, signal: AbortSignal): AsyncIterable<BrowserFollowFrame> {
    const caller = this.caller(sessionId)
    let dirty = true,
      wake: (() => void) | undefined
    const changed = () => {
      dirty = true
      wake?.()
      wake = undefined
    }
    const off = this.ctx.browsers.onChange(changed)
    signal.addEventListener('abort', changed, { once: true })
    try {
      while (!signal.aborted) {
        if (dirty) {
          dirty = false
          yield { browsers: this.ctx.browsers.list(caller) }
        }
        if (!dirty)
          await new Promise<void>((resolve) => {
            wake = resolve
            if (signal.aborted || dirty) {
              wake = undefined
              resolve()
            }
          })
      }
    } finally {
      off()
      signal.removeEventListener('abort', changed)
    }
  }
  @Remote({ mode: 'stream' })
  async *overview(signal: AbortSignal): AsyncIterable<BrowserFollowFrame> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner')
      throw new Error('BROWSER_OWNER_REQUIRED')
    let dirty = true,
      wake: (() => void) | undefined
    const changed = () => {
        dirty = true
        wake?.()
        wake = undefined
      },
      off = this.ctx.browsers.onChange(changed)
    signal.addEventListener('abort', changed, { once: true })
    try {
      while (!signal.aborted) {
        if (dirty) {
          dirty = false
          yield {
            browsers: this.ctx.browsers
              .forOwner(this.ctx.browsers.ownerId)
              .filter(
                (browser) =>
                  !this.ctx.conversationTrash.has(
                    browser.sessionId as import('@deepseek-ai/dsh-session').SessionId,
                  ),
              ),
          }
        }
        if (!dirty)
          await new Promise<void>((resolve) => {
            wake = resolve
            if (dirty || signal.aborted) {
              wake = undefined
              resolve()
            }
          })
      }
    } finally {
      off()
      signal.removeEventListener('abort', changed)
    }
  }
  @Remote async control(sessionId: string, request: ControlRequest): Promise<BrowserSnapshot> {
    const caller = this.caller(sessionId)
    return this.ctx.browsers.control(caller, request, this.ctx.invocation!.peer.id)
  }
  @Remote async approve(
    sessionId: string,
    request: ApprovalRequest,
    signal: AbortSignal,
  ): Promise<BrowserSnapshot> {
    return this.ctx.browsers.approve(this.caller(sessionId), request, signal)
  }
}
