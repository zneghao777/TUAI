import { join } from 'node:path'
import { realpathSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import Compaction from '@deepseek-ai/dsh-compaction-basic'
import * as ImageOffload from '@deepseek-ai/dsh-compaction-image-offload'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import * as Instructions from '@deepseek-ai/dsh-agent-instructions'
import FileReferences from '@deepseek-ai/dsh-file-reference-local'
import * as TimeContext from '@deepseek-ai/dsh-time-context'
import * as RepeatReminder from '@deepseek-ai/dsh-repeat-tool-reminder'
import * as TimeoutPolicy from '@deepseek-ai/dsh-tool-call-timeout-policy'
import SpillStore from '@deepseek-ai/dsh-spill-local'
import * as SpillPolicy from '@deepseek-ai/dsh-spill-policy'

export async function mountContext(ctx: Context) {
  await ctx.plugin(SpillStore, {
    root: join(ctx.tianzhiaiHost.paths.artifacts, 'spill'),
    cleanupPeriodDays: 0,
  })
  await ctx.plugin(SpillPolicy, { maxInlineTokens: 4096 })
  await ctx.plugin(TimeoutPolicy)
  await ctx.plugin(Compaction, { headroomTokens: 8192, maxTokens: 8192 })
  await ctx.plugin(Pruner, {})
  await ctx.plugin(ImageOffload)
  await ctx.plugin(Instructions, {
    maxBytes: 32768,
    projectRootBoundary: realpathSync(process.cwd()),
    projectRootFromSession: true,
  })
  await ctx.plugin(FileReferences, {
    maxEntries: 10000,
    excludedDirectories: ['.git', 'node_modules', 'lib', 'dist', '.runtime'],
  })
  await ctx.plugin(TimeContext, {})
  await ctx.plugin(RepeatReminder, {})
  await ctx.plugin({
    name: 'tianzhiai-step-budget',
    inject: ['agents'],
    apply(ctx: Context) {
      ctx.on('agent/pre-step', ({ agent }, next) => {
        const events = agent.session.snapshotEvents()
        const start = events.findLastIndex((event) => event.type === 'turn/start')
        if (events.slice(start).filter((event) => event.type === 'step/start').length >= 32) {
          throw new Error('单回合已达到 32 步上限；请检查执行记录后继续')
        }
        return next()
      })
    },
  })
}
