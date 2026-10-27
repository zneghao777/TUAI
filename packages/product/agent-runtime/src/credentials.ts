import type {} from '@deepseek-ai/cordis'
import CredentialProvider, { type CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  type EnvironmentCredentials,
  type HostPaths,
  type HostSettings,
} from '@tianzhiai/host-config'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianzhiaiHost: { paths: HostPaths; settings: HostSettings; credentials: EnvironmentCredentials }
  }
}

/** Host configuration is the sole reference allowlist. Secrets never enter plugin config. */
export class HostCredentials extends CredentialProvider {
  static inject = ['tianzhiaiHost']

  async resolve(ref: CredentialRef) {
    const reference = this.ctx.tianzhiaiHost.settings.credentialReferences[ref]
    if (!reference) return undefined
    const result = await this.ctx.tianzhiaiHost.credentials.resolve(reference)
    return result.available ? { value: result.value, source: 'host-environment' } : undefined
  }

  async describe(ref: CredentialRef) {
    const result = await this.resolve(ref)
    return {
      configured: result !== undefined,
      writable: false,
      ...(result ? { source: result.source } : {}),
    }
  }

  async set(): Promise<never> {
    throw new Error('请通过 Host 显式环境引用配置凭据')
  }
  async unset(): Promise<never> {
    throw new Error('请通过 Host 配置撤销凭据引用')
  }
  async readRecord() {
    return undefined
  }
  async describeRecord() {
    return { configured: false, writable: false }
  }
  async listRecords() {
    return []
  }
  async modifyRecord(): Promise<never> {
    throw new Error('当前 Host 未启用凭据记录存储')
  }
  async deleteRecord(): Promise<never> {
    throw new Error('当前 Host 未启用凭据记录存储')
  }
}
