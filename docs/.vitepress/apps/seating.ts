import type {
  Bounds,
  Editor as EditorInstance,
  HcPointerEvent,
  ShapeId,
  Tool,
  Vec,
} from '@headless-canvas/core'
import { defaultShapeUtils, Editor, type ShapeBase, type ShapeUtil } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo, Lang, Text } from '../demos/types'
import { t } from '../demos/types'
import { button } from '../demos/ui'
import { appScaffold, download } from './chrome'

/**
 * A seating chart.
 *
 * The point of this one is the part you cannot see. Every seat contributes a
 * line to the visually hidden list the library maintains, so a screen-reader
 * user can walk the hall seat by seat and hear which are sold — and a keyboard
 * user can select one without pointing at anything.
 *
 * A library that paints its selection UI into the canvas cannot offer that at
 * any price: there is nothing in the accessibility tree to walk. This is the
 * clearest case for keeping the control layer in the DOM (spec §10.1).
 */

type SeatStatus = 'free' | 'held' | 'sold'

interface SeatShape extends ShapeBase<'seat', { label: string; status: SeatStatus }> {}

// Declaration merging is what keeps `props` typed; without it every call to
// createShape for a seat would collapse to `any` (spec §5.4.2).
declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    seat: SeatShape
  }
}

const SEAT_COLOURS: Record<SeatStatus, { fill: string; edge: string; ink: string }> = {
  free: { fill: '#dbeafe', edge: '#60a5fa', ink: '#1e3a8a' },
  held: { fill: '#fde68a', edge: '#d97706', ink: '#78350f' },
  sold: { fill: '#cbd5e1', edge: '#94a3b8', ink: '#64748b' },
}

const STATUS_TEXT: Record<SeatStatus, Text> = {
  free: ['available', '空席'],
  held: ['on hold', '確保'],
  sold: ['sold', '販売済'],
}

const STATUSES: readonly SeatStatus[] = ['free', 'held', 'sold']

const SEAT_WIDTH = 34
const SEAT_HEIGHT = 30
const SEAT_GAP = 8
const ROW_GAP = 12
const AISLE = 28
const PER_ROW = 12
const ORIGIN = { x: 40, y: 120 }

const fontSize = (shape: SeatShape) => Math.min(12, shape.height * 0.42)
const radiusOf = (shape: SeatShape) => Math.min(6, shape.width / 4, shape.height / 4)

/**
 * A seat, as a shape the library has never heard of.
 *
 * Built as a function of the page language rather than as a constant, because
 * `getAccessibleLabel` is the one place a shape produces prose. The built-in
 * shapes deliberately return English and do not consult a message table — a
 * fixed set of keys cannot describe a type nobody has written yet — so
 * translating them means substituting utils, exactly as this does.
 */
