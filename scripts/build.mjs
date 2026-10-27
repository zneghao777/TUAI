import { build } from 'esbuild'
import { workspacePackages } from './workspace.mjs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

execFileSync(process.execPath, ['native/system/scripts/build.ts', '--host-addon-only'], {
  stdio: 'inherit',
})

for (const pkg of workspacePackages()) {
  // The Node-API entry has its own emitted subpath modules and platform binaries.
  if (pkg.dir.startsWith('native/')) continue
  const dual = pkg.name === '@deepseek-ai/schemastery'
  const exportedEntries = new Set(['index'])
  if (pkg.name === '@deepseek-ai/dsh-sandbox-windows-acl') exportedEntries.add('runner')
  for (const entry of Object.values(pkg.exports ?? {})) {
    const file = typeof entry === 'object' && entry !== null ? entry.default : undefined
    if (typeof file === 'string' && /^\.\/lib\/[^/]+\.js$/.test(file)) {
      const name = file.slice('./lib/'.length, -3)
      // Generated Remote surfaces belong to P2; P1 does not load those exports.
      if (name.startsWith('typert.')) continue
      if (pkg.name === '@deepseek-ai/dsh-subprocess-local' && name === 'runner') {
        exportedEntries.add('bin')
        continue
      }
      if (!existsSync(`${pkg.dir}/src/${name}.ts`))
        throw new Error(`Missing build entry: ${pkg.name}/${name}`)
      exportedEntries.add(name)
    }
  }
  for (const format of dual ? ['esm', 'cjs'] : ['esm']) {
    const result = await build({
      entryPoints:
        pkg.name === '@tianzhiai/cli'
          ? ['index', 'boot', 'probe'].map((name) => `${pkg.dir}/src/${name}.ts`)
          : Object.fromEntries(
              [...exportedEntries].map((name) => [
                pkg.name === '@deepseek-ai/dsh-subprocess-local' && name === 'bin'
                  ? 'runner'
                  : name,
                `${pkg.dir}/src/${name}.ts`,
              ]),
            ),
      outdir: `${pkg.dir}/lib`,
      outExtension: { '.js': dual ? (format === 'esm' ? '.mjs' : '.cjs') : '.js' },
      bundle: true,
      packages: 'external',
      // TS aliases are a typechecking facade; bundling them would duplicate services.
      tsconfigRaw: { compilerOptions: {} },
      metafile: true,
      platform: pkg.name === '@tianzhiai/platform' ? 'browser' : 'node',
      target: 'es2024',
      format,
      splitting: format === 'esm' && exportedEntries.size > 1,
      chunkNames: 'shared-[hash]',
      sourcemap: true,
    })
    for (const input of Object.keys(result.metafile.inputs)) {
      if (!input.startsWith(`${pkg.dir}/src/`)) {
        throw new Error(`${pkg.name}: cross-package source bundled: ${input}`)
      }
    }
  }
  console.log(`Built ${pkg.name}@${pkg.version}`)
}

// Keep the upstream public bootstrap export and its private resolution closure.
await build({
  entryPoints: ['packages/boot/app-boot/src/profile-resolution/worker-bootstrap.ts'],
  outfile: 'packages/boot/app-boot/lib/worker/profile-resolution-bootstrap.js',
  bundle: true,
  packages: 'bundle',
  platform: 'node',
  target: 'es2024',
  format: 'esm',
  tsconfigRaw: { compilerOptions: {} },
})

// The migration verifier runs in a fresh Worker. Inline its JS-only workspace
// closure. Inline its transitive npm JS dependencies as well, so a copied
// verifier has no undeclared resolution through the host's node_modules.
// Native remains external.
const paths = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')).compilerOptions.paths
await build({
  entryPoints: ['packages/session/session-persistence-jsonl/src/worker.ts'],
  outfile: 'packages/session/session-persistence-jsonl/lib/worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2024',
  packages: 'bundle',
  tsconfigRaw: { compilerOptions: {} },
  define: { 'import.meta.url': '__workerModuleUrl' },
  banner: { js: 'const __workerModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
  plugins: [
    {
      name: 'isolated-worker-closure',
      setup(builder) {
        builder.onResolve({ filter: /^@deepseek-ai\// }, ({ path }) => {
          if (path.startsWith('@deepseek-ai/node-addon-system')) return { path, external: true }
          const source = paths[path]?.[0]
          if (!source) throw new Error(`Worker dependency has no source mapping: ${path}`)
          return { path: resolve(source) }
        })
      },
    },
  ],
})
