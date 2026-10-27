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

/** Narrow preload surface: no raw IPC channel, shell, eval, or filesystem API. */
export interface DesktopBridge {
  invoke(request: DesktopRequest): Promise<unknown>
}
export type DesktopRequest = {
  version: 1
  requestId: string
  generation: number
  hostId: string
} & ({ method: 'chooseDirectory' } | { method: 'openPath'; path: HostPath })
export interface DesktopReply {
  version: 1
  requestId: string
  generation: number
  hostId: string
  result: PlatformResult<HostPath | undefined>
}
const unavailable = (message: string): PlatformResult<never> => ({
  available: false,
  code: 'unavailable',
  message,
})
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function pathValue(value: unknown): value is HostPath {
  return (
    object(value) &&
    typeof value.hostId === 'string' &&
    typeof value.path === 'string' &&
    Object.keys(value).length === 2
  )
}

/** Renderer adapter. A replaced Host/generation invalidates pending native results. */
export function createDesktopPlatform(
  host: HostIdentity,
  bridge: DesktopBridge,
  generation: number,
): PlatformAdapter & { dispose(): void } {
  let active = true
  async function invoke(
    method: DesktopRequest['method'],
    path?: HostPath,
  ): Promise<PlatformResult<HostPath | undefined>> {
    if (!active || host.executionLocation !== 'local')
      return unavailable('当前 Host 不属于本机桌面桥')
    const requestId = crypto.randomUUID()
    const base = { version: 1 as const, requestId, generation, hostId: host.id }
    const request: DesktopRequest =
      method === 'openPath' && path
        ? { ...base, method, path }
        : { ...base, method: 'chooseDirectory' }
    const result = await bridge.invoke(request)
    if (!active) return unavailable('平台连接已失效')
    if (
      !object(result) ||
      result.version !== 1 ||
      result.requestId !== requestId ||
      result.generation !== generation ||
      result.hostId !== host.id ||
      !object(result.result)
    )
      return unavailable('平台回执身份不匹配')
    const answer = result.result
    if (
      answer.available === false &&
      typeof answer.message === 'string' &&
      (answer.code === 'unavailable' ||
        answer.code === 'wrong_host' ||
        answer.code === 'invalid_path')
    )
      return { available: false, code: answer.code, message: answer.message }
    if (answer.available !== true) return unavailable('平台回执格式错误')
    if (method === 'openPath' && answer.value === undefined)
      return { available: true, value: undefined }
    if (!pathValue(answer.value)) return unavailable('目录回执格式错误')
    return validateHostPath(host, answer.value)
  }
  return {
    capabilities: Object.freeze({
      kind: 'desktop',
      localHost: host.executionLocation === 'local',
      chooseDirectory: host.executionLocation === 'local',
      openPath: host.executionLocation === 'local',
      systemNotification: false,
      embeddedBrowser: false,
      managedBrowserWorker: false,
      backgroundHost: false,
    }),
    async chooseDirectory() {
      const answer = await invoke('chooseDirectory')
      if (!answer.available) return answer
      return answer.value === undefined
        ? unavailable('未选择目录')
        : { available: true, value: answer.value }
    },
    async openPath(path) {
      const checked = validateHostPath(host, path)
      if (!checked.available) return checked
      const answer = await invoke('openPath', path)
      return answer.available ? { available: true, value: undefined } : answer
    },
    dispose() {
      active = false
    },
  }
}

/** Main-process policy port; a real Electron owner must supply frame verification. */
export interface DesktopAuthority {
  host: HostIdentity
  generation: number
  acceptsSender(sender: unknown): boolean
  allowsPath(path: HostPath): boolean
  chooseDirectory(): Promise<HostPath | undefined>
  openPath(path: HostPath): Promise<void>
}
export function createDesktopHandler(authority: DesktopAuthority) {
  let active = true
  const seen = new Set<string>()
  return {
    dispose() {
      active = false
      seen.clear()
    },
    async handle(sender: unknown, value: unknown): Promise<DesktopReply | PlatformResult<never>> {
      if (
        !active ||
        !authority.acceptsSender(sender) ||
        !object(value) ||
        value.version !== 1 ||
        typeof value.requestId !== 'string' ||
        value.requestId.length > 128 ||
        value.generation !== authority.generation ||
        value.hostId !== authority.host.id ||
        authority.host.executionLocation !== 'local'
      )
        return unavailable('桌面调用方或连接身份无效')
      if (
        (value.method !== 'chooseDirectory' && value.method !== 'openPath') ||
        Object.keys(value).some(
          (key) =>
            ![
              'version',
              'requestId',
              'generation',
              'hostId',
              'method',
              ...(value.method === 'openPath' ? ['path'] : []),
            ].includes(key),
        )
      )
        return unavailable('平台方法或参数不受支持')
      const base = {
        version: 1 as const,
        requestId: value.requestId,
        generation: authority.generation,
        hostId: authority.host.id,
      }
      if (seen.has(value.requestId) || seen.size >= 10000)
        return { ...base, result: unavailable('请求已处理或当前连接调用上限已达到') }
      seen.add(value.requestId)
      try {
        if (value.method === 'chooseDirectory') {
          const path = await authority.chooseDirectory()
          if (!active) return { ...base, result: unavailable('平台连接已失效') }
          if (!path) return { ...base, result: unavailable('已取消目录选择') }
          const checked = validateHostPath(authority.host, path)
          return {
            ...base,
            result:
              checked.available && !authority.allowsPath(checked.value)
                ? unavailable('目录未在平台授权范围内')
                : checked,
          }
        }
        if (!pathValue(value.path))
          return {
            ...base,
            result: { available: false, code: 'invalid_path', message: '路径参数无效' },
          }
        const checked = validateHostPath(authority.host, value.path)
        if (!checked.available) return { ...base, result: checked }
        if (!authority.allowsPath(checked.value))
          return { ...base, result: unavailable('路径未在平台授权范围内') }
        await authority.openPath(checked.value)
        return {
          ...base,
          result: active
            ? { available: true, value: undefined }
            : unavailable('平台连接已失效；已发生的操作不会撤销'),
        }
      } catch {
        return { ...base, result: unavailable('平台操作未完成') }
      }
    },
  }
}
