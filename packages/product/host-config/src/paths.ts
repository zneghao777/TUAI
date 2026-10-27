import { posix, win32 } from 'node:path'
import { homedir } from 'node:os'
import { mkdir } from 'node:fs/promises'

export interface PathOptions {
  platform?: string
  home?: string
  env?: Readonly<Record<string, string | undefined>>
}

export function resolveHostPaths(options: PathOptions = {}) {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') throw new Error('不支持的 Host 平台')
  const p = platform === 'win32' ? win32 : posix
  const env = options.env ?? process.env
  const absolute = (value: string, name: string) => {
    if (!p.isAbsolute(value) || value.includes('\0')) throw new Error(`${name} 必须是 Host 的绝对路径`)
    return p.normalize(value)
  }
  const home = absolute(options.home ?? homedir(), 'Home')
  const override = env.TIANZHIAI_HOME === undefined ? undefined : absolute(env.TIANZHIAI_HOME, 'TIANZHIAI_HOME')
  const xdg = (key: string, fallback: string) => p.join(absolute(env[key] ?? fallback, key), 'TIanZhiAi')
  const base = platform === 'darwin' ? p.join(home, 'Library', 'Application Support', 'TIanZhiAi')
    : platform === 'win32' ? p.join(absolute(env.APPDATA ?? p.join(home, 'AppData', 'Roaming'), 'APPDATA'), 'TIanZhiAi')
    : undefined
  const config = override ? p.join(override, 'config') : base ? p.join(base, 'config') : xdg('XDG_CONFIG_HOME', p.join(home, '.config'))
  const data = override ? p.join(override, 'data') : base ? p.join(base, 'data') : xdg('XDG_DATA_HOME', p.join(home, '.local', 'share'))
  const state = override ? p.join(override, 'state') : base ? p.join(base, 'state') : xdg('XDG_STATE_HOME', p.join(home, '.local', 'state'))
  const cache = override ? p.join(override, 'cache') : base ? p.join(base, 'cache') : xdg('XDG_CACHE_HOME', p.join(home, '.cache'))
  return Object.freeze({
    platform, config, data, state, cache,
    business: p.join(data, 'business'), database: p.join(data, 'business', 'tianzhiai.sqlite3'),
    sessions: p.join(data, 'sessions'), artifacts: p.join(data, 'artifacts'),
    downloads: p.join(data, 'downloads'), browserProfiles: p.join(data, 'browser-profiles'),
    logs: p.join(state, 'logs'), temporary: p.join(cache, 'tmp'),
    runtime: p.join(state, 'runtime'), hostConfig: p.join(config, 'host.json'),
  })
}

export type HostPaths = ReturnType<typeof resolveHostPaths>

export async function ensureHostDirectories(paths: HostPaths): Promise<void> {
  if (paths.platform !== process.platform) throw new Error('只能创建当前 Host 平台的目录')
  const { database: _database, hostConfig: _hostConfig, platform: _platform, ...directories } = paths
  for (const directory of new Set(Object.values(directories))) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  }
}
