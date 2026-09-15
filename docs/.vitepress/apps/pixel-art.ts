import type { Editor as EditorInstance, HcPointerEvent, ShapeId, Tool } from '@headless-canvas/core'
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button, colorPicker } from '../demos/ui'
import { appScaffold, download, radio, shareImage, shareOutcomeText } from './chrome'

/**
 * A pixel editor.
 *
 * One painted cell is one `rect` shape, which sounds extravagant and is the
 * reason the application is short: erasing, undo, selection and export all
 * arrived already working. A full 32×32 board is 1,024 shapes, comfortably
 * inside what the renderer culls and indexes for a living.
 *
 * It also gets the export right for free. Exporting at 16× does not resample a
 * small bitmap — it draws the same rectangles sixteen times larger, so the
 * edges stay exactly as hard as they look here.
 */

const GRID = 32
const CELL = 12
const SIZE = GRID * CELL

/** Sixteen colours, so the palette is a row of buttons rather than a dialog. */
const PALETTE = [
  '#111827',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#fde047',
  '#22c55e',
  '#15803d',
  '#22d3ee',
  '#3b82f6',
  '#1e3a8a',
  '#a855f7',
  '#ec4899',
  '#fbcfe8',
  '#a16207',
  '#9ca3af',
]

type Mode = 'paint' | 'erase' | 'fill' | 'pick'

interface Cell {
  id: ShapeId
  color: string
}

const cellKey = (col: number, row: number): string => `${col},${row}`

const inside = (col: number, row: number): boolean =>
  col >= 0 && row >= 0 && col < GRID && row < GRID

/**
 * The board as it currently stands, read back from the document.
 *
 * Derived rather than cached, because undo, redo and load all rewrite the
 * document without asking the application first — a cache would be wrong
 * exactly when the user pressed undo.
 */
function readBoard(editor: EditorInstance): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const id of editor.getChildren(null)) {
    const shape = editor.getShape(id)
    if (shape?.type !== 'rect') continue
    const fill = shape.props.fill
    cells.set(cellKey(Math.round(shape.x / CELL), Math.round(shape.y / CELL)), {
      id,
      color: fill.type === 'solid' ? fill.color : '#000000',
    })
  }
  return cells
}

/** Cells a straight drag passed through, so a fast stroke leaves no gaps. */
function cellsBetween(
  from: { col: number; row: number },
  to: { col: number; row: number },
): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = []
  const dx = Math.abs(to.col - from.col)
  const dy = Math.abs(to.row - from.row)
  const stepX = from.col < to.col ? 1 : -1
  const stepY = from.row < to.row ? 1 : -1
  let error = dx - dy
  let { col, row } = from

  // Bresenham. Pointer events arrive far too sparsely to paint one cell each.
  for (;;) {
    out.push({ col, row })
    if (col === to.col && row === to.row) return out
    const doubled = error * 2
    if (doubled > -dy) {
      error -= dy
      col += stepX
    }
    if (doubled < dx) {
      error += dx
      row += stepY
    }
  }
}

export interface PixelSettings {
  color: string
  mode: Mode
  /** Called when the eyedropper picks something up. */
  onPick(color: string): void
}

class PixelTool implements Tool {
  readonly id = 'pixel'

  private cells = new Map<string, Cell>()
  private last: { col: number; row: number } | null = null
  private painting = false

  constructor(
    private readonly editor: EditorInstance,
    private readonly settings: PixelSettings,
  ) {}

  onExit(): void {
    this.stop()
  }

  onCancel(): void {
    this.stop()
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    const at = this.cellAt(event)
    if (!at) return

    this.cells = readBoard(this.editor)

    if (this.settings.mode === 'pick') {
      const cell = this.cells.get(cellKey(at.col, at.row))
      if (cell) this.settings.onPick(cell.color)
      return
    }

    if (this.settings.mode === 'fill') {
      this.flood(at.col, at.row)
      return
    }

    this.painting = true
    this.editor.tools.setState('dragging')
    this.last = at
    this.apply([at])
  }

  onPointerMove(event: HcPointerEvent): void {
    if (!this.painting) return
    const at = this.cellAt(event)
    if (!at || !this.last) return
    if (at.col === this.last.col && at.row === this.last.row) return
    this.apply(cellsBetween(this.last, at))
    this.last = at
  }

  onPointerUp(): void {
    this.stop()
  }

