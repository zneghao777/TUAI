/** Public, credential-free facts of this P2 Host. */
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
