import { DrawTool, type DrawToolOptions, Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { addStroke, wave } from './seed'
import type { Demo } from './types'
import { t } from './types'
import { button, colorPicker, scaffold, slider, toggle } from './ui'

/**
 * Freehand drawing.
 *
 * A stroke is an ordinary `path` shape, which is the reason there is so little
 * here: it selects, resizes, serialises and exports as a vector because paths
 * already do. Try drawing one, switching to the select tool, and resizing it.
 */
export const drawing: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  // Held by reference and re-registered, so the panel below changes what the
  // next stroke looks like without the tool needing an API of its own.
  const options: DrawToolOptions = {
    color: '#2563eb',
    width: 6,
    tolerance: 1,
    smoothing: 1,
    minDistance: 2,
  }
  const apply = () => editor.tools.register('draw', (e) => new DrawTool(e, { ...options }))
  apply()
  editor.tools.setCurrent('draw')

  toggle(
    bar,
    (on) => (on ? _(['Tool: draw', 'ツール: 描画']) : _(['Tool: select', 'ツール: 選択'])),
    true,
    (on) => editor.tools.setCurrent(on ? 'draw' : 'select'),
  )

  colorPicker(bar, _(['Colour', '色']), options.color, (value) => {
    options.color = value
    apply()
  })

  slider(bar, _(['Width', '太さ']), { min: 1, max: 24, step: 1, value: options.width }, (value) => {
    options.width = value
    apply()
  })

  // The two halves of the fitting, exposed because their effect is the whole
  // difference between a drawn line and a list of coordinates.
  slider(
    bar,
    _(['Simplify', '間引き']),
    { min: 0, max: 6, step: 0.5, value: options.tolerance },
    (value) => {
      options.tolerance = value
      apply()
    },
  )

  slider(
    bar,
    _(['Smooth', '平滑化']),
    { min: 0, max: 1.5, step: 0.1, value: options.smoothing },
    (value) => {
      options.smoothing = value
      apply()
    },
  )

  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  const report = () => {
    const ids = editor.getChildren(null)
    const points = ids.reduce((total, id) => {
      const shape = editor.getShape<'path'>(id)
      // One command per fitted point, give or take the initial move.
      return total + (shape?.props.d.match(/[MLCQ]/g)?.length ?? 0)
    }, 0)
    setStatus(
      _([
        `${ids.length} stroke(s), ${points} points after fitting. Turn Simplify to 0 and draw again to see how many samples a pointer really produces.`,
        `${ids.length} 本のストローク、フィッティング後 ${points} 点。「間引き」を 0 にして描くと、ポインタが実際に何点吐いているかが分かります。`,
      ]),
    )
  }

  // Two strokes to start with, so the demo is not a blank rectangle and there
  // is something to select and resize without drawing first.
  editor.transact(() => {
    addStroke(editor, wave({ x: 50, y: 90 }, 300, 26, 2), { color: '#2563eb', width: 6 })
    addStroke(
      editor,
      [
        { x: 400, y: 120 },
        { x: 425, y: 150 },
        { x: 430, y: 155 },
        { x: 480, y: 70 },
      ],
      { color: '#16a34a', width: 8 },
    )
  })

  const stop = editor.subscribe(report)
  report()

  return {
    dispose() {
      stop()
      controls.dispose()
      editor.dispose()
    },
  }
}
