import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { workspacePackages } from './workspace.mjs'
const host = [],
  client = []
for (const p of workspacePackages()) {
  if (p.dir.startsWith('native/') || p.name === '@tianzhiai/web') continue
  if (existsSync(`${p.dir}/tsconfig.host.json`)) host.push({ path: `${p.dir}/tsconfig.host.json` })
  else if (!p.dir.startsWith('packages/client/')) host.push({ path: p.dir })
  if (existsSync(`${p.dir}/tsconfig.client.json`))
    client.push({ path: `${p.dir}/tsconfig.client.json` })
  else if (p.dir.startsWith('packages/client/') || p.name === '@tianzhiai/platform')
    client.push({ path: p.dir })
}
for (const [face, refs] of [
  ['host', host],
  ['client', client],
])
  writeFileSync(
    `tsconfig.${face}.json`,
    JSON.stringify(
      {
        extends: face === 'host' ? './tsconfig.base.json' : './tsconfig.base.client.json',
        files: [],
        references: refs,
      },
      null,
      2,
    ) + '\n',
  )
