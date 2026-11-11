import { posix, win32 } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

export interface PathOptions {
  platform?: string
  home?: string
  env?: Readonly<Record<string, string | undefined>>
}

export function resolveHostPaths(options: PathOptions = {}) {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux')
    throw new Error('不支持的 Host 平台')
  const p = platform === 'win32' ? win32 : posix
  const env = options.env ?? process.env
  const absolute = (value: string, name: string) => {
    if (!p.isAbsolute(value) || value.includes('\0'))
      throw new Error(`${name} 必须是 Host 的绝对路径`)
    return p.normalize(value)
  }
  const home = absolute(options.home ?? homedir(), 'Home')
  const overrideName = env.TUAI_HOME !== undefined ? 'TUAI_HOME' : 'TIANZHIAI_HOME'
  const overrideValue = env[overrideName]
  const override = overrideValue === undefined ? undefined : absolute(overrideValue, overrideName)
  // Keep an existing product directory in place; never move or overwrite user data.
  const existingOrCurrent = (current: string, legacy: string) =>
    existsSync(current) || !existsSync(legacy) ? current : legacy
  const productDirectory = (parent: string) =>
    existingOrCurrent(p.join(parent, 'TUAI'), p.join(parent, 'TIanZhiAi'))
  const base =
    platform === 'darwin'
      ? productDirectory(p.join(home, 'Library', 'Application Support'))
      : platform === 'win32'
        ? productDirectory(absolute(env.APPDATA ?? p.join(home, 'AppData', 'Roaming'), 'APPDATA'))
        : undefined
  // Choose one namespace for all XDG domains to avoid mixing two Host identities.
  const xdgRoots =
    !override && platform === 'linux'
      ? {
          config: absolute(env.XDG_CONFIG_HOME ?? p.join(home, '.config'), 'XDG_CONFIG_HOME'),
          data: absolute(env.XDG_DATA_HOME ?? p.join(home, '.local', 'share'), 'XDG_DATA_HOME'),
          state: absolute(env.XDG_STATE_HOME ?? p.join(home, '.local', 'state'), 'XDG_STATE_HOME'),
          cache: absolute(env.XDG_CACHE_HOME ?? p.join(home, '.cache'), 'XDG_CACHE_HOME'),
        }
      : undefined
  let xdgName = 'TUAI'
  if (xdgRoots) {
    for (const root of Object.values(xdgRoots)) {
      if (existsSync(p.join(root, 'TUAI'))) break
      if (existsSync(p.join(root, 'TIanZhiAi'))) {
        xdgName = 'TIanZhiAi'
        break
      }
    }
  }
  const xdg = (domain: 'config' | 'data' | 'state' | 'cache') => {
    if (!xdgRoots) throw new Error('XDG 路径未初始化')
    return p.join(xdgRoots[domain], xdgName)
  }
  const config = override
    ? p.join(override, 'config')
    : base
      ? p.join(base, 'config')
      : xdg('config')
  const data = override ? p.join(override, 'data') : base ? p.join(base, 'data') : xdg('data')
  const state = override ? p.join(override, 'state') : base ? p.join(base, 'state') : xdg('state')
  const cache = override ? p.join(override, 'cache') : base ? p.join(base, 'cache') : xdg('cache')
  return Object.freeze({
    platform,
    config,
    data,
    state,
    cache,
    business: p.join(data, 'business'),
    database: existingOrCurrent(
      p.join(data, 'business', 'tuai.sqlite3'),
      p.join(data, 'business', 'tianzhiai.sqlite3'),
    ),
    sessions: p.join(data, 'sessions'),
    artifacts: p.join(data, 'artifacts'),
    downloads: p.join(data, 'downloads'),
    browserProfiles: p.join(data, 'browser-profiles'),
    logs: p.join(state, 'logs'),
    temporary: p.join(cache, 'tmp'),
    runtime: p.join(state, 'runtime'),
    hostConfig: p.join(config, 'host.json'),
  })
}

export type HostPaths = ReturnType<typeof resolveHostPaths>

export async function ensureHostDirectories(paths: HostPaths): Promise<void> {
  if (paths.platform !== process.platform) throw new Error('只能创建当前 Host 平台的目录')
  const {
    database: _database,
    hostConfig: _hostConfig,
    platform: _platform,
    ...directories
  } = paths
  for (const directory of new Set(Object.values(directories))) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  }
}
