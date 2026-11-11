import { defineConfig } from 'vitest/config'
import base from './vitest.p2.config.ts'
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/p4/*.spec.ts'], exclude: [] },
})
