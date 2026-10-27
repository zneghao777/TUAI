import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  test: {
    include: ['packages/**/tests/**/*.spec.ts'],
    execArgv: vitestExecArgv,
  },
})
