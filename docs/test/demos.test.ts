// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installStubs } from '../../packages/ui/test/harness'
import { demos } from '../.vitepress/demos'
import type { Lang } from '../.vitepress/demos/types'

/**
 * The demos are the main thing the documentation site delivers, and a broken
 * one is invisible until somebody opens the page. Mounting each of them here
 * turns that into a test failure instead.
 *
 * This is a smoke test rather than a rendering test: jsdom has no 2D context,
 * so what it proves is that a demo constructs, survives a frame and tears down
 * cleanly — which is where the mistakes actually are.
 */

const ids = Object.keys(demos)
const languages: Lang[] = ['en', 'ja']

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

afterEach(() => {
  document.body.replaceChildren()
})

describe('documentation demos', () => {
  it('are all registered', () => {
    expect(ids).toContain('basics')
    expect(ids.length).toBeGreaterThan(5)
  })

  for (const id of ids) {
    for (const lang of languages) {
      it(`${id} mounts and disposes (${lang})`, async () => {
        installStubs()
        const root = document.createElement('div')
        document.body.append(root)

        const demo = await demos[id]!()
        const instance = demo({ root, lang })

        // Every demo puts an editor on the page, and the editor claims its
        // container by adding this class.
        expect(root.querySelector('.hc-container')).not.toBeNull()

        await nextFrame()

        instance.dispose()
        expect(root.querySelector('.hc-container')).toBeNull()
      })
    }
  }
})
