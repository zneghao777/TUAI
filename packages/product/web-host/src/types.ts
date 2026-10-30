/** Public, credential-free facts of this P2 Host. */
import type { ThemeSettings } from '@deepseek-ai/dsh-client-ui-theme/src/theme-settings.ts'

/** Product palette identity, independent of the existing light/dark preference. */
export type ThemePalette = 'white' | 'forest' | 'dawn'

/** Host-owned appearance document; older documents inherit the forest palette. */
export interface ProductAppearanceSettings extends ThemeSettings {
  palette: ThemePalette
}

export type {
  ModelProviderDraft,
  ManagedModel,
  ModelProviderInfo,
  ModelProvidersState,
  SaveModelProvider,
  RemoveModelProvider,
  ModelConnectionTest,
  ModelConnectionResult,
} from '@tianzhiai/agent-runtime/types'

export interface HostStatus {
  /** Stable Host identity. */
  id: string
  /** Protocol combination accepted by this product. */
  protocolVersion: number
  /** Host operating system. */
  os: string
  /** Explicitly selected execution workspace. */
  workspace: string
  /** Whether the configured model credential is available. */
  modelConfigured: boolean
}

/** One downloadable object authorized by its owning Session. */
export interface ArtifactInfo {
  /** Opaque Session-scoped identifier. */
  id: string
  /** Display name; never a client filesystem path. */
  name: string
  /** Persisted byte count. */
  bytes: number
  /** Safe response media type. */
  mediaType: string
}

/** A workspace output or an image referenced by a sent user message. */
export interface LibraryFile {
  sessionId: import('@deepseek-ai/dsh-session').SessionId
  source: 'workspace' | 'attachment'
  path: string
  artifactId?: string
  name: string
  kind: 'document' | 'image'
  bytes: number
  createdAt: number | null
  version: string
}
export type {
  SkillPreview,
  SkillCompare,
  SkillFileChange,
  SkillImport,
  SkillEdit,
  SkillMutation,
  SkillItem,
  SkillVersion,
  SkillDetail,
  SkillFileRead,
  SkillFileValue,
} from '@tianzhiai/agent-runtime/skills'
