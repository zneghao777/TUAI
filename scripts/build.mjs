import { build } from 'esbuild'
import { workspacePackages } from './workspace.mjs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync, existsSync, globSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'

execFileSync(process.execPath, ['native/system/scripts/build.ts', '--host-addon-only'], {
  stdio: 'inherit',
})

for (const pkg of workspacePackages()) {
  // The Node-API entry has its own emitted subpath modules and platform binaries.
  if (pkg.dir.startsWith('native/') || pkg.name === '@tianzhiai/web') continue
  // Preserve browser module boundaries and CSS imports for Vite. The upstream
  // loader's closure bundles are not used by this product's static ESM build.
  // tsc already rewrites relative TS extensions; its JS is the build input.
  if (
    [
      'ui-session',
      'locale',
      'shortcuts',
      'ui-settings',
      'ui-primitives',
      'ui-conversation',
      'ui-chat',
      'ui-attachment',
      'ui-tool',
      'ui-layout',
      'ui-theme',
      'ui-file-drag',
      'ui-sidebar-right',
      'ui-dockkit',
      'resources',
      'ui-sidebar-browser',
      'ui-input-trigger',
      'ui-sidebar-documentpreview',
      'ui-workspace',
      'ui-sidebar',
      'ui-approval',
      'product-analytics',
    ].some((name) => pkg.dir === `packages/client/${name}`)
  ) {
    const typeDir = `${pkg.dir}/lib/types`
    await build({
      entryPoints: globSync(`${typeDir}/**/*.js`),
      outbase: typeDir,
      outdir: `${pkg.dir}/lib/esm`,
      bundle: false,
      tsconfigRaw: { compilerOptions: {} },
      sourcemap: true,
      platform: 'browser',
      target: 'es2022',
      format: 'esm',
    })
    for (const file of globSync(`${pkg.dir}/src/**/*`)) {
      if (!/\.(css|svg|png|jpg|jpeg|webp|woff2?)$/.test(file)) continue
      const destination = `${pkg.dir}/lib/esm/${relative(`${pkg.dir}/src`, file)}`
      mkdirSync(dirname(destination), { recursive: true })
      cpSync(file, destination)
    }
    for (const entry of Object.values(pkg.exports)) {
      if (typeof entry !== 'object' || !entry?.types?.startsWith('./lib/types/')) continue
      if (!entry.default?.endsWith('.js')) continue
      const target = entry.types.slice('./lib/types/'.length).replace(/\.d\.ts$/, '.js')
      const source = readFileSync(`${typeDir}/${target}`, 'utf8')
      writeFileSync(
        `${pkg.dir}/${entry.default}`,
        `export * from './esm/${target}'\n` +
          (/export\s*\{[^}]*\bdefault\b|export default/.test(source)
            ? `export { default } from './esm/${target}'\n`
            : ''),
      )
    }
    console.log(`Built browser ESM and resources ${pkg.name}`)
    continue
  }
  const dual = pkg.name === '@deepseek-ai/schemastery'
  const exportedEntries = new Set(['index'])
  const entrySources = new Map([['index', `${pkg.dir}/src/index.ts`]])
  if (pkg.name === '@deepseek-ai/dsh-sandbox-windows-acl') {
    exportedEntries.add('runner')
    entrySources.set('runner', `${pkg.dir}/src/runner.ts`)
  }
  for (const [key, entry] of Object.entries(pkg.exports ?? {})) {
    if (typeof entry !== 'object' || entry === null || key === './src/*') continue
    for (const file of new Set([entry.default, entry.node, entry.browser])) {
      if (typeof file !== 'string' || !file.endsWith('.js') || !file.startsWith('./lib/')) continue
      const name = file.slice('./lib/'.length, -3)
      if (name.startsWith('typert.') || name.includes('/')) continue
      const source =
        key === './client'
          ? `${pkg.dir}/src/client/index.ts`
          : pkg.name === '@deepseek-ai/dsh-subprocess-local' && name === 'runner'
            ? `${pkg.dir}/src/bin.ts`
            : `${pkg.dir}/src/${name}.ts`
      if (!existsSync(source)) throw new Error(`Missing build entry: ${pkg.name}/${name}`)
      exportedEntries.add(name)
      entrySources.set(name, source)
    }
  }
  for (const format of dual ? ['esm', 'cjs'] : ['esm']) {
    const result = await build({
      entryPoints:
        pkg.name === '@tianzhiai/cli'
          ? ['index', 'boot', 'probe', 'web'].map((name) => `${pkg.dir}/src/${name}.ts`)
          : Object.fromEntries(entrySources),
      outdir: `${pkg.dir}/lib`,
      outExtension: { '.js': dual ? (format === 'esm' ? '.mjs' : '.cjs') : '.js' },
      bundle: true,
      packages: 'external',
      // TS aliases are a typechecking facade; bundling them would duplicate services.
      tsconfigRaw: { compilerOptions: {} },
      metafile: true,
      jsx: 'automatic',
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
