import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// This explicit maintenance command only reads reference repositories.
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const baseline = json('../docs/specs/appendices/上游源码基线.json')
const metadata = json('../docs/specs/appendices/DSH包元数据清单.json')
const args = process.argv.slice(2)
const rootFor = (flag, source) => {
  const index = args.indexOf(flag)
  return resolve(index < 0 ? source.localReferencePath : args[index + 1])
}
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
let files = 0
for (const [key, source] of Object.entries(baseline.sources)) {
  if (!source.localReferencePath) continue
  const root = rootFor(key === 'deepseekHarness' ? '--dsh' : '--openmuse', source)
  assert.equal(git(root, 'rev-parse', 'HEAD'), source.commit, `${key}: commit drift`)
  assert.deepEqual(git(root, 'status', '--porcelain=v1').split('\n').filter(Boolean).map(line => line.trim()),
    source.worktreeStatus.map(line => line.trim()), `${key}: worktree drift`)
  for (const file of source.selectedFileHashes) {
    assert.equal(hash(readFileSync(resolve(root, file.path))), file.sha256, `${key}: ${file.path}`)
    files++
  }
  if (key === 'deepseekHarness') {
    assert.equal(metadata.packageCount, metadata.packages.length)
    for (const pkg of metadata.packages) {
      assert.equal(hash(readFileSync(resolve(root, pkg.manifestPath))), pkg.manifestSha256, pkg.path)
    }
  }
  console.log(`${key}: commit, worktree and selected hashes verified`)
}
console.log(`Verified ${files} selected source hashes and ${metadata.packageCount} package manifests`)