  /**
   * One drag is one undo.
   *
   * Every cell is written as it is crossed, because the user has to see it, and
   * each write shares a merge key so the history folds them into a single
   * entry. Sealing it on release is what keeps the *next* stroke separate
   * (spec §5.9.3).
   */
  private apply(run: ReadonlyArray<{ col: number; row: number }>): void {
    const erasing = this.settings.mode === 'erase'
    const color = this.settings.color

    this.editor.transact(
      () => {
        for (const { col, row } of run) {
          if (!inside(col, row)) continue
          const key = cellKey(col, row)
          const cell = this.cells.get(key)

          if (erasing) {
            if (!cell) continue
            this.editor.deleteShapes([cell.id])
            this.cells.delete(key)
            continue
          }

          if (cell?.color === color) continue
          if (cell) {
            this.editor.updateShape(cell.id, { props: this.paint(color) })
            this.cells.set(key, { id: cell.id, color })
            continue
          }
          this.cells.set(key, { id: this.create(col, row, color), color })
        }
      },
      { mergeKey: 'pixel' },
    )
  }

  /** Flood the run of same-coloured cells the pointer landed in. */
  private flood(col: number, row: number): void {
    const target = this.cells.get(cellKey(col, row))?.color ?? null
    const color = this.settings.color
    if (target === color) return

    const seen = new Set<string>([cellKey(col, row)])
    const queue = [{ col, row }]
    const run: Array<{ col: number; row: number }> = []

    while (queue.length > 0) {
      const at = queue.pop() as { col: number; row: number }
      run.push(at)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = { col: at.col + dx, row: at.row + dy }
        const key = cellKey(next.col, next.row)
        if (!inside(next.col, next.row) || seen.has(key)) continue
        if ((this.cells.get(key)?.color ?? null) !== target) continue
        seen.add(key)
        queue.push(next)
      }
    }

    // A fill is one action however many cells it reaches, so no merge key: the
    // next thing the user does starts its own entry.
    this.editor.transact(() => {
      for (const { col, row } of run) {
        const key = cellKey(col, row)
        const cell = this.cells.get(key)
        if (cell) this.editor.updateShape(cell.id, { props: this.paint(color) })
        else this.cells.set(key, { id: this.create(col, row, color), color })
      }
    })
  }

  private create(col: number, row: number, color: string): ShapeId {
    return this.editor.createShape({
      type: 'rect',
      x: col * CELL,
      y: row * CELL,
      width: CELL,
      height: CELL,
      props: this.paint(color),
    })
  }

  private paint(color: string) {
    // Square and unstroked: a pixel is a colour, not a drawing of a box.
    return {
      fill: { type: 'solid', color } as const,
      stroke: null,
      shadow: null,
      cornerRadius: 0,
    }
  }

  private cellAt(event: HcPointerEvent): { col: number; row: number } | null {
    const col = Math.floor(event.world.x / CELL)
    const row = Math.floor(event.world.y / CELL)
    return inside(col, row) ? { col, row } : null
  }

  private stop(): void {
    if (this.painting) this.editor.history.mark()
    this.painting = false
    this.last = null
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
  }
}

/** A sprite to open with, so the board is not a blank square. */
const SEED = [
  '..#.....#..',
  '...#...#...',
  '..#######..',
  '.##.###.##.',
  '###########',
  '#.#######.#',
  '#.#.....#.#',
  '...##.##...',
]

