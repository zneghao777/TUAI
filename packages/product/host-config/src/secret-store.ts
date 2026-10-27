import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { open, link, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Private local storage. The wrapping key is not a system Keychain credential. */
export class SecretStore {
  private readonly path: string
  private readonly keyPath: string
  constructor(directory: string) {
    this.path = join(directory, 'model-secrets.enc')
    this.keyPath = join(directory, 'model-secrets.key')
  }
  private async readPrivate(path: string): Promise<Buffer | undefined> {
    try {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const info = await file.stat()
        if (!info.isFile() || (process.platform !== 'win32' && info.mode & 0o077))
          throw new Error('模型凭据文件必须仅当前系统用户可读写')
        return await file.readFile()
      } finally {
        await file.close()
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    }
  }
  private async key(create: boolean): Promise<Buffer> {
    let key = await this.readPrivate(this.keyPath)
    if (!key && create) {
      const temporary = `${this.keyPath}.${randomBytes(12).toString('hex')}.tmp`
      try {
        await writeFile(temporary, randomBytes(32), { flag: 'wx', mode: 0o600, flush: true })
        try {
          await link(temporary, this.keyPath)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
        }
      } finally {
        await rm(temporary, { force: true })
      }
      key = await this.readPrivate(this.keyPath)
    }
    if (key?.length !== 32) throw new Error('模型凭据包装密钥缺失或损坏，请恢复凭据备份')
    return key
  }
  private async entries(): Promise<Record<string, string>> {
    const bytes = await this.readPrivate(this.path)
    if (!bytes) return Object.create(null)
    const key = await this.key(false)
    try {
      if (bytes[0] !== 1 || bytes.length < 30) throw new Error()
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13))
      decipher.setAuthTag(bytes.subarray(13, 29))
      const raw: unknown = JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'),
      )
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        Object.values(raw).some((v) => typeof v !== 'string')
      )
        throw new Error()
      return Object.assign(Object.create(null), raw)
    } catch {
      throw new Error('模型凭据解密失败，请恢复凭据备份')
    }
  }
  async get(ref: string) {
    return (await this.entries())[ref]
  }
  async set(ref: string, value: string | undefined) {
    await withFileLock(this.path, async () => {
      const entries = await this.entries()
      if (value === undefined) delete entries[ref]
      else entries[ref] = value
      const nonce = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', await this.key(true), nonce)
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(entries), 'utf8'),
        cipher.final(),
      ])
      await writeFileAtomic(
        this.path,
        Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]),
        { mode: 0o600 },
      )
    })
  }
}
