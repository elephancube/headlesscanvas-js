import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The stylesheet ships as a separate file the consumer imports, rather than
// being injected from JS: injection causes a flash of unstyled content during
// SSR, breaks under a strict style-src CSP, and cannot be opted out of by
// anyone replacing the default UI entirely (spec §7.5).
const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../src/styles.css')
const target = resolve(here, '../dist/styles.css')

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
