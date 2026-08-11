import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Aliased to the sources so the example runs without building the packages
// first. Exact-match patterns keep the subpath export (styles.css) working the
// same way it will once installed from npm.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@headless-canvas/ui/styles.css',
        replacement: resolve(__dirname, '../../packages/ui/src/styles.css'),
      },
      {
        find: /^@headless-canvas\/core$/,
        replacement: resolve(__dirname, '../../packages/core/src/index.ts'),
      },
      {
        find: /^@headless-canvas\/ui$/,
        replacement: resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
    ],
  },
})
