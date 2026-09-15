import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { addStroke, wave } from '../demos/seed'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'

/**
 * The editor in the hero.
 *
 * The page next to it claims the handles are DOM elements; this is the claim,
 * running, within reach of the cursor that just read it. A shape is selected
 * on mount so the handles are there before anyone clicks — an empty canvas
 * would prove nothing at a glance.
 *
 * Two things are deliberately taken away, because a hero is not a workspace:
 * the wheel, and every toolbar.
 */

const WIDTH = 380
const HEIGHT = 320

export const hero: Demo = ({ root, lang }) => {
  const _ = t(lang)

  const frame = document.createElement('div')
  frame.className = 'hc-hero-frame'

  const stage = document.createElement('div')
  stage.className = 'hc-hero-stage'

  const caption = document.createElement('p')
  caption.className = 'hc-hero-caption'
  caption.textContent = _([
    'Drag the handles. Each one is a <button> in the DOM.',
    'ハンドルを掴んでみてください。1つ1つが DOM の <button> です。',
  ])

  frame.append(stage)
  root.append(frame, caption)

  /**
   * The editor calls `preventDefault` on every wheel event over its container,
   * which is right for a canvas that owns the screen and wrong for one sitting
   * at the top of a page somebody is trying to scroll past. Stopping the event
   * on the way down means the editor never sees it and the page scrolls
   * normally — the application decides, without the library having to guess.
   */
  const swallowWheel = (event: WheelEvent) => event.stopPropagation()
  frame.addEventListener('wheel', swallowWheel, { capture: true })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  const selected = editor.transact(() => {
    const rect = editor.createShape({
      type: 'rect',
      x: 44,
      y: 58,
      width: 180,
      height: 116,
      props: {
        fill: { type: 'solid', color: '#144ffe' },
        stroke: null,
        cornerRadius: 12,
      },
    })
    editor.createShape({
      type: 'ellipse',
      x: 214,
      y: 128,
      width: 118,
      height: 118,
      props: {
        fill: {
          type: 'linear',
          angle: Math.PI / 3,
          stops: [
            { offset: 0, color: '#22d3ee' },
            { offset: 1, color: '#0a1937' },
          ],
        },
        stroke: null,
      },
    })
    addStroke(editor, wave({ x: 48, y: 232 }, 150, 14, 2), { color: '#ec4899', width: 7 })
    return rect
  })

  // Selected, not merely present: the handles are the point.
  editor.selection.set([selected])

  // Sized to the artwork rather than to the container, so the scene sits the
  // same way at every breakpoint the hero is shown at.
  const fit = () => {
    const width = editor.container.clientWidth || WIDTH
    const height = editor.container.clientHeight || HEIGHT
    const zoom = Math.max(Math.min(width / WIDTH, height / HEIGHT), 0.2)
    editor.viewport.setCamera({
      z: zoom,
      x: WIDTH / 2 - width / 2 / zoom,
      y: HEIGHT / 2 - height / 2 / zoom,
    })
  }
  fit()

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fit())
  observer?.observe(stage)

  return {
    dispose() {
      observer?.disconnect()
      frame.removeEventListener('wheel', swallowWheel, { capture: true })
      controls.dispose()
      editor.dispose()
    },
  }
}
