import type {
  BrowserObservation,
  BrowserPage,
  CheckedAction,
  EgoCapabilities,
  PanelInput,
  Viewport,
} from '@tuai/ego-connector/types'
export type {
  BrowserObservation,
  BrowserPage,
  CheckedAction,
  EgoCapabilities,
  PanelInput,
  Viewport,
}
export interface BrowserSnapshot {
  id: string
  hostId: string
  ownerId: string
  sessionId: string
  taskId: string
  executionId: string
  fence: number
  leaseUntil: number
  connectorId: string
  profileGrantId: string
  controlConnectionId?: string
  spaceId?: number
  lifecycle: 'starting' | 'open' | 'closing' | 'closed' | 'error'
  controller: 'agent' | 'human' | 'none'
  egoState: 'agent' | 'native-human' | 'unknown'
  revision: number
  controlEpoch: number
  waitEventId: number
  waitReason?: string
  pageId: string
  pages: BrowserPage[]
  viewport: Viewport
  capabilities: EgoCapabilities
  needsReconciliation: boolean
  taskStatus: string
  error?: string
  transaction?: TransactionView
}
export interface BrowserGate {
  browserId: string
  executionId: string
  fence: number
  controlEpoch: number
}
export interface ActionRequest extends BrowserGate {
  operationId: string
  observationId: string
  action: CheckedAction
}
export interface ControlRequest {
  browserId: string
  requestId: string
  expectedRevision: number
  controlEpoch: number
  connectionId: string
  pageId?: string
  action: 'take' | 'return' | 'native-handoff' | 'reconnect' | 'cancel' | 'switch-page'
}
export interface InputEnvelope {
  browserId: string
  pageId: string
  connectionId: string
  controlEpoch: number
  sequence: number
  viewportVersion: number
  input: PanelInput
}
export interface TransactionSummary {
  merchant: string
  itinerary: string
  dataScope: string
  amount: string
  currency: string
  terms: string
  action: string
}
export interface TransactionView {
  id: string
  version: number
  digest: string
  summary: TransactionSummary
  state:
    | 'awaiting_confirmation'
    | 'approved'
    | 'submitted'
    | 'unknown'
    | 'reconciled'
    | 'invalidated'
    | 'rejected'
  expiresAt: number
  operationId: string
  result?: {
    orderId: string
    orderState: string
    paid: boolean
    ticketed: boolean
    evidenceDigest: string
  }
}
export interface ApprovalRequest {
  browserId: string
  transactionId: string
  version: number
  digest: string
  decision: 'approve' | 'reject'
  requestId: string
  expectedRevision: number
  controlEpoch: number
}
export interface ReviewDecision {
  kind: 'read' | 'local_change' | 'external_submit' | 'sensitive' | 'unsupported'
  reason: string
  evidenceQuotes: string[]
  summary?: TransactionSummary
}
export interface OperationReceipt {
  id: string
  status: 'executed' | 'rejected' | 'unknown' | 'awaiting_confirmation'
  browserId: string
  transactionId?: string
  receipt?: string
  artifactId?: string
}
export interface BrowserFollowFrame {
  browsers: BrowserSnapshot[]
}
export interface BrowserArtifact {
  id: string
  browserId: string
  sessionId: string
  name: string
  bytes: number
  mediaType: string
}
