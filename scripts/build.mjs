import { build } from 'esbuild'
import { workspacePackages } from './workspace.mjs'

for (const pkg of workspacePackages()) {
  const dual = pkg.name === '@deepseek-ai/schemastery'
  for (const format of dual ? ['esm', 'cjs'] : ['esm']) {
    const result = await build({
      entryPoints:
        pkg.name === '@tianzhiai/cli'
          ? ['index', 'boot', 'probe'].map((name) => `${pkg.dir}/src/${name}.ts`)
          : [`${pkg.dir}/src/index.ts`],
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