const seatShapeUtil = (lang: Lang): ShapeUtil<SeatShape> => {
  const _ = t(lang)
  return {
    type: 'seat',
    propsVersion: 1,
    canRotate: false,

    getDefaultProps: () => ({ label: '', status: 'free' }),

    render(shape, ctx) {
      const { fill, edge, ink } = SEAT_COLOURS[shape.props.status]
      ctx.beginPath()
      ctx.roundRect(0, 0, shape.width, shape.height, radiusOf(shape))
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.fillStyle = ink
      ctx.font = `600 ${fontSize(shape)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(shape.props.label, shape.width / 2, shape.height / 2)
    },

    /**
     * A seat is a box and a label, not a painted outline, so it writes its own
     * markup rather than returning a path for the exporter to fill.
     */
    toSvg(shape) {
      const { fill, edge, ink } = SEAT_COLOURS[shape.props.status]
      return {
        tag: 'g',
        children: [
          {
            tag: 'rect',
            attrs: {
              width: shape.width,
              height: shape.height,
              rx: radiusOf(shape),
              fill,
              stroke: edge,
              'stroke-width': 1,
            },
          },
          {
            tag: 'text',
            attrs: {
              x: shape.width / 2,
              y: shape.height / 2,
              fill: ink,
              'font-family': 'system-ui, sans-serif',
              'font-size': fontSize(shape),
              'font-weight': 600,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
            },
            text: shape.props.label,
          },
        ],
      }
    },

    hitTest(shape, point, tolerance) {
      return (
        point.x >= -tolerance &&
        point.y >= -tolerance &&
        point.x <= shape.width + tolerance &&
        point.y <= shape.height + tolerance
      )
    },

    getAccessibleLabel: (shape) =>
      `${_(['Seat', '座席'])} ${shape.props.label}, ${_(STATUS_TEXT[shape.props.status])}`,
  }
}

const boundsBetween = (a: Vec, b: Vec): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
})

/**
 * Selection, and nothing else.
 *
 * The seats are laid out once; from then on the only thing anybody does to
 * them is pick them. The stock select tool also moves and resizes, which here
 * would be offering the user a way to break the chart, so this application
 * registers its own `select` instead — click, shift-click, and a marquee.
 *
 * Replacing a built-in is the same call as adding one, and re-registering an
 * id swaps the live instance too (spec §5.8.2).
 */
class PickTool implements Tool {
  readonly id = 'select'

  private origin: { screen: Vec; world: Vec } | null = null
  private brush: Bounds | null = null
  /** The selection the marquee started from, for shift-dragging. */
  private base: readonly ShapeId[] = []

  constructor(private readonly editor: EditorInstance) {}

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const selection = this.editor.selection

    if (event.target !== null) {
      if (!additive) selection.set([event.target])
      else if (selection.ids.includes(event.target)) selection.remove([event.target])
      else selection.add([event.target])
      return
    }

    this.origin = { screen: event.screen, world: event.world }
    this.base = additive ? [...selection.ids] : []
    if (!additive) selection.clear()
    this.editor.tools.setState('brushing')
  }

  onPointerMove(event: HcPointerEvent): void {
    const origin = this.origin
    if (!origin) return
    // The brush is drawn in world space and hit tested in screen space, so both
    // are kept rather than converting back and forth.
    this.brush = boundsBetween(origin.world, event.world)
    const hits = this.editor.hitTestArea(boundsBetween(origin.screen, event.screen))
    this.editor.selection.set([...new Set([...this.base, ...hits])])
  }

  onPointerUp(): void {
    this.reset()
  }

  onCancel(): void {
    this.editor.selection.clear()
    this.reset()
  }

  getBrush(): Bounds | null {
    return this.brush
  }

  private reset(): void {
    this.origin = null
    this.brush = null
    this.base = []
    if (this.editor.tools.state === 'brushing') this.editor.tools.setState('idle')
  }
}

const rowLabel = (index: number): string => String.fromCharCode(65 + index)

const seatX = (column: number): number =>
  ORIGIN.x + column * (SEAT_WIDTH + SEAT_GAP) + (column >= PER_ROW / 2 ? AISLE : 0)

const rowY = (row: number): number => ORIGIN.y + row * (SEAT_HEIGHT + ROW_GAP)

const ROW_WIDTH = seatX(PER_ROW - 1) + SEAT_WIDTH - ORIGIN.x

export const seating: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, panel, setStatus, hint } = appScaffold(root, { panel: true, plain: true })

  // The handles are DOM, so an application that does not want them removes them
  // with one rule rather than forking the control UI. `display: none` also
  // takes them out of the tab order, which is the behaviour wanted here: there
  // is nothing to resize, so there should be nothing to tab to.
  stage.classList.add('hc-app-pick')

  const editor = new Editor({
    container: stage,
    shapeUtils: [...defaultShapeUtils, seatShapeUtil(lang)],
  })
  const controls = createDefaultControls(editor)

  editor.tools.register('select', (e) => new PickTool(e))

  let rows = 0

  const addRow = (): void => {
    const row = rows++
    editor.transact(() => {
      for (let column = 0; column < PER_ROW; column++) {
        editor.createShape({
          type: 'seat',
          x: seatX(column),
          y: rowY(row),
          width: SEAT_WIDTH,
          height: SEAT_HEIGHT,
          props: { label: `${rowLabel(row)}-${column + 1}`, status: 'free' },
        })
      }
    })
  }

  /** Applies to the selection, and only to seats in it. */
  const setSeatStatus = (status: SeatStatus): void => {
    editor.transact(() => {
      for (const id of editor.selection.ids) {
        const shape = editor.getShape(id)
        if (shape?.type !== 'seat') continue
        editor.updateShape(id, { props: { ...shape.props, status } })
      }
    })
  }

  for (const status of STATUSES) {
    button(bar, _(STATUS_TEXT[status]), () => setSeatStatus(status))
  }

  button(bar, _(['Add a row', '行を追加']), addRow)
  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())
  button(bar, _(['Zoom to fit', '全体表示']), () => editor.viewport.zoomToFit())

  button(bar, _(['Export SVG', 'SVG を書き出し']), () => {
    const svg = editor.exportSvg({ background: '#ffffff', padding: 24 })
    download('seating.svg', new Blob([svg], { type: 'image/svg+xml' }))
  })

  hint(
    _([
      'Drag a box around some seats, or click one — hold shift to add. Seats can be selected but not moved. Click the canvas and press Tab to reach the same seats from the keyboard.',
      'ドラッグで範囲選択するか、座席をクリックして選びます（Shift で追加選択）。座席は選べますが動かせません。キャンバスをクリックしてから Tab を押すと、同じ座席にキーボードから到達できます。',
    ]),
  )

  // --- the application's own panel ------------------------------------------

  const legend = document.createElement('ul')
  legend.className = 'hc-app-legend'

  const counters = new Map<SeatStatus, HTMLElement>()
  for (const status of STATUSES) {
    const item = document.createElement('li')
    const swatch = document.createElement('span')
    swatch.className = 'hc-app-chip'
    swatch.style.background = SEAT_COLOURS[status].fill
    swatch.style.borderColor = SEAT_COLOURS[status].edge
    const count = document.createElement('strong')
    item.append(swatch, document.createTextNode(`${_(STATUS_TEXT[status])} `), count)
    counters.set(status, count)
    legend.append(item)
  }

  const legendTitle = document.createElement('h4')
  legendTitle.textContent = _(['Inventory', '在庫'])

  const treeTitle = document.createElement('h4')
  treeTitle.textContent = _(['What a screen reader gets', 'スクリーンリーダーに渡されるもの'])

  const tree = document.createElement('ul')
  const summary = document.createElement('p')
  summary.className = 'hc-demo-summary'

  panel?.append(legendTitle, legend, treeTitle, tree, summary)

  let lastKey = ''

  const stop = editor.onFrame(() => {
    const snapshot = editor.getSnapshot()
    const tally: Record<SeatStatus, number> = { free: 0, held: 0, sold: 0 }
    for (const shape of snapshot.shapes.values()) {
      if (shape.type === 'seat') tally[shape.props.status]++
    }
    for (const status of STATUSES) {
      const element = counters.get(status)
      if (element) element.textContent = String(tally[status])
    }

    const descriptors = editor.controls.getA11yShapeDescriptors()
    const totals = editor.controls.getA11ySummary()

    // Rebuilding the mirror every frame would churn the DOM for no reason.
    const key = `${totals.total}:${descriptors.map((d) => `${d.id}${d.selected ? '*' : ''}`).join()}`
    if (key !== lastKey) {
      lastKey = key
      tree.replaceChildren()
      // The panel shows a window on the list rather than all of it: the real
      // one is walked with Tab, not read at a glance.
      for (const descriptor of descriptors.slice(0, 12)) {
        const item = document.createElement('li')
        item.textContent = descriptor.label
        if (descriptor.selected) item.dataset.selected = ''
        tree.append(item)
      }
      summary.textContent = _([
        `${totals.visible} of ${totals.total} shapes are in the list; the rest are not in the DOM at all.`,
        `${totals.total} 個中 ${totals.visible} 個がリストに載っています。残りは DOM に存在しません。`,
      ])
    }

    const sold = tally.sold
    setStatus(
      _([
        `${tally.free + tally.held + sold} seats · ${editor.selection.ids.length} selected · ` +
          `${sold} sold · ${editor.overlayElement.querySelectorAll('*').length} overlay DOM nodes`,
        `座席 ${tally.free + tally.held + sold} 席 · ${editor.selection.ids.length} 席選択中 · ` +
          `販売済 ${sold} 席 · オーバーレイの DOM ノード ${editor.overlayElement.querySelectorAll('*').length} 個`,
      ]),
    )
  })

  // --- the hall -------------------------------------------------------------

  // One transaction for the whole starting scene, nested calls included, so
  // the first undo does not take a row of seats away with it.
  editor.transact(() => {
    editor.createShape({
      type: 'rect',
      x: ORIGIN.x,
      y: 40,
      width: ROW_WIDTH,
      height: 40,
      locked: true,
      props: {
        fill: { type: 'solid', color: '#1e293b' },
        stroke: null,
        cornerRadius: 6,
      },
    })
    editor.createShape({
      type: 'text',
      x: ORIGIN.x,
      y: 50,
      width: ROW_WIDTH,
      height: 22,
      locked: true,
      props: {
        text: _(['STAGE', 'ステージ']),
        fontSize: 16,
        align: 'center',
        fill: { type: 'solid', color: '#f8fafc' },
      },
    })

    for (let row = 0; row < 6; row++) addRow()

    // Some inventory already moved, so the chart does not start uniform.
    // `getChildren` reads uncommitted state, so the seats created a moment ago
    // are already there to be read back.
    let index = 0
    for (const id of editor.getChildren(null)) {
      const shape = editor.getShape(id)
      if (shape?.type !== 'seat') continue
      index++
      const status: SeatStatus | null =
        index % 11 === 0 ? 'held' : index % 4 === 0 || index % 7 === 0 ? 'sold' : null
      if (status) editor.updateShape(id, { props: { ...shape.props, status } })
    }
  })

  editor.viewport.zoomToFit()

  return {
    dispose() {
      stop()
      controls.dispose()
      editor.dispose()
    },
  }
}
