import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import Approval from '@deepseek-ai/dsh-user-approval'
import Questions from '@deepseek-ai/dsh-user-questions'
import * as AskUser from '@deepseek-ai/dsh-tool-ask-user'
import PermissionPresets from '@deepseek-ai/dsh-permission-presets'

export async function mountPermissions(ctx: Context) {
  await ctx.plugin(Approval, { policy: 'ask' })
  await ctx.plugin(Questions)
  await ctx.plugin(AskUser, { mode: 'legacy' })
  if (process.platform !== 'win32')
    await ctx.plugin(PermissionPresets, {
      presets: {
        readonly: { sandbox: 'read-only', approval: 'ask', name: '仅可查看' },
        'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: '工作区内修改' },
        'full-access': { sandbox: 'danger-full-access', approval: 'never', name: '完全权限' },
      },
      defaultPreset: ctx.tianzhiaiHost.settings.defaultPermissionPreset ?? 'readonly',
    })
  await ctx.plugin({
    name: 'tianzhiai-final-tool-permissions',
    inject: ['tools', 'approval', 'sandboxPolicy'],
    apply(ctx: Context) {
      const grants = new WeakMap<
        ToolExecution,
        { id: string; arguments: string; expiresAt: number }
      >()
      ctx.on('tools/pre-execute', async (exec, next) => {
        if (!['bash', 'terminal_open', 'terminal_send'].includes(exec.name)) return next()
        if (!exec.agent) return { kind: 'deny', reason: 'Shell 操作必须关联当前 Agent 和会话' }
        if (ctx.sandboxPolicy.resolve({ session: exec.agent.session }).mode !== 'read-only')
          return next()
        const expiresAt = Date.now() + 30000
        const answer = await ctx.approval.request({
          agent: exec.agent,
          toolName: exec.name,
          callId: exec.callId,
          reason: `请求在只读沙箱内执行当前 Shell 调用：${JSON.stringify(exec.arguments)}`,
          signal: AbortSignal.any([exec.signal, AbortSignal.timeout(30000)]),
        })
        if (exec.signal.aborted || answer === 'cancelled') return { kind: 'cancel' }
        if (answer !== 'allowed-once')
          return { kind: 'deny', reason: `Shell 审批未通过：${answer}` }
        grants.set(exec, {
          id: exec.agent.id,
          arguments: JSON.stringify(exec.arguments),
          expiresAt,
        })
        return next()
      })
      // This runs after extensible policy. Skipping an approval listener cannot
      // turn an unapproved call into an executable invocation.
      ctx.tools.guard((exec) => {
        if (!['bash', 'terminal_open', 'terminal_send', 'write', 'edit'].includes(exec.name))
          return undefined
        if (!exec.agent) return '工具执行必须关联当前会话'
        if (!['bash', 'terminal_open', 'terminal_send'].includes(exec.name)) return undefined
        if (ctx.sandboxPolicy.resolve({ session: exec.agent.session }).mode !== 'read-only')
          return undefined
        const args = exec.arguments
        const grant = grants.get(exec)
        if (
          !grant ||
          grant.id !== exec.agent?.id ||
          grant.arguments !== JSON.stringify(args) ||
          Date.now() >= grant.expiresAt ||
          exec.signal.aborted
        ) {
          return '当前 Shell 调用没有有效的一次性批准'
        }
        return undefined
      })
    },
  })
}
