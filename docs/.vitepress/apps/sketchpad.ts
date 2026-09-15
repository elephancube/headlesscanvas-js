import { DrawTool, type DrawToolOptions, Editor, type Vec } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { addStroke } from '../demos/seed'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button, colorPicker, slider } from '../demos/ui'
import { appScaffold, download, EraseTool, radio, shareImage, shareOutcomeText } from './chrome'

/**
 * A sketchpad.
 *
 * Small on purpose: every stroke is an ordinary `path` shape, so selecting,
 * moving, resizing, undoing and exporting are already implemented before this
 * file starts. What is left for the application is the part a library should
 * not decide — the toolbar, the palette, and what "share" means.
 */

const SHARE_TEXT = 'Drawn with HeadlessCanvas — https://headlesscanvas.com/'

const PALETTE = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed']

type Mode = 'draw' | 'erase' | 'select'

/** Points around a circle, sampled the way a pointer moving in one would be. */
function ring(centre: Vec, radius: number, samples = 40, from = 0, to = Math.PI * 2): Vec[] {
  return Array.from({ length: samples }, (_, i) => {
    const angle = from + ((to - from) * i) / (samples - 1)
    return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius }
  })
}

export const sketchpad: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint, say } = appScaffold(root, { plain: true })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  /**
   * Held by reference and handed to a fresh tool whenever it changes.
   *
   * Re-registering under the same id replaces the live instance, which is how a
   * tool gets reconfigured — there is no settings API on the tool itself, and
   * an application tool would be configured the same way.
   */
  const pen: DrawToolOptions = {
    color: PALETTE[1] as string,
    width: 6,
    tolerance: 1,
    smoothing: 1,
    minDistance: 2,
  }
  const applyPen = () => editor.tools.register('draw', (e) => new DrawTool(e, { ...pen }))

  applyPen()
  editor.tools.register('erase', (e) => new EraseTool(e))
  editor.tools.setCurrent('draw')

  const setMode = radio<Mode>(
    bar,
    _(['Tool', 'ツール']),
    [
      { value: 'draw', label: _(['Draw', '描く']) },
      { value: 'erase', label: _(['Erase', '消す']) },
      { value: 'select', label: _(['Select', '選択']) },
    ],
    'draw',
    (mode) => editor.tools.setCurrent(mode === 'select' ? 'select' : mode),
  )

  colorPicker(bar, _(['Ink', 'インク']), pen.color, (value) => {
    pen.color = value
    applyPen()
  })

  slider(bar, _(['Width', '太さ']), { min: 1, max: 32, step: 1, value: pen.width }, (value) => {
    pen.width = value
    applyPen()
  })

  const swatches = document.createElement('div')
  swatches.className = 'hc-app-group'
  swatches.setAttribute('role', 'group')
  swatches.setAttribute('aria-label', _(['Palette', 'パレット']))
  for (const colour of PALETTE) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'hc-app-swatch'
    swatch.style.background = colour
    swatch.setAttribute('aria-label', colour)
    swatch.addEventListener('click', () => {
      pen.color = colour
      applyPen()
      // Picking a colour is a statement of intent to draw with it.
      setMode('draw')
      editor.tools.setCurrent('draw')
    })
    swatches.append(swatch)
  }
  bar.append(swatches)

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  /** Both exports share a frame, so the two files show the same drawing. */
  const frame = { background: '#ffffff', padding: 24 } as const

  const empty = () => editor.getChildren(null).length === 0
  const nothingToExport = () => say(_(['Draw something first.', 'まず何か描いてください。']))

  button(bar, _(['Save PNG', 'PNG保存']), () => {
    if (empty()) return nothingToExport()
    editor
      .export({ format: 'png', scale: 2, ...frame })
      .then((blob) => {
        download('sketch.png', blob)
        say(_(['Saved sketch.png at 2×.', 'sketch.png を 2 倍で保存しました。']))
      })
      .catch((error: unknown) => say(String(error)))
  })

  // Vectors rather than pixels: the file is the strokes themselves, so it stays
  // sharp at any size and opens in a drawing program.
  button(bar, _(['Save SVG', 'SVG保存']), () => {
    if (empty()) return nothingToExport()
    const svg = editor.exportSvg(frame)
    download('sketch.svg', new Blob([svg], { type: 'image/svg+xml' }))
    say(
      _([
        `Saved sketch.svg — ${svg.length.toLocaleString()} characters of vector.`,
        `sketch.svg を保存しました（ベクタ ${svg.length.toLocaleString()} 文字）。`,
      ]),
    )
  })

  button(bar, _(['Share on social', 'SNSなどで共有']), () => {
    if (empty()) return nothingToExport()
    editor
      .export({ format: 'png', scale: 2, ...frame })
      .then((blob) => shareImage(blob, 'sketch.png', SHARE_TEXT))
      .then((outcome) => say(shareOutcomeText(_, outcome)))
      .catch((error: unknown) => say(String(error)))
  })

  hint(
    _([
      'Draw with a mouse, a finger or a pen. Erase sweeps away whole strokes — one undo brings back everything a single sweep removed.',
      'マウス・指・ペンで描けます。「消す」はストロークごと消えます。ひと続きのなぞりで消したものは、元に戻す1回でまとめて戻ります。',
    ]),
  )

  const report = () => {
    const ids = editor.getChildren(null)
    setStatus(
      _([
        `${ids.length} stroke(s) · ${editor.selection.ids.length} selected · ` +
          `${editor.overlayElement.querySelectorAll('*').length} overlay DOM nodes`,
        `${ids.length} 本のストローク · ${editor.selection.ids.length} 個選択中 · ` +
          `オーバーレイの DOM ノード ${editor.overlayElement.querySelectorAll('*').length} 個`,
      ]),
    )
  }

  // Something to look at, and something to select and resize without drawing
  // first. One transaction, so a single undo clears the lot.
  editor.transact(() => {
    addStroke(editor, ring({ x: 150, y: 150 }, 70), { color: '#f59e0b', width: 8 })
    addStroke(editor, ring({ x: 320, y: 210 }, 90, 30, Math.PI * 0.15, Math.PI * 0.85), {
      color: '#2563eb',
      width: 6,
    })
    addStroke(
      editor,
      [
        { x: 430, y: 120 },
        { x: 455, y: 148 },
        { x: 462, y: 155 },
        { x: 520, y: 70 },
      ],
      { color: '#16a34a', width: 9 },
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
