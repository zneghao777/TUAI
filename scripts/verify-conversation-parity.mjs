// Read-only upstream comparison using the same pinned dependency environment and fixtures.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, symlinkSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const source = resolve(process.argv[2])
const baseline = JSON.parse(readFileSync('docs/specs/appendices/上游源码基线.json')).sources
  .deepseekHarness.commit
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  baseline,
)
assert.equal(
  execFileSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' }).trim(),
  '',
)
mkdirSync('.runtime', { recursive: true })
const temporary = mkdtempSync(resolve('.runtime/conversation-parity-'))
const dirs = ['packages/client/ui-chat', 'packages/client/ui-conversation']
const report = { baseline, fixtureHashes: {}, results: [] }
try {
  const archive = execFileSync('git', ['archive', baseline, ...dirs], {
    cwd: source,
    maxBuffer: 16e6,
  })
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive })
  writeFileSync(
    join(temporary, 'tsconfig.base.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'react-jsx' } }),
  )
  writeFileSync(
    join(temporary, 'tsconfig.base.client.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'react-jsx' } }),
  )
  for (const dir of dirs)
    symlinkSync(resolve(dir, 'node_modules'), join(temporary, dir, 'node_modules'), 'dir')
  const tests = JSON.parse(readFileSync('tests/p2/conversation-fixtures.json', 'utf8'))
  assert.ok(tests.length > 0)
  for (const path of tests) {
    assert.deepEqual(
      readFileSync(join(temporary, path)),
      readFileSync(path),
      `Fixture changed: ${path}`,
    )
    report.fixtureHashes[path] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
  for (const [name, root] of [
    ['upstream', temporary],
    ['product', ''],
  ]) {
    execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.p2.config.ts',
        '--reporter=json',
        `--outputFile=reports/p2/063-${name}-fixtures.json`,
      ],
      {
        env: { ...process.env, TIANZHI_CONVERSATION_PARITY: '1', TIANZHI_PARITY_ROOT: root },
        stdio: 'inherit',
        timeout: 60000,
      },
    )
    const result = JSON.parse(readFileSync(`reports/p2/063-${name}-fixtures.json`, 'utf8'))
    assert.equal(result.success, true)
    report.results.push({ name, tests: result.numTotalTests, passed: result.numPassedTests })
  }
  assert.equal(report.results[0].tests, report.results[1].tests)
  writeFileSync('reports/p2/063-source-parity.json', JSON.stringify(report, null, 2) + '\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
