/** Public model settings. Secrets are write-only and never part of a snapshot. */
export interface ManagedModel {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
}
export interface ModelProviderDraft {
  id: string
  name: string
  baseURL: string
  models: ManagedModel[]
}
export interface ModelProviderInfo extends ModelProviderDraft {
  builtin: boolean
  configured: boolean
  credentialSource?: string
}
export interface ModelProvidersState {
  revision: number
  providers: ModelProviderInfo[]
}
export interface SaveModelProvider {
  revision: number
  provider: ModelProviderDraft
  apiKey?: string
}
export interface RemoveModelProvider {
  revision: number
  id: string
}
export interface ModelConnectionTest {
  provider: ModelProviderDraft
  apiKey?: string
}
export interface ModelConnectionResult {
  ok: boolean
  message: string
  latencyMs: number
}
