import * as Quotes from '@deepseek-ai/dsh-message-quotes/client'
import * as Permissions from '@deepseek-ai/dsh-client-ui-permission-presets/client'
import * as Goal from '@deepseek-ai/dsh-client-ui-goal/client'
import * as Export from '@deepseek-ai/dsh-session-log-export/client'
import * as Feedback from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import goalRemote from '@deepseek-ai/dsh-goal/remote'
import feedbackRemote from '@deepseek-ai/dsh-command-feedback/remote'
import messageFeedbackRemote from '@deepseek-ai/dsh-message-feedback/remote'
import type { Context } from '@deepseek-ai/cordis'
import * as Conversation from '@deepseek-ai/dsh-client-ui-conversation/client'
import { mountChat, type ChatHostActions } from '@deepseek-ai/dsh-client-ui-chat/client'
import * as Tool from '@deepseek-ai/dsh-client-ui-tool/client'
import * as FileDrag from '@deepseek-ai/dsh-client-ui-file-drag/client'
import * as Attachments from '@deepseek-ai/dsh-client-ui-attachment/client'
import * as Settings from '@deepseek-ai/dsh-client-ui-settings/client'
import * as Theme from '@deepseek-ai/dsh-client-ui-theme/client'
import * as Layout from '@deepseek-ai/dsh-client-ui-layout/client'
import * as Workspace from '@deepseek-ai/dsh-client-ui-workspace/client'
import * as Sidebar from '@deepseek-ai/dsh-client-ui-sidebar/client'
import * as Triggers from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import * as Commands from '@deepseek-ai/dsh-client-ui-commands/client'
import * as Models from '@deepseek-ai/dsh-client-ui-model-selection/client'
import * as Approval from '@deepseek-ai/dsh-client-ui-approval/client'
import * as Questions from '@deepseek-ai/dsh-client-ui-user-questions/client'
import * as References from '@deepseek-ai/dsh-client-ui-reference/client'
import * as Resources from '@deepseek-ai/dsh-client-resources/client'
import * as Right from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import * as Files from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import * as Preview from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import * as WorkspaceFiles from '@deepseek-ai/dsh-api-workspace-files/client'
import settingsRemote from '@deepseek-ai/dsh-api-settings-controller/remote'
import filesRemote from '@deepseek-ai/dsh-api-workspace-files/remote'
import sessionReferences from '@deepseek-ai/dsh-session-reference/remote'

/** Original production assemblies share the existing Session and generated Remote owners. */
export async function mountChatRuntime(ctx: Context, actions: ChatHostActions) {
  for (const remote of [
    settingsRemote,
    filesRemote,
    sessionReferences,
    goalRemote,
    feedbackRemote,
    messageFeedbackRemote,
  ])
    await ctx.remote.$mount(remote)
  await ctx.plugin(Settings)
  await ctx.plugin(Theme)
  await ctx.plugin(Layout)
  await ctx.plugin(Workspace, { managedSessions: true })
  await ctx.plugin(Sidebar)
  await ctx.plugin(FileDrag)
  await ctx.plugin(Conversation, {
    managedWorkspaces: true,
    persistDraftUploads: true,
    approvalInput: true,
  })
  mountChat(ctx, actions)
  await ctx.plugin(Tool)
  await ctx.plugin(Attachments)
  await ctx.plugin(Resources)
  await ctx.plugin(WorkspaceFiles)
  await ctx.plugin(Right)
  await ctx.plugin(Files)
  await ctx.plugin(Preview)
  await ctx.plugin(Triggers)
  await ctx.plugin(Commands)
  await ctx.plugin(Models)
  await ctx.plugin(References)
  await ctx.plugin(Quotes)
  await ctx.plugin(Approval)
  await ctx.plugin(Questions)
  await ctx.plugin(Permissions)
  await ctx.plugin(Goal)
  await ctx.plugin(Export)
  await ctx.plugin(Feedback)
}
