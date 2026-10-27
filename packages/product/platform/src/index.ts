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

export interface HostIdentity {
  id: string
  os: 'darwin' | 'win32' | 'linux'
  executionLocation: 'local' | 'remote'
}

export function parseClientConfig(value: unknown): PlatformResult<HostIdentity> {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'os' in value &&
    'executionLocation' in value &&
    typeof value.id === 'string' &&
    /^[A-Za-z0-9._-]+$/.test(value.id) &&
    (value.os === 'darwin' || value.os === 'win32' || value.os === 'linux') &&
    (value.executionLocation === 'local' || value.executionLocation === 'remote') &&
    Object.keys(value).every((key) => ['id', 'os', 'executionLocation'].includes(key))
  ) {
    return {
      available: true,
      value: { id: value.id, os: value.os, executionLocation: value.executionLocation },
    }
  }
  return { available: false, code: 'unavailable', message: 'Client Host 配置不合法' }
}

export type PlatformResult<T> =
  | { available: true; value: T }
  | { available: false; code: 'unavailable' | 'wrong_host' | 'invalid_path'; message: string }

export interface PlatformAdapter {
  readonly capabilities: Readonly<PlatformCapabilities>
  chooseDirectory(): Promise<PlatformResult<HostPath>>
  openPath(path: HostPath): Promise<PlatformResult<void>>
}

/** Validate against the issuing Host OS, never the browser's own OS or User-Agent. */
export function validateHostPath(host: HostIdentity, path: HostPath): PlatformResult<HostPath> {
  if (path.hostId !== host.id)
    return { available: false, code: 'wrong_host', message: '目录属于其他 Host' }
  const absolute =
    host.os === 'win32'
      ? /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(path.path)
      : path.path.startsWith('/')
  if (!absolute || path.path.includes('\0'))
    return { available: false, code: 'invalid_path', message: '需要 Host 的绝对路径' }
  return { available: true, value: { hostId: path.hostId, path: path.path } }
}

/** P0 remote adapter reports unsupported native operations; a real bridge arrives later. */
export function createRemotePlatform(
  host: HostIdentity,
  kind: 'web' | 'mobile' = 'web',
): PlatformAdapter {
  return {
    capabilities: Object.freeze({
      kind,
      localHost: false,
      chooseDirectory: false,
      openPath: false,
      systemNotification: false,
      embeddedBrowser: false,
      managedBrowserWorker: false,
      backgroundHost: false,
    }),
    async chooseDirectory() {
      return { available: false, code: 'unavailable', message: 'Host 目录选择服务尚未接入' }
    },
    async openPath(path) {
      const checked = validateHostPath(host, path)
      if (!checked.available) return checked
      return {
        available: false,
        code: 'unavailable',
        message: '远程客户端不能直接打开 Host 本地文件',
      }
    },
  }
}
