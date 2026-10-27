import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

const paths: Record<string, string[]> = JSON.parse(readFileSync('tsconfig.base.json', 'utf8'))
  .compilerOptions.paths
export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: {
    alias: Object.entries(paths)
      .sort(([a], [b]) => b.length - a.length)
      .map(([key, values]) => ({
        find: new RegExp(`^${key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '(.*)')}$`),
        replacement: resolve(values[0]!).replace('*', '$1'),
      })),
  },
  test: {
    include: [
      'tests/p1/**/*.spec.ts',
      ...JSON.parse(readFileSync('tests/p1/upstream-suites.json', 'utf8')),
    ],
    pool: 'forks',
    execArgv: vitestExecArgv,
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['tests/fixtures/network-guard.ts'],
  },
})
