// Explicit maintenance command; reference repositories are read-only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { workspacePackages } from './workspace.mjs'

const [sourceArgument, task, ...roots] = process.argv.slice(2)
assert.ok(
  sourceArgument && /^TZ-\d{3}$/.test(task) && roots.length,
  'Usage: migrate-dsh <upstream> <TZ-id> <package names...>',
)
const source = resolve(sourceArgument)
const baseline = JSON.parse(readFileSync('docs/specs/appendices/上游源码基线.json'))
const commit = baseline.sources.deepseekHarness.commit
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), commit)
assert.equal(git('status', '--porcelain'), '', 'Upstream must be clean')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}
const candidates = globSync(
  ['packages/*/*/package.json', 'vendor/*/package.json', 'native/system/packages/*/package.json'],
  { cwd: source },
).map((path) => ({ dir: dirname(path), ...json(resolve(source, path)) }))
const byName = new Map(candidates.map((pkg) => [pkg.name, pkg]))
const p2 = Number(task.slice(3)) >= 15
const registryPath = p2 ? 'docs/migration/M3-迁移登记.json' : 'docs/migration/M1-迁移登记.json'
const registry = existsSync(registryPath)
  ? json(registryPath)
  : {
      schemaVersion: 1,
      batchId: p2 ? 'M3' : 'M1-M2',
      upstreamCommit: commit,
      status: 'in_progress',
      scope: `${p2 ? 'P2' : 'P1'} 实际启用能力及其运行、类型和资源闭包；未注册插件不表示能力已启用`,
      rollbackRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      packages: [],
      checks: [],
    }
const local = new Map(workspacePackages().map((pkg) => [pkg.name, pkg]))
const selected = new Map()
const imported = new Map()
function importsOf(pkg) {
  return globSync(`${pkg.dir}/src/**/*.ts`, { cwd: source }).flatMap((path) => {
    const text = readFileSync(resolve(source, path), 'utf8')
    const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest)
    const result = []
    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        result.push(node.moduleSpecifier.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    return result
  })
}
function select(name) {
  if (local.has(name) || selected.has(name)) return
  const pkg = byName.get(name)
  assert.ok(pkg, `Missing source package: ${name}`)
  selected.set(name, pkg)
  const imports = importsOf(pkg)
  imported.set(name, imports)
  const names = new Set([
    ...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }),
    ...imports.map((name) => name.split('/').slice(0, 2).join('/')),
  ])
  for (const dep of names) if (byName.has(dep)) select(dep)
}
roots.forEach(select)
if (process.env.TIANZHI_MIGRATION_DRY_RUN === '1') {
  console.log([...selected.keys()].join('\n'))
  process.exit(0)
}
for (const [name, pkg] of selected) {
  assert.ok(!existsSync(pkg.dir), `Refusing to overwrite ${pkg.dir}`)
  const files = git('ls-files', '--', pkg.dir).split('\n').filter(Boolean)
  const record = {
    path: pkg.dir,
    name,
    version: pkg.version,
    license: pkg.license,
    task,
    status: 'migrated',
    reason: roots.includes(name) ? '本项选定能力' : '本项实际运行或类型依赖',
    upstreamFiles: [],
    localPatches: [],
    additionalFiles: [],
  }
  for (const file of files) {
    mkdirSync(dirname(file), { recursive: true })
    cpSync(resolve(source, file), file)
    record.upstreamFiles.push({ path: file, sha256: hash(file) })
  }
  if (!existsSync(`${pkg.dir}/LICENSE`)) {
    cpSync(
      resolve(source, pkg.dir.startsWith('native/') ? 'native/system/LICENSE' : 'LICENSE'),
      `${pkg.dir}/LICENSE`,
    )
    record.additionalFiles.push({
      path: `${pkg.dir}/LICENSE`,
      sha256: hash(`${pkg.dir}/LICENSE`),
      reason: '保留来源许可',
    })
  }
  // Upstream devDependencies enumerate the entire upstream test universe. Keep
  // only source-required dependencies; selected test support is explicit.
  const manifest = json(`${pkg.dir}/package.json`)
  manifest.devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies ?? {}).filter(
      ([n]) => !n.startsWith('@deepseek-ai/') || local.has(n) || selected.has(n),
    ),
  )
  for (const specifier of imported.get(name)) {
    const owner = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]
    if (!byName.has(owner)) continue
    if (!manifest.dependencies?.[owner] && !manifest.peerDependencies?.[owner]) {
      manifest.dependencies ??= {}
      manifest.dependencies[owner] = 'workspace:*'
    }
  }
  save(`${pkg.dir}/package.json`, manifest)
  if (existsSync(`${pkg.dir}/tsconfig.json`) && !pkg.dir.startsWith('native/')) {
    const config = json(`${pkg.dir}/tsconfig.json`)
    config.references = (config.references ?? []).filter(
      (ref) =>
        (ref.path.endsWith('.json') && existsSync(resolve(source, pkg.dir, ref.path))) ||
        (existsSync(resolve(source, pkg.dir, ref.path, 'package.json')) &&
          (local.has(json(resolve(source, pkg.dir, ref.path, 'package.json')).name) ||
            selected.has(json(resolve(source, pkg.dir, ref.path, 'package.json')).name))),
    )
    save(`${pkg.dir}/tsconfig.json`, config)
  }
  for (const file of record.upstreamFiles)
    if (hash(file.path) !== file.sha256)
      record.localPatches.push({
        path: file.path,
        sha256: hash(file.path),
        reason: '按实际闭包收敛依赖和 TS references；保持源码行为',
      })
  registry.packages.push(record)
}
const all = workspacePackages()
const config = json('tsconfig.base.json')
for (const pkg of all) {
  for (const [key, entry] of Object.entries(pkg.exports ?? {})) {
    const type = typeof entry === 'object' && entry !== null ? entry.types : undefined
    if (type?.startsWith('./lib/types/') && type.endsWith('.d.ts'))
      config.compilerOptions.paths[pkg.name + (key === '.' ? '' : key.slice(1))] = [
        `./${pkg.dir}/src/${type.slice('./lib/types/'.length).replace(/\.d\.ts$/, '.ts')}`,
      ]
    if (key === './src/*')
      config.compilerOptions.paths[`${pkg.name}/src/*`] = [`./${pkg.dir}/src/*`]
  }
}
save('tsconfig.base.json', config)
const host = json('tsconfig.host.json')
const paths = new Set(host.references.map((ref) => ref.path))
for (const pkg of all)
  if (existsSync(`${pkg.dir}/tsconfig.json`) && !pkg.dir.startsWith('native/')) paths.add(pkg.dir)
host.references = [...paths].map((path) => ({ path }))
save('tsconfig.host.json', host)
save(registryPath, registry)
console.log(`${task}: migrated ${selected.size} packages; source commit ${commit}`)