export const pixelArt: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint, say } = appScaffold(root, { plain: true })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  let swatchButtons: HTMLButtonElement[] = []
  let colorInput: HTMLInputElement | null = null

  const settings: PixelSettings = {
    color: PALETTE[6] as string,
    mode: 'paint',
    onPick(color) {
      setColor(color)
      setMode('paint')
      settings.mode = 'paint'
    },
  }

  editor.tools.register('pixel', (e) => new PixelTool(e, settings))
  editor.tools.setCurrent('pixel')

  const setMode = radio<Mode>(
    bar,
    _(['Tool', 'ツール']),
    [
      { value: 'paint', label: _(['Pen', 'ペン']) },
      { value: 'fill', label: _(['Fill', '塗りつぶし']) },
      { value: 'pick', label: _(['Pick', 'スポイト']) },
      { value: 'erase', label: _(['Erase', '消しゴム']) },
    ],
    'paint',
    (mode) => {
      settings.mode = mode
    },
  )

  function setColor(color: string): void {
    settings.color = color
    if (colorInput) colorInput.value = color
    for (const swatch of swatchButtons) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === color))
    }
  }

  const swatches = document.createElement('div')
  swatches.className = 'hc-app-group hc-app-palette'
  swatches.setAttribute('role', 'group')
  swatches.setAttribute('aria-label', _(['Palette', 'パレット']))
  swatchButtons = PALETTE.map((colour) => {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'hc-app-swatch'
    swatch.style.background = colour
    swatch.dataset.color = colour
    swatch.setAttribute('aria-label', colour)
    swatch.addEventListener('click', () => setColor(colour))
    swatches.append(swatch)
    return swatch
  })
  bar.append(swatches)

  colorInput = colorPicker(bar, _(['Colour', '色']), settings.color, setColor)

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  let transparent = false
  const background = () => (transparent ? null : '#ffffff')

  const exportPng = (scale: number) => {
    if (editor.getChildren(null).length === 0) return
    editor
      .export({
        format: 'png',
        scale,
        background: background(),
        // The whole board, not the bounding box of what happens to be painted,
        // so the image is always 32×32 and a sprite keeps its offsets.
        bounds: { x: 0, y: 0, width: SIZE, height: SIZE },
      })
      .then((blob) => download(`pixel-${GRID * scale}.png`, blob))
      .catch(() => undefined)
  }

  // CELL world units per pixel, so scale 1/CELL is one image pixel per cell.
  button(bar, _(['Save 32px', '32px で保存']), () => exportPng(1 / CELL))
  button(bar, _(['Save 512px', '512px で保存']), () => exportPng(16 / CELL))

  /**
   * Shared at 512px and always on white, whatever the checkbox says.
   *
   * A 32-pixel image is a speck in a timeline, and a transparent one is at the
   * mercy of whatever the viewer's app puts behind it — on a dark theme, dark
   * pixels simply vanish. Transparency is for saving a sprite, not for posting.
   */
  button(bar, _(['Share on social', 'SNSなどで共有']), () => {
    if (editor.getChildren(null).length === 0) {
      say(_(['Paint something first.', 'まず何か描いてください。']))
      return
    }
    editor
      .export({
        format: 'png',
        scale: 16 / CELL,
        background: '#ffffff',
        bounds: { x: 0, y: 0, width: SIZE, height: SIZE },
      })
      .then((blob) =>
        shareImage(blob, 'pixel-art.png', 'Made with HeadlessCanvas — https://headlesscanvas.com/'),
      )
      .then((outcome) => say(shareOutcomeText(_, outcome)))
      .catch((error: unknown) => say(String(error)))
  })

  const transparency = document.createElement('label')
  transparency.className = 'hc-demo-field'
  const transparencyBox = document.createElement('input')
  transparencyBox.type = 'checkbox'
  transparencyBox.addEventListener('change', () => {
    transparent = transparencyBox.checked
  })
  const transparencyText = document.createElement('span')
  transparencyText.textContent = _(['Transparent', '背景を透明に'])
  transparency.append(transparencyText, transparencyBox)
  bar.append(transparency)

  hint(
    _([
      'One cell is one rectangle, so undo, erase and export were already written. Painting at 512px redraws the squares larger — it does not blow up a small image.',
      '1マスが1つの長方形です。だから元に戻すも消しゴムも書き出しも、最初から動いています。512px の書き出しは小さい画像を引き伸ばすのではなく、同じ四角を大きく描き直しています。',
    ]),
  )

  /**
   * The grid, as one element.
   *
   * It sits in the overlay, which already carries the viewport transform, so it
   * pans and zooms with the board without being touched again — this is set
   * once and never updated (invariant 3).
   */
  const grid = document.createElement('div')
  grid.className = 'hc-app-pixel-grid'
  grid.style.width = `${SIZE}px`
  grid.style.height = `${SIZE}px`
  grid.style.backgroundSize = `${CELL}px ${CELL}px`
  editor.overlayElement.append(grid)

  const stop = editor.subscribe(() => {
    const painted = editor.getChildren(null).length
    setStatus(
      _([
        `${painted} of ${GRID * GRID} cells painted · ${editor.overlayElement.querySelectorAll('*').length} overlay DOM nodes`,
        `${GRID * GRID} マス中 ${painted} マス · オーバーレイの DOM ノード ${editor.overlayElement.querySelectorAll('*').length} 個`,
      ]),
    )
  })

  editor.transact(() => {
    const offsetCol = Math.floor((GRID - (SEED[0]?.length ?? 0)) / 2)
    const offsetRow = Math.floor((GRID - SEED.length) / 2)
    SEED.forEach((line, row) => {
      ;[...line].forEach((mark, col) => {
        if (mark !== '#') return
        editor.createShape({
          type: 'rect',
          x: (offsetCol + col) * CELL,
          y: (offsetRow + row) * CELL,
          width: CELL,
          height: CELL,
          props: {
            fill: { type: 'solid', color: PALETTE[6] as string },
            stroke: null,
            shadow: null,
            cornerRadius: 0,
          },
        })
      })
    })
  })

  // Fit the board rather than the artwork: an empty board still has a size, and
  // zooming to whatever is painted would lurch about as cells are added.
  const width = editor.container.clientWidth || SIZE
  const height = editor.container.clientHeight || SIZE
  const zoom = Math.max(Math.min((width - 32) / SIZE, (height - 32) / SIZE), 0.1)
  editor.viewport.setCamera({
    z: zoom,
    x: SIZE / 2 - width / 2 / zoom,
    y: SIZE / 2 - height / 2 / zoom,
  })

  setColor(settings.color)

  return {
    dispose() {
      stop()
      grid.remove()
      controls.dispose()
      editor.dispose()
    },
  }
}
