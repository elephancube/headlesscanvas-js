import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests resolve workspace packages to their sources, so a stale dist can never
// be what is under test.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@headless-canvas\/core$/,
        replacement: resolve(__dirname, 'packages/core/src/index.ts'),
      },
      {
        find: '@headless-canvas/ui/styles.css',
        replacement: resolve(__dirname, 'packages/ui/src/styles.css'),
      },
      {
        find: /^@headless-canvas\/ui$/,
        replacement: resolve(__dirname, 'packages/ui/src/index.ts'),
      },
    ],
  },
  test: {
    // The documentation demos are covered too: they are the site's main
    // deliverable and a broken one is otherwise invisible until it is opened.
    include: ['packages/*/test/**/*.test.ts', 'docs/test/**/*.test.ts'],
    environment: 'node',
  },
})
