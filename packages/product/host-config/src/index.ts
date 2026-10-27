import { randomUUID } from 'node:crypto'
import { link, readFile, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { HostIdentity } from '@tianzhiai/platform'
import { ensureHostDirectories, type HostPaths } from './paths.ts'

export * from './paths.ts'
export { SecretStore } from './secret-store.ts'

const credentialRefSchema = z.strictObject({
  source: z.literal('environment'),
  name: z.string().regex(/^TIANZHIAI_SECRET_[A-Z0-9_]+$/),
})
const hostSettingsSchema = z.strictObject({
  version: z.literal(1),
  hostId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/),
  profile: z.enum(['production', 'development']),
  credentialReferences: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/), credentialRefSchema),
})

export type CredentialReference = z.infer<typeof credentialRefSchema>
export type HostSettings = z.infer<typeof hostSettingsSchema>
export type CredentialResult =
  | { available: true; value: string }
  | { available: false; reason: 'not_found' }

export interface CredentialResolver {
  resolve(reference: CredentialReference): Promise<CredentialResult>
}

/** Explicit environment references only; no implicit .env discovery or disk secret store. */
export class EnvironmentCredentials implements CredentialResolver {
  readonly #env: Readonly<Record<string, string | undefined>>
  constructor(env: Readonly<Record<string, string | undefined>> = process.env) {
    this.#env = env
  }

  async resolve(reference: CredentialReference): Promise<CredentialResult> {
    const ref = credentialRefSchema.parse(reference)
    const value = this.#env[ref.name]
    return value ? { available: true, value } : { available: false, reason: 'not_found' }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

export function parseHostSettings(value: unknown): HostSettings {
  const parsed = hostSettingsSchema.safeParse(value)
  if (!parsed.success) {
    // Values never enter diagnostics, including unknown fields containing secrets.
    throw new Error(
      `Host 配置不合法：${parsed.error.issues.map((issue) => issue.path.join('.') || 'root').join(', ')}`,
    )
  }
  return parsed.data
}

export async function loadHostSettings(paths: HostPaths): Promise<HostSettings> {
  await ensureHostDirectories(paths)
  let content: string
  try {
    content = await readFile(paths.hostConfig, 'utf8')
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
    const defaults: HostSettings = {
      version: 1,
      hostId: randomUUID(),
      profile: 'production',
      credentialReferences: {},
    }
    const temporary = `${paths.hostConfig}.${randomUUID()}.tmp`
    try {
      // Publish only after the private file has been completely written and closed.
      // link() is atomic and never replaces another process's winning Host identity.
      await writeFile(temporary, JSON.stringify(defaults, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
        flush: true,
      })
      try {
        await link(temporary, paths.hostConfig)
      } catch (publishError) {
        if (!hasCode(publishError, 'EEXIST')) throw publishError
      }
    } finally {
      await rm(temporary, { force: true })
    }
    content = await readFile(paths.hostConfig, 'utf8')
  }
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw new Error('Host 配置必须是合法 JSON')
  }
  return parseHostSettings(raw)
}

/** Client projection deliberately excludes paths, credential references and resolver objects. */
export function publicHostIdentity(
  settings: HostSettings,
  os: HostIdentity['os'],
  executionLocation: HostIdentity['executionLocation'],
): HostIdentity {
  return { id: settings.hostId, os, executionLocation }
}

export function redactDiagnostic(
  value: string,
  settings?: HostSettings,
  env = process.env,
): string {
  let output = value
  const names = new Set([
    ...Object.values(settings?.credentialReferences ?? {}).map((reference) => reference.name),
    ...Object.keys(env).filter((name) => name.startsWith('TIANZHIAI_SECRET_')),
  ])
  for (const name of names) {
    const secret = env[name]
    if (secret) output = output.split(secret).join('[REDACTED]')
  }
  return output
}
