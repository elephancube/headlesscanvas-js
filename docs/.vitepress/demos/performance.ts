import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from './types'
import { t } from './types'
import { button, pickColor, scaffold } from './ui'

/**
 * The claim behind invariants 2 and 3, measured on the page.
 *
 * Panning and zooming write one transform to one element per frame, and the
 * overlay only ever holds control DOM for the selection. The readout therefore
 * shows a node count that does not move as the shape count goes up by
 * thousands — which is the whole reason the architecture is arranged this way.
 */
export const performance_: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root, { height: 340 })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  function add(count: number): void {
    const existing = editor.getSnapshot().shapes.size
    editor.transact(() => {
      for (let i = 0; i < count; i++) {
        const n = existing + i
        editor.createShape({
          type: 'rect',
          x: (n % 100) * 60,
          y: Math.floor(n / 100) * 60,
          width: 44,
          height: 32,
          props: { fill: { type: 'solid', color: pickColor(n) }, stroke: null, cornerRadius: 3 },
        })
      }
    })
    editor.viewport.zoomToFit()
  }

  button(bar, _(['Add 1,000 shapes', '1,000 個追加']), () => add(1000))
  button(bar, _(['Add 5,000 shapes', '5,000 個追加']), () => add(5000))
  button(bar, _(['Zoom to fit', '全体表示']), () => editor.viewport.zoomToFit())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  // Sampled from a loop of its own rather than from onFrame, because onFrame
  // only runs when something changed — an idle editor draws no frames at all.
  let frames = 0
  let fps = 0
  let lastSample = window.performance.now()
  let raf = 0

  function sample(now: number): void {
    frames++
    if (now - lastSample >= 500) {
      fps = Math.round((frames * 1000) / (now - lastSample))
      frames = 0
      lastSample = now
    }
    const stats = editor.getRenderStats()
    const overlayNodes = editor.overlayElement.querySelectorAll('*').length
    setStatus(
      _([
        `${editor.getSnapshot().shapes.size} shapes · ${stats.drawn} drawn / ${stats.culled} culled · ` +
          `${overlayNodes} overlay DOM nodes · ${fps} fps`,
        `図形 ${editor.getSnapshot().shapes.size} 個 · 描画 ${stats.drawn} / カリング ${stats.culled} · ` +
          `オーバーレイの DOM ノード ${overlayNodes} 個 · ${fps} fps`,
      ]),
    )
    raf = requestAnimationFrame(sample)
  }
  raf = requestAnimationFrame(sample)

  add(1000)

  return {
    dispose() {
      cancelAnimationFrame(raf)
      controls.dispose()
      editor.dispose()
    },
  }
}
