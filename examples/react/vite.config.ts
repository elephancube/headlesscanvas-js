import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
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
      {
        find: /^@headless-canvas\/react$/,
        replacement: resolve(__dirname, '../../packages/react/src/index.tsx'),
      },
    ],
  },
})
