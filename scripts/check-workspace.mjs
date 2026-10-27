import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { globSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { workspacePackages } from './workspace.mjs'

const root = process.cwd()
const read = (path) => readFileSync(path, 'utf8')
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const packages = workspacePackages()
const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
assert.equal(byName.size, packages.length, 'Duplicate package identity')
const cordis = realpathSync('vendor/cordis/lib/index.js')
const references = JSON.parse(read('docs/migration/M0-迁移登记.json'))
for (const snapshot of references.snapshots)
  assert.equal(hash(snapshot.path), snapshot.sha256, snapshot.path)
for (const pkg of references.packages) {
  for (const file of pkg.upstreamFiles) {
    const patch = pkg.localPatches.find((patch) => patch.path === file.path)
    assert.equal(
      hash(file.path),
      patch?.sha256 ?? file.sha256,
      `Undocumented source change: ${file.path}`,
    )
  }
  for (const file of pkg.additionalFiles) assert.equal(hash(file.path), file.sha256, file.path)
}
assert.equal(references.unresolvedReferences.length, 0)
assert.equal(hash(references.startupAdaptation.target), references.startupAdaptation.targetSha256)
for (const file of references.testSupport) assert.equal(hash(file.target), file.sha256)
const core = JSON.parse(read('docs/migration/M1-迁移登记.json'))
for (const pkg of core.packages) {
  assert.ok(byName.has(pkg.name), `Missing migrated package: ${pkg.name}`)
  for (const file of pkg.upstreamFiles) {
    const patch = pkg.localPatches.find((patch) => patch.path === file.path)
    assert.equal(
      hash(file.path),
      patch?.sha256 ?? file.sha256,
      `Undocumented source change: ${file.path}`,
    )
  }
  for (const file of pkg.additionalFiles) assert.equal(hash(file.path), file.sha256, file.path)
}
for (const file of core.support)
  assert.equal(hash(file.path), file.localSha256 ?? file.sha256, file.path)

const forbiddenRoots = [
  root,
  ...Object.values(JSON.parse(read('docs/specs/appendices/上游源码基线.json')).sources)
    .map((source) => source.localReferencePath)
    .filter(Boolean),
]
let imports = 0
for (const pkg of packages) {
  const declared = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }
  const req = createRequire(resolve(pkg.dir, 'package.json'))
  if (declared['@deepseek-ai/cordis'])
    assert.equal(realpathSync(req.resolve('@deepseek-ai/cordis')), cordis, pkg.name)
  for (const [name, version] of Object.entries(declared)) {
    assert.ok(
      !version.startsWith('link:') && !version.startsWith('file:'),
      `${pkg.name}: external source link`,
    )
    if (version.startsWith('workspace:'))
      assert.ok(byName.has(name), `${pkg.name}: unresolved workspace ${name}`)
    else if (!pkg.peerDependenciesMeta?.[name]?.optional) req.resolve(name)
    if (version.startsWith('workspace:') && !pkg.peerDependenciesMeta?.[name]?.optional) {
      const dependency = byName.get(name)
      if (!dependency.os || dependency.os.includes(process.platform)) {
        req.resolve(dependency.exports?.['.'] ? name : `${name}/package.json`)
      }
    }
  }
  for (const file of globSync(`${pkg.dir}/src/**/*.ts`)) {
    const source = read(file)
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest)
    for (const node of tree.statements) {
      if (
        (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
        !node.moduleSpecifier ||
        !ts.isStringLiteral(node.moduleSpecifier)
      )
        continue
      const name = node.moduleSpecifier.text
      if (name.startsWith('.') || name.startsWith('node:')) continue
      const owner = name.startsWith('@')
        ? name.split('/').slice(0, 2).join('/')
        : name.split('/')[0]
      const typeOnly = node.isTypeOnly || node.importClause?.isTypeOnly
      assert.ok(
        owner in declared || (typeOnly && owner in (pkg.devDependencies ?? {})),
        `${file}: undeclared import ${name}`,
      )
      imports++
    }
    for (const path of forbiddenRoots)
      assert.ok(!source.includes(path), `${file}: developer source path`)
    if (pkg.name === '@tianzhiai/platform')
      assert.ok(!/from ['"]node:|\bprocess\./.test(source), `${file}: Node in Client`)
  }
  for (const file of globSync(`${pkg.dir}/lib/**/*.js`)) {
    for (const path of forbiddenRoots)
      assert.ok(!read(file).includes(path), `${file}: absolute build dependency`)
  }
  for (const [subpath, definition] of Object.entries(pkg.exports ?? {})) {
    if (subpath.includes('*') || subpath === './package.json' || typeof definition !== 'object')
      continue
    // Remote code generation and transport are explicitly deferred to TZ-015/016.
    if (definition?.default?.includes('/typert.')) continue
    if (definition?.default)
      assert.ok(
        globSync(`${pkg.dir}/${definition.default}`).length,
        `${pkg.name}${subpath}: missing runtime export`,
      )
    if (definition?.types)
      assert.ok(
        globSync(`${pkg.dir}/${definition.types}`).length,
        `${pkg.name}${subpath}: missing type export`,
      )
  }
}
console.log(
  `Workspace: ${packages.length} unique packages, ${imports} declared source imports, one Cordis identity; provenance and runtime paths verified`,
)
