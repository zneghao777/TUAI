import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@tianzhiai/agent-runtime/skills'
import type {} from '@deepseek-ai/dsh-tools'
import type {
  SkillImport,
  SkillEdit,
  SkillMutation,
  SkillItem,
  SkillDetail,
  SkillFileRead,
  SkillFileValue,
  SkillPreview,
  SkillCompare,
  SkillFileChange,
} from '@tianzhiai/agent-runtime/skills'

/** Personal library management; admitted by the same authenticated Host Gateway. */
export class SkillLibraryRemote extends TypertRemoteService {
  static inject = ['skillLibrary', 'tools', 'typert']
  constructor(ctx: Context) {
    super(ctx, 'skillLibraryRemote', { namespace: 'skillLibrary' })
  }
  @Remote list(signal: AbortSignal): SkillItem[] {
    signal.throwIfAborted()
    return this.ctx.skillLibrary.store.list()
  }
  @Remote get(id: string, signal: AbortSignal): SkillDetail {
    signal.throwIfAborted()
    return this.ctx.skillLibrary.store.detail(id)
  }
  @Remote preview(request: SkillImport, signal: AbortSignal): SkillPreview {
    signal.throwIfAborted()
    return this.ctx.skillLibrary.store.preview(request)
  }
  @Remote compare(request: SkillCompare, signal: AbortSignal): SkillFileChange[] {
    signal.throwIfAborted()
    return this.ctx.skillLibrary.store.compare(request.id, request.from, request.to)
  }
  @Remote import(request: SkillImport): SkillItem {
    return this.ctx.skillLibrary.store.import(request)
  }
  @Remote createVersion(request: SkillEdit): SkillItem {
    return this.ctx.skillLibrary.store.edit(request)
  }
  @Remote check(request: SkillMutation): SkillItem {
    return this.ctx.skillLibrary.store.check(request, this.toolNames())
  }
  @Remote activate(request: SkillMutation): SkillItem {
    return this.ctx.skillLibrary.store.activate(request, this.toolNames())
  }
  @Remote disable(id: string, revision: number): SkillItem {
    return this.ctx.skillLibrary.store.disable(id, revision)
  }
  @Remote file(request: SkillFileRead, signal: AbortSignal): SkillFileValue {
    signal.throwIfAborted()
    return this.ctx.skillLibrary.store.file(request)
  }
  private toolNames() {
    return this.ctx.tools.definitions().map((tool) => tool.name)
  }
}
