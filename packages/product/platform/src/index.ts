/** Capabilities describe the actual client adapter, independently of UI technology. */
export interface PlatformCapabilities {
  kind: 'web' | 'desktop' | 'mobile'
  localHost: boolean
  chooseDirectory: boolean
  openPath: boolean
  systemNotification: boolean
  embeddedBrowser: boolean
  managedBrowserWorker: boolean
  backgroundHost: boolean
}

/** A host path must stay bound to its issuing host, especially on mobile clients. */
export interface HostPath {
  hostId: string
  path: string
}
