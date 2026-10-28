import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

const paths: Record<string, string[]> = JSON.parse(readFileSync('tsconfig.base.json', 'utf8'))
  .compilerOptions.paths
const comparisonRoot = process.env.TIANZHI_PARITY_ROOT
const conversationTests: string[] = JSON.parse(
  readFileSync('tests/p2/conversation-fixtures.json', 'utf8'),
)
export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: {
    alias: Object.entries(paths)
      .sort(([a], [b]) => b.length - a.length)
      .map(([key, values]) => ({
        find: new RegExp(`^${key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '(.*)')}$`),
        replacement: resolve(
          comparisonRoot && /packages\/client\/ui-(?:chat|conversation)\//.test(values[0]!)
            ? resolve(comparisonRoot, values[0]!)
            : values[0]!,
        ).replace('*', '$1'),
      })),
  },
  test: {
    include: process.env.TIANZHI_CONVERSATION_PARITY
      ? conversationTests.map((path) => resolve(comparisonRoot ?? '.', path))
      : [
          'tests/p2/**/*.spec.ts',
          ...conversationTests,
          'packages/api/session-controller/tests/**/*.spec.ts',
          'packages/client/connection/tests/**/*.spec.ts',
          'packages/api/gateway/tests/**/*.spec.ts',
          'packages/api/remote-access/tests/**/*.spec.ts',
          'packages/typert/registry/tests/**/*.spec.ts',
          'packages/typert/loader/tests/**/*.spec.ts',
        ],
    exclude: [
      'tests/p2/browser/**',
      'packages/api/session-controller/tests/session.client.spec.ts',
      'packages/api/session-controller/tests/projection-store.client.spec.ts',
      'packages/api/session-controller/tests/manager.client.spec.ts',
      'packages/api/session-controller/tests/session-pending-submissions.client.spec.ts',
      'packages/api/session-controller/tests/inbox-projection.client.spec.ts',
      'packages/api/session-controller/tests/sessions-service.client.spec.ts',
      'packages/api/session-controller/tests/reference-ownership.client.spec.ts',
      'packages/api/session-controller/tests/client-apply.client.spec.ts',
    ],
    pool: 'forks',
    execArgv: vitestExecArgv,
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['tests/fixtures/network-guard.ts'],
  },
})
