import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { createdFiles, type CreatedFileCandidate } from './file-provenance.ts'

export interface VerifiedFileCandidate extends CreatedFileCandidate {
  bytes: number
}

/** Verify candidates before display. The returned paths are not deletion authority. */
export async function verifiedFileCandidates(
  events: readonly unknown[],
  workspace: string,
): Promise<VerifiedFileCandidate[]> {
  const root = await realpath(workspace)
  const candidates = createdFiles(events, workspace)
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
        return { ...candidate, bytes: info.size }
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
