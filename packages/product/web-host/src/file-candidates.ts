import { lstat, realpath, mkdir, rename, unlink, rmdir, link } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { createdFiles, type CreatedFileCandidate } from './file-provenance.ts'

export interface VerifiedFileCandidate extends Omit<CreatedFileCandidate, 'createdAt'> {
  bytes: number
  version: string
  createdAt: number | null
}

function version(info: Stats): string {
  return [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':')
}

/** Verify candidates before display. The returned paths are not deletion authority. */
export async function verifiedFileCandidates(
  events: readonly unknown[],
  workspace: string,
): Promise<VerifiedFileCandidate[]> {
  const candidates = createdFiles(events, workspace)
  if (!candidates.length) return []
  const root = await realpath(workspace)
  const verified = await Promise.all(
    candidates.map(async (candidate): Promise<VerifiedFileCandidate | undefined> => {
      try {
        const info = await lstat(candidate.path)
        if (!info.isFile() || info.isSymbolicLink()) return undefined
        const resolved = await realpath(candidate.path)
        const inside = relative(root, resolved)
        if (
          !inside ||
          inside === '..' ||
          inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
          isAbsolute(inside)
        )
          return undefined
        const createdAt =
          candidate.sourceKind === 'create'
            ? candidate.createdAt
            : info.birthtimeMs > 0 && info.birthtimeMs <= candidate.createdAt
              ? info.birthtimeMs
              : null
        return { ...candidate, createdAt, bytes: info.size, version: version(info) }
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return undefined
        throw error
      }
    }),
  )
  return verified.filter((candidate): candidate is VerifiedFileCandidate => candidate !== undefined)
}

/** Move into an isolated temporary directory, recheck identity, then permanently remove. */
export async function deleteVerifiedFile(
  candidate: VerifiedFileCandidate,
  workspace: string,
  expectedVersion: string,
): Promise<void> {
  if (candidate.version !== expectedVersion) throw new Error('文件已变化，请刷新后重试')
  const root = await realpath(workspace)
  const resolved = await realpath(candidate.path)
  const inside = relative(root, resolved)
  if (
    !inside ||
    inside === '..' ||
    inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(inside)
  )
    throw new Error('文件不在会话工作区内')
  const before = await lstat(candidate.path)
  if (!before.isFile() || before.isSymbolicLink() || version(before) !== expectedVersion)
    throw new Error('文件已变化，请刷新后重试')
  const quarantine = join(root, `.tianzhiai-delete-${randomUUID()}`)
  await mkdir(quarantine, { mode: 0o700 })
  const moved = join(quarantine, 'file')
  let transferred = false
  try {
    await rename(candidate.path, moved)
    transferred = true
    const after = await lstat(moved)
    // rename may update ctime, so compare stable file identity and content revision.
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw new Error('文件在删除时发生变化')
    await unlink(moved)
    transferred = false
  } catch (error) {
    if (transferred) {
      try {
        // link fails rather than overwriting a new file created at the original path.
        await link(moved, candidate.path)
        await unlink(moved)
        transferred = false
      } catch {
        throw new Error(`文件删除未完成；文件保留在 ${moved}，请手动恢复`, { cause: error })
      }
    }
    throw error
  } finally {
    if (!transferred) await rmdir(quarantine).catch(() => {})
  }
}
