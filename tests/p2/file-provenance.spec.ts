import { describe, expect, it } from 'vitest'
import { createdFiles } from '../../packages/product/web-host/src/file-provenance.ts'
import { verifiedFileCandidates } from '../../packages/product/web-host/src/file-candidates.ts'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const call = (id: string) => ({ type: 'tool/call', data: { name: 'write', callId: id } })
const result = (id: string, path: string, extra: object = {}) => ({
  type: 'tool/result',
  time: 123,
  data: { message: { toolCallId: id }, meta: { operation: 'create', path }, ...extra },
})

describe('file library provenance', () => {
  it('accepts only a successful created document inside the workspace', () => {
    expect(createdFiles([call('a'), result('a', '/workspace/report.md')], '/workspace')).toEqual([
      { path: '/workspace/report.md', kind: 'document', createdAt: 123 },
    ])
  })

  it('rejects unmatched, failed, updated, outside, and unsupported files', () => {
    expect(
      createdFiles(
        [
          result('missing', '/workspace/a.md'),
          call('failed'),
          result('failed', '/workspace/b.md', { error: { code: 'FAILED' } }),
          call('update'),
          result('update', '/workspace/c.md', {
            meta: { operation: 'update', path: '/workspace/c.md' },
          }),
          call('outside'),
          result('outside', '/workspace-other/d.md'),
          call('other'),
          result('other', '/workspace/code.ts'),
        ],
        '/workspace',
      ),
    ).toEqual([])
  })

  it('deduplicates creates and separates images from documents', () => {
    expect(
      createdFiles(
        [call('a'), result('a', '/workspace/a.PNG'), call('b'), result('b', '/workspace/a.PNG')],
        '/workspace',
      ),
    ).toEqual([{ path: '/workspace/a.PNG', kind: 'image', createdAt: 123 }])
  })

  it('excludes missing files and symlinks that escape the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tianzhi-library-'))
    try {
      const workspace = join(root, 'workspace')
      const outside = join(root, 'outside')
      await mkdir(workspace)
      await mkdir(outside)
      await writeFile(join(workspace, 'report.md'), 'hello')
      await writeFile(join(outside, 'private.md'), 'private')
      await symlink(outside, join(workspace, 'link'))
      const files = await verifiedFileCandidates(
        [
          call('a'),
          result('a', join(workspace, 'report.md')),
          call('b'),
          result('b', join(workspace, 'missing.md')),
          call('c'),
          result('c', join(workspace, 'link', 'private.md')),
        ],
        workspace,
      )
      expect(files).toEqual([
        { path: join(workspace, 'report.md'), kind: 'document', createdAt: 123, bytes: 5 },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
