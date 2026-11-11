import { defineConfig } from 'vitest/config'
import core from './vitest.config.ts'

export default defineConfig({
  ...core,
  test: {
    ...core.test,
    include: [
      'packages/util/brand/tests/brand.spec.ts',
      'packages/typert/protocol/tests/protocol.spec.ts',
      'packages/typert/protocol/tests/owned-value.spec.ts',
      'packages/typert/protocol/tests/remote-access.spec.ts',
      'packages/typert/protocol/tests/remote-info.spec.ts',
      'packages/boot/cmdline/tests/cmdline.spec.ts',
    ],
  },
})
