import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'tianzhiai-ui-closure',
      generateBundle(_options, bundle) {
        const modules = Object.values(bundle).flatMap((entry) =>
          entry.type === 'chunk'
            ? Object.entries(entry.modules)
                .filter(([, value]) => value.renderedLength > 0)
                .map(([id]) => id)
            : [],
        )
        const forbidden = modules.filter(
          (id) =>
            /packages\/(account|analytics|skill|telemetry)\//.test(id) ||
            /packages\/(credentials\/deepseek-account|host\/product-telemetry-otel)\//.test(id) ||
            /apps\/web\/src\/(components\/Conversation|model\/transcript)\./.test(id) ||
            /packages\/client\/(ui-skills?|ui-trajectory|product-analytics)\//.test(id) ||
            id.startsWith('__vite-browser-external:'),
        )
        if (forbidden.length) this.error(`Unexpected UI runtime closure: ${forbidden.join(', ')}`)
        for (const name of [
          'ui-session',
          'ui-renderer',
          'locale',
          'shortcuts',
          'ui-conversation',
          'ui-chat',
          'ui-tool',
          'ui-settings',
        ])
          if (!modules.some((id) => id.includes(`/packages/client/${name}/`)))
            this.error(`Missing DSH UI foundation: ${name}`)
        const report = resolve(workspace, 'reports/p2/ui-foundation-bundle.json')
        mkdirSync(resolve(workspace, 'reports/p2'), { recursive: true })
        writeFileSync(
          report,
          JSON.stringify(
            {
              modules: modules.map((id) => relative(workspace, id)).sort(),
              excludedRuntimePresent: forbidden.length,
            },
            null,
            2,
          ) + '\n',
        )
      },
    },
  ],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/dsh-typert-registry',
    ],
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', ws: true },
      '/connect': 'http://127.0.0.1:3100',
    },
  },
  build: { target: 'es2022', sourcemap: true },
})
