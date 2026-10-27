import { globSync, readFileSync } from 'node:fs'

export function workspacePackages() {
  return globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'apps/*/package.json'])
    .sort().map(path => ({ dir: path.slice(0, -'/package.json'.length), ...JSON.parse(readFileSync(path, 'utf8')) }))
}
