export interface EgoCapabilities {
  available: boolean
  cliVersion: string
  browserVersion: string
  semantic: boolean
  png: boolean
  directInput: boolean
  nativeHandoff: boolean
  downloads: boolean
}
export interface BrowserPage {
  id: string
  title: string
  url: string
  openedBy: string
}
export interface Viewport {
  width: number
  height: number
  dpr: number
  version: number
}
export interface BrowserObservation {
  id: string
  pageId: string
  url: string
  title: string
  text: string
  fingerprint: string
  refs: {
    id: string
    signature: string
    role: string
    description: string
    bounds?: { x: number; y: number; width: number; height: number }
    sensitive?: boolean
    checked?: boolean
    disabled?: boolean
  }[]
  truncated: boolean
  viewport: Viewport
  observedAt: number
}
export interface MediaFrame {
  pageId: string
  frameId: number
  streamEpoch: number
  captureAt: number
  receivedAt: number
  pixelWidth: number
  pixelHeight: number
  viewport: Viewport
  format: 'png'
}
export interface CheckedAction {
  kind:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'select'
    | 'check'
    | 'key'
    | 'scroll'
    | 'wait'
    | 'switch'
    | 'download'
    | 'point'
  pageId: string
  observationId?: string
  ref?: string
  value?: string
  url?: string
  key?: string
  checked?: boolean
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
}
export interface PanelInput {
  type: 'mouse' | 'wheel' | 'text' | 'key' | 'copy' | 'cut' | 'release' | 'composition'
  x?: number
  y?: number
  event?: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'rawKeyDown' | 'keyUp'
  button?: 'none' | 'left' | 'right' | 'middle'
  buttons?: number
  clickCount?: number
  deltaX?: number
  deltaY?: number
  modifiers?: number
  key?: string
  code?: string
  keyCode?: number
  text?: string
  selectionDigest?: string
}
export interface InputResult {
  status: 'executed'
  focus?: { editable: boolean; x: number; y: number; height: number; sensitive: boolean }
  text?: string
  selectionDigest?: string
}
export interface ConnectorStart {
  name: string
  epoch: number
  spaceId?: number
  pageId?: string
  explicitNativeReturn?: boolean
}
export interface ConnectorReady {
  spaceId: number
  pages: BrowserPage[]
  capabilities: EgoCapabilities
  pageId: string
  viewport: Viewport
}
export interface EgoConnectorPort {
  start(options: ConnectorStart): Promise<ConnectorReady>
  call<T>(
    method: string,
    params: Record<string, unknown>,
    epoch: number,
    signal?: AbortSignal,
  ): Promise<T>
  fence(epoch: number): Promise<void>
  onFrame(listener: (meta: MediaFrame, bytes: Uint8Array) => void): () => void
  onStop(listener: (code: string) => void): () => void
  close(finish?: boolean): Promise<void>
}
