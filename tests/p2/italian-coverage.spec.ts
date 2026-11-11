import { describe, expect, it } from 'vitest'
import { en as base0 } from '../../packages/client/ui-conversation/src/client/locales.ts'
import { en as base1 } from '../../packages/client/ui-chat/src/client/locale.ts'
import { en as base2 } from '../../packages/client/ui-commands/src/client/locales.ts'
import { en as base3 } from '../../packages/client/ui-file-drag/src/client/locales.ts'
import { en as base4 } from '../../packages/client/ui-goal/src/client/locales.ts'
import { en as base5 } from '../../packages/client/ui-input-trigger/src/client/locales.ts'
import { en as base6 } from '../../packages/client/ui-message-feedback/src/client/locales.ts'
import { en as base7 } from '../../packages/client/ui-model-selection/src/client/locales.ts'
import { en as base8 } from '../../packages/client/ui-reference/src/client/locales.ts'
import { en as base9 } from '../../packages/client/ui-sidebar-files/src/client/locales.ts'
import { en as base10 } from '../../packages/client/ui-workspace/src/client/locales.ts'
import { en as base11 } from '../../packages/client/ui-sidebar-documentpreview/src/client/locales.ts'
import { en as base12 } from '../../packages/client/ui-sidebar-documentpreview/src/client/code/locales.ts'
import { en as base13 } from '../../packages/client/ui-sidebar-documentpreview/src/client/excel/locales.ts'
import { en as base14 } from '../../packages/client/ui-sidebar-documentpreview/src/client/html/locales.ts'
import { en as base15 } from '../../packages/client/ui-sidebar-documentpreview/src/client/image/locales.ts'
import { en as base16 } from '../../packages/client/ui-sidebar-documentpreview/src/client/markdown/locales.ts'
import { en as base17 } from '../../packages/client/ui-sidebar-documentpreview/src/client/office/locales.ts'
import { en as base18 } from '../../packages/client/ui-sidebar-documentpreview/src/client/pdf/locales.ts'
import { en as base19 } from '../../packages/session/message-quotes/src/client/locales.ts'
import { en as base20 } from '../../packages/session-query/session-log-export/src/client/locales.ts'
import { en as base21 } from '../../packages/client/ui-layout/src/client/shortcut-locales.ts'
import { en as common } from '../../packages/client/locale/src/locales/index.ts'
import { en as approval } from '../../packages/client/ui-approval/src/client/locales.ts'
import { en as question } from '../../packages/client/ui-user-questions/src/client/locales.ts'
import { en as sidebar } from '../../packages/client/ui-sidebar/src/client/locales.ts'
import { en as sidebarRight } from '../../packages/client/ui-sidebar-right/src/client/locales.ts'
import {
  en as permission,
  accessEn,
} from '../../packages/client/ui-permission-presets/src/client/locales.ts'
import { en as theme } from '../../packages/client/ui-theme/src/client/locales.ts'
import { italianConversation } from '../../apps/web/src/model/italian-conversation'
import { italianChat } from '../../apps/web/src/model/italian-chat'
import { italianChatSettings } from '../../apps/web/src/model/italian-settings'
import { italianTheme } from '../../apps/web/src/model/italian-settings'
import { italianCommon } from '../../apps/web/src/model/italian-common'
import {
  italianApproval,
  italianQuestion,
  italianSidebar,
  italianSidebarRight,
} from '../../apps/web/src/model/italian-shell'
import {
  permissionSettingsIt,
  permissionAccessIt,
} from '../../apps/web/src/model/italian-permissions'
import { italianWorkspace } from '../../apps/web/src/model/italian-workspace'
import {
  italianCommand,
  italianFileDrag,
  italianGoal,
  italianSlashMenu,
  italianFeedback,
  italianModel,
  italianReference,
  italianSidebarFiles,
} from '../../apps/web/src/model/italian-ui-extra'
import {
  italianDocumentPreview,
  italianCodePreview,
  italianExcel,
  italianHtml,
  italianImage,
  italianMarkdown,
  italianOffice,
  italianPdf,
  italianQuotes,
  italianExport,
  italianLayoutShortcuts,
} from '../../apps/web/src/model/italian-preview'

const dictionaries: Array<[string, Record<string, string>, Record<string, string>]> = [
  ['common', common, italianCommon],
  ['approval', approval, italianApproval],
  ['question', question, italianQuestion],
  ['sidebar', sidebar, italianSidebar],
  ['sidebarRight', sidebarRight, italianSidebarRight],
  ['settings.permission', permission, permissionSettingsIt],
  ['permission.access', accessEn, permissionAccessIt],
  ['settings.theme', theme, italianTheme],
  ['conversation', base0, italianConversation],
  ['chat', base1, { ...italianChat, ...italianChatSettings }],
  ['command', base2, italianCommand],
  ['fileDrag', base3, italianFileDrag],
  ['goal', base4, italianGoal],
  ['slash.menu', base5, italianSlashMenu],
  ['feedback', base6, italianFeedback],
  ['model', base7, italianModel],
  ['reference', base8, italianReference],
  ['sidebarFiles', base9, italianSidebarFiles],
  ['workspace', base10, italianWorkspace],
  ['sidebarDocumentPreview', base11, italianDocumentPreview],
  ['sidebarCodePreview', base12, italianCodePreview],
  ['sidebarExcel', base13, italianExcel],
  ['documentHtml', base14, italianHtml],
  ['sidebarImage', base15, italianImage],
  ['documentMarkdown', base16, italianMarkdown],
  ['sidebarOffice', base17, italianOffice],
  ['sidebarPdf', base18, italianPdf],
  ['messageQuotes', base19, italianQuotes],
  ['session-log-download', base20, italianExport],
  ['shortcuts.layout', base21, italianLayoutShortcuts],
]

describe('Italian dictionary coverage', () => {
  it.each(dictionaries)(
    '%s includes every English key and preserves placeholders',
    (_namespace, base, italian) => {
      expect(Object.keys(italian).sort()).toEqual(Object.keys(base).sort())
      for (const [key, text] of Object.entries(base)) {
        const placeholders = (value: string) =>
          [...value.matchAll(/\{[^{}]+\}/g)].map((match) => match[0]).sort()
        expect(placeholders(italian[key]!), key).toEqual(placeholders(text))
      }
    },
  )
})
