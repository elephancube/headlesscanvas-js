#!/usr/bin/env node
import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bundle size report.
 *
 * Two numbers are printed per package, and the distinction matters. The barrel
 * is every export concatenated, which no application actually loads. The
 * tree-shaken example is what a real consumer pays. Budgets are therefore
 * advisory targets rather than build failures — the build only fails on a
 * ceiling set far enough above the target that crossing it means something went
 * genuinely wrong, such as a dependency creeping into `core`.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const targets = [
  { name: '@headless-canvas/core', file: 'packages/core/dist/index.js', target: 30_000, limit: 60_000 },
  { name: '@headless-canvas/ui', file: 'packages/ui/dist/index.js', target: 6_000, limit: 15_000 },
  { name: '@headless-canvas/react', file: 'packages/react/dist/index.js', target: 4_000, limit: 10_000 },
]

const kb = (bytes) => `${(bytes / 1000).toFixed(1)}kB`

let failed = false
let warned = false

console.log('Bundle sizes (gzip):\n')

for (const entry of targets) {
  const path = resolve(root, entry.file)
  if (!existsSync(path)) {
    console.error(`  ✗ ${entry.name.padEnd(24)} missing ${entry.file} — run "pnpm build" first`)
    failed = true
    continue
  }

  const size = gzipSync(readFileSync(path)).length
  const status = size > entry.limit ? '✗' : size > entry.target ? '!' : '✓'
  if (size > entry.limit) failed = true
  else if (size > entry.target) warned = true

  console.log(
    `  ${status} ${entry.name.padEnd(24)} ${kb(size).padStart(8)}` +
      `   target ${kb(entry.target)}   ceiling ${kb(entry.limit)}`,
  )
}

if (warned && !failed) {
  console.log(
    '\n! Over target but under the ceiling. Targets are advisory: what a consumer\n' +
      '  actually ships is the tree-shaken bundle, not the barrel measured here.',
  )
}
if (failed) {
  console.error('\n✗ A bundle exceeded its ceiling, or a build artefact was missing.')
  process.exit(1)
}
