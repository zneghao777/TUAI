import { build } from 'esbuild'
import { workspacePackages } from './workspace.mjs'

for (const pkg of workspacePackages()) {
  const dual = pkg.name === '@deepseek-ai/schemastery'
  for (const format of dual ? ['esm', 'cjs'] : ['esm']) {
    await build({
      entryPoints: [`${pkg.dir}/src/index.ts`],
      outfile: `${pkg.dir}/lib/index.${dual ? format === 'esm' ? 'mjs' : 'cjs' : 'js'}`,
      bundle: true,
      packages: 'external',
      platform: pkg.name === '@tianzhiai/platform' ? 'browser' : 'node',
      target: 'es2024',
      format,
      sourcemap: true,
    })
  }
  console.log(`Built ${pkg.name}@${pkg.version}`)
}
