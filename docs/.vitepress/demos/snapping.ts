import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from './types'
import { t } from './types'
import { scaffold, slider, toggle } from './ui'

/**
 * Snapping, with the guides drawn by the control layer.
 *
 * Object snapping takes priority over the grid: pulling something the user
 * aligned by eye onto a grid line one pixel away destroys the alignment they
 * were making (spec §9.2).
 */
export const snapping: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  toggle(
    bar,
    (on) => (on ? _(['Grid: 20', 'グリッド: 20']) : _(['Grid: off', 'グリッド: なし'])),
    false,
    (on) => editor.setSnapping({ grid: on ? 20 : null }),
  )

  toggle(
    bar,
    (on) =>
      on
        ? _(['Snap to objects: on', '図形へ吸着: オン'])
        : _(['Snap to objects: off', '図形へ吸着: オフ']),
    true,
    (on) => editor.setSnapping({ toObjects: on }),
  )

  slider(
    bar,
    _(['Threshold (px)', 'しきい値 (px)']),
    { min: 1, max: 20, step: 1, value: 5 },
    (value) => editor.setSnapping({ thresholdPx: value }),
  )

  setStatus(
    _([
      'Drag a shape near another one. Hold Alt to suspend snapping while dragging.',
      '図形を他の図形の近くへドラッグしてください。Alt を押している間は吸着が一時的に無効になります。',
    ]),
  )

  editor.transact(() => {
    editor.createShape({
      type: 'rect',
      x: 90,
      y: 60,
      width: 150,
      height: 100,
      props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 6 },
    })
    editor.createShape({
      type: 'rect',
      x: 330,
      y: 60,
      width: 150,
      height: 100,
      props: { fill: { type: 'solid', color: '#22c55e' }, cornerRadius: 6 },
    })
    editor.createShape({
      type: 'ellipse',
      x: 200,
      y: 200,
      width: 96,
      height: 96,
      props: { fill: { type: 'solid', color: '#f59e0b' } },
    })
  })

  return {
    dispose() {
      controls.dispose()
      editor.dispose()
    },
  }
}
