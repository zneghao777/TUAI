import type {} from '@deepseek-ai/cordis'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import CredentialProvider, { type CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  type EnvironmentCredentials,
  type HostPaths,
  type HostSettings,
  SecretStore,
} from '@tianzhiai/host-config'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianzhiaiHost: { paths: HostPaths; settings: HostSettings; credentials: EnvironmentCredentials }
  }
}

/** Managed model secrets precede explicitly allowed environment references. */
export class HostCredentials extends CredentialProvider {
  static inject = ['tianzhiaiHost']

  async resolve(ref: CredentialRef) {
    if (this.managed(ref)) {
      const value = await this.store().get(ref)
      if (value) return { value, source: 'host-encrypted' }
    }
    const reference = this.ctx.tianzhiaiHost.settings.credentialReferences[ref]
    if (!reference) return undefined
    const result = await this.ctx.tianzhiaiHost.credentials.resolve(reference)
    return result.available ? { value: result.value, source: 'host-environment' } : undefined
  }

  async describe(ref: CredentialRef) {
    const result = await this.resolve(ref)
    return {
      configured: result !== undefined,
      writable: this.managed(ref),
      ...(result ? { source: result.source } : {}),
    }
  }

  private managed(ref: CredentialRef) {
    return ref === 'deepseek' || /^model_[a-f0-9]{32}$/.test(ref)
  }
  private store() {
    return new SecretStore(this.ctx.tianzhiaiHost.paths.config)
  }
  async set(ref: CredentialRef, value: string) {
    if (!this.managed(ref)) throw new Error('只允许管理模型凭据')
    const clean = value.trim()
    if (!/^[\x21-\x7e]{1,4096}$/.test(clean)) throw new Error('API Key 格式无效，请粘贴完整密钥')
    await this.store().set(ref, clean)
    this.notifyUpdated(ref)
  }
  async unset(ref: CredentialRef) {
    if (!this.managed(ref)) throw new Error('只允许管理模型凭据')
    await this.store().set(ref, undefined)
    this.notifyUpdated(ref)
  }
  private recordPath(key: CredentialKey) {
    if (key !== 'client-connection/browser-session')
      throw new Error('当前 Host 只支持浏览器认证签名记录')
    return join(this.ctx.tianzhiaiHost.paths.config, 'browser-session.json')
  }
  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    if (key !== 'client-connection/browser-session') return undefined
    const path = this.recordPath(key)
    try {
      const info = await stat(path)
      if (process.platform !== 'win32' && (info.mode & 0o077) !== 0)
        throw new Error('浏览器认证签名文件必须仅当前用户可读写')
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (
        typeof raw !== 'object' ||
        raw === null ||
        !('kind' in raw) ||
        raw.kind !== 'grant' ||
        !('payload' in raw)
      )
        throw new Error('浏览器认证签名记录格式不合法')
      return { kind: 'grant', payload: raw.payload }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    }
  }
  async describeRecord(key: CredentialKey) {
    return {
      configured: (await this.readRecord(key)) !== undefined,
      writable: key === 'client-connection/browser-session',
    }
  }
  async listRecords() {
    return []
  }
  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ) {
    const path = this.recordPath(key)
    return withFileLock(path, async () => {
      const current = await this.readRecord(key)
      const updated = await mutate(current)
      if (updated === undefined) return current
      if (updated.kind !== 'grant') throw new Error('浏览器认证只能保存签名记录')
      await writeFileAtomic(path, JSON.stringify(updated), { mode: 0o600 })
      this.notifyRecordUpdated(key)
      return updated
    })
  }
  async deleteRecord(): Promise<never> {
    throw new Error('浏览器认证撤销需要通过 Host 显式维护')
  }
}
