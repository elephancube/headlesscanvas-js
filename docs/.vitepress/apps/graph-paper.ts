import type {
  AnyShape,
  Editor as EditorInstance,
  HcPointerEvent,
  LineShape,
  ShapeId,
  Tool,
  Vec,
} from '@headless-canvas/core'
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button, colorPicker, slider } from '../demos/ui'
import { appScaffold, download, EraseTool, radio } from './chrome'

/**
 * Drafting on squared paper: draw a segment from lattice point to lattice
 * point, erase one, or grab a vertex and drag it — everything meeting there
 * follows, and one undo puts it all back.
 *
 * That last sentence is the whole reason this application is here. Moving a
 * vertex rewrites every segment touching it, which is many writes for one
 * gesture, and getting it to behave as one gesture is what the ephemeral layer
 * and `commitEphemeral` are for (spec §5.2.4).
 */

/** How close, in screen pixels, counts as grabbing an existing vertex. */
const GRAB_PX = 10

/** Vertex markers are pooled and capped; the viewport is the real bound. */
const MAX_MARKERS = 240

/** Below this the lattice is denser than it is legible, so it is not drawn. */
const MIN_GRID_PX = 5

interface WireSettings {
  pitch: number
  color: string
  width: number
}

/** A lattice point, as a string, so vertices can be compared and deduplicated. */
const key = (point: Vec): string => `${Math.round(point.x)},${Math.round(point.y)}`

/** The two endpoints of a segment, in world coordinates. */
function endpoints(shape: LineShape): [Vec, Vec] {
  const { start, end } = shape.props
  return [
    { x: shape.x + start.x * shape.width, y: shape.y + start.y * shape.height },
    { x: shape.x + end.x * shape.width, y: shape.y + end.y * shape.height },
  ]
}

interface SegmentBox {
  x: number
  y: number
  width: number
  height: number
  start: Vec
  end: Vec
}

/**
 * A segment as a shape box plus endpoint ratios.
 *
 * `line` stores its endpoints as fractions of its own box rather than as
 * coordinates, which is what lets the ordinary resize machinery move them with
 * no special case. Placing one is therefore a matter of finding the box and
 * working out where in it the two ends fall.
 */
function segmentBox(from: Vec, to: Vec): SegmentBox {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  // A perfectly horizontal or vertical segment would otherwise get a
  // zero-sized box: impossible to select and impossible to resize.
  const width = Math.max(Math.abs(to.x - from.x), 1)
  const height = Math.max(Math.abs(to.y - from.y), 1)
  return {
    x,
    y,
    width,
    height,
    start: { x: (from.x - x) / width, y: (from.y - y) / height },
    end: { x: (to.x - x) / width, y: (to.y - y) / height },
  }
}

/** Every segment on the page. Small enough that a scan beats an index. */
function segmentsOf(editor: EditorInstance): LineShape[] {
  const out: LineShape[] = []
  for (const id of editor.getChildren(null)) {
    const shape = editor.getShape(id)
    if (shape?.type === 'line') out.push(shape)
  }
  return out
}

/** One end of one segment that meets the vertex being dragged. */
interface Incident {
  id: ShapeId
  props: LineShape['props']
  /** The end that stays put. */
  anchor: Vec
  /** Which end of this segment is the one being moved. */
  moving: 'start' | 'end'
}

type Pending =
  | { kind: 'draw'; from: Vec; draft: ShapeId }
  | { kind: 'vertex'; incident: readonly Incident[]; moved: boolean }

/**
 * Drawing a segment and moving a vertex are separate tools rather than one
 * tool deciding by proximity.
 *
 * Deciding on the fly reads well in a description and is unusable in practice:
 * every press near an existing vertex — which is most presses, since that is
 * where segments start — has to guess which of two things was meant, and the
 * guess is wrong often enough to be maddening. Two tools cannot guess wrong.
 * That is what the tool abstraction is for (spec §5.8.2).
 */
type SegmentMode = 'draw' | 'vertex'

const TOOL_DRAW = 'draw-segment'
const TOOL_VERTEX = 'move-vertex'

class SegmentTool implements Tool {
  readonly id: string

  private pending: Pending | null = null

  constructor(
    private readonly editor: EditorInstance,
    private readonly settings: WireSettings,
    private readonly mode: SegmentMode,
  ) {
    this.id = mode === 'draw' ? TOOL_DRAW : TOOL_VERTEX
  }

  onExit(): void {
    this.abandon()
  }

  onCancel(): void {
    this.abandon()
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return

    if (this.mode === 'vertex') {
      const incident = this.grabVertex(event)
      // Nothing to grab: the press does nothing rather than quietly drawing.
      if (!incident) return
      this.editor.tools.setState('dragging')
      this.pending = { kind: 'vertex', incident, moved: false }
      return
    }

    this.editor.tools.setState('dragging')
    const from = this.snap(event.world)
    // Not a user action yet. The draft is there to be looked at while the
    // pointer is down, and is replaced on release by the segment that is —
    // so it is created outside the history entirely.
    const draft = this.editor.transact(
      () => this.editor.createShape({ type: 'line', ...this.geometry(from, from) }),
      { addToHistory: false },
    )
    this.pending = { kind: 'draw', from, draft }
  }

  onPointerMove(event: HcPointerEvent): void {
    const pending = this.pending
    if (!pending) return
    const to = this.snap(event.world)

    if (pending.kind === 'draw') {
      this.editor.setEphemeral(new Map([[pending.draft, this.geometry(pending.from, to)]]))
      return
    }

    pending.moved = true
    const changes = new Map<ShapeId, Partial<AnyShape>>()
    for (const segment of pending.incident) {
      const box = segmentBox(to, segment.anchor)
      changes.set(segment.id, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        // The ephemeral overlay is merged one level deep, so props go in whole
        // rather than as a patch.
        props: {
          ...segment.props,
          start: segment.moving === 'start' ? box.start : box.end,
          end: segment.moving === 'start' ? box.end : box.start,
        },
      })
    }
    this.editor.setEphemeral(changes)
  }

  onPointerUp(event: HcPointerEvent): void {
    const pending = this.pending
    this.pending = null
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
    if (!pending) return

    if (pending.kind === 'vertex') {
      // However many segments met at that vertex, the drag was one gesture and
      // becomes one entry in the history.
      if (pending.moved) this.editor.commitEphemeral()
      else this.editor.clearEphemeral()
      return
    }

    const to = this.snap(event.world)
    this.editor.clearEphemeral()
    this.editor.transact(() => this.editor.deleteShapes([pending.draft]), { addToHistory: false })

    if (key(to) === key(pending.from)) return
    if (this.alreadyDrawn(pending.from, to)) return
    this.editor.createShape({ type: 'line', ...this.geometry(pending.from, to) })
  }

  /**
   * The segments meeting the vertex under the pointer, or null when there is
   * no vertex there.
   */
  private grabVertex(event: HcPointerEvent): Incident[] | null {
    const threshold = GRAB_PX / this.editor.viewport.camera.z
    const segments = segmentsOf(this.editor)

    let vertex: string | null = null
    for (const shape of segments) {
      for (const point of endpoints(shape)) {
        if (Math.hypot(point.x - event.world.x, point.y - event.world.y) <= threshold) {
          vertex = key(point)
          break
        }
      }
      if (vertex) break
    }
    if (!vertex) return null

    const incident: Incident[] = []
    for (const shape of segments) {
      const [a, b] = endpoints(shape)
      if (key(a) === vertex) {
        incident.push({ id: shape.id, props: shape.props, anchor: b, moving: 'start' })
      } else if (key(b) === vertex) {
        incident.push({ id: shape.id, props: shape.props, anchor: a, moving: 'end' })
      }
    }
    return incident.length > 0 ? incident : null
  }

  private alreadyDrawn(from: Vec, to: Vec): boolean {
    const wanted = [key(from), key(to)].sort().join('|')
    return segmentsOf(this.editor).some((shape) => {
      const [a, b] = endpoints(shape)
      return [key(a), key(b)].sort().join('|') === wanted
    })
  }

  private geometry(from: Vec, to: Vec) {
    const box = segmentBox(from, to)
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      props: {
        start: box.start,
        end: box.end,
        stroke: { color: this.settings.color, width: this.settings.width, cap: 'round' as const },
        shadow: null,
      },
    }
  }

  private snap(world: Vec): Vec {
    const { pitch } = this.settings
    return { x: Math.round(world.x / pitch) * pitch, y: Math.round(world.y / pitch) * pitch }
  }

  private abandon(): void {
    const pending = this.pending
    this.pending = null
    this.editor.clearEphemeral()
    if (pending?.kind === 'draw') {
      this.editor.transact(() => this.editor.deleteShapes([pending.draft]), { addToHistory: false })
    }
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
  }
}

/** A small plan to start from, in lattice units. */
const SEED: ReadonlyArray<readonly [number, number, number, number]> = [
  [2, 8, 10, 8],
  [10, 8, 10, 14],
  [10, 14, 2, 14],
  [2, 14, 2, 8],
  [2, 8, 6, 4],
  [6, 4, 10, 8],
  [5, 14, 5, 11],
  [5, 11, 7, 11],
  [7, 11, 7, 14],
  [3, 9, 4, 9],
  [4, 9, 4, 10],
  [4, 10, 3, 10],
  [3, 10, 3, 9],
]

export const graphPaper: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint } = appScaffold(root, { plain: true })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  // Held by reference, so the sliders below reconfigure the live tool without
  // re-registering it.
  const settings: WireSettings = { pitch: 24, color: '#1d4ed8', width: 2 }

  editor.tools.register(TOOL_DRAW, (e) => new SegmentTool(e, settings, 'draw'))
  editor.tools.register(TOOL_VERTEX, (e) => new SegmentTool(e, settings, 'vertex'))
  editor.tools.register('erase', (e) => new EraseTool(e))
  editor.tools.setCurrent(TOOL_DRAW)

  /**
   * The lattice, as a single element.
   *
   * It lives inside the overlay, which already carries the viewport transform,
   * so it pans and zooms with the drawing for free — one node, one background,
   * no per-frame cost that grows with the page (invariant 3).
   */
  const grid = document.createElement('div')
  grid.className = 'hc-app-grid'
  editor.overlayElement.prepend(grid)

  const markers: HTMLElement[] = []

  radio(
    bar,
    _(['Tool', 'ツール']),
    [
      { value: TOOL_DRAW, label: _(['Draw', '線を引く']) },
      { value: TOOL_VERTEX, label: _(['Move a vertex', '頂点を動かす']) },
      { value: 'erase', label: _(['Erase', '消す']) },
    ],
    TOOL_DRAW,
    (mode) => editor.tools.setCurrent(mode),
  )

  slider(
    bar,
    _(['Pitch', '目盛り']),
    { min: 12, max: 48, step: 4, value: settings.pitch },
    (value) => {
      settings.pitch = value
    },
  )

  colorPicker(bar, _(['Ink', 'インク']), settings.color, (value) => {
    settings.color = value
  })

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())
  button(bar, _(['Zoom to fit', '全体表示']), () => editor.viewport.zoomToFit())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  button(bar, _(['Export SVG', 'SVG を書き出し']), () => {
    if (editor.getChildren(null).length === 0) return
    const svg = editor.exportSvg({ background: '#ffffff', padding: 24 })
    download('drawing.svg', new Blob([svg], { type: 'image/svg+xml' }))
  })

  hint(
    _([
      'Draw: drag between grid points. Move a vertex: drag one of the white dots — every segment meeting it follows, and one undo puts them all back.',
      '「線を引く」は格子の点から点へドラッグします。「頂点を動かす」は白い丸をドラッグします。そこに集まっている線がすべて追従し、「元に戻す」1回でまとめて戻ります。',
    ]),
  )

  const renderGrid = (): void => {
    const zoom = editor.viewport.camera.z
    const { pitch } = settings
    if (pitch * zoom < MIN_GRID_PX) {
      grid.hidden = true
      return
    }
    const view = editor.viewport.getVisibleBounds()
    // Anchored to the lattice rather than to the viewport, so the dots sit
    // exactly where a vertex will land. The extra half-pitch is because a
    // radial-gradient tile draws its circle at the tile's centre: without it
    // every dot would sit half a square away from the point it marks.
    const half = pitch / 2
    grid.hidden = false
    grid.style.transform = `translate(${Math.floor(view.x / pitch) * pitch - half}px, ${
      Math.floor(view.y / pitch) * pitch - half
    }px)`
    grid.style.width = `${view.width + pitch * 2}px`
    grid.style.height = `${view.height + pitch * 2}px`
    grid.style.backgroundSize = `${pitch}px ${pitch}px`
  }

  const renderMarkers = (): void => {
    // Only what is on screen, which is what keeps the node count bounded no
    // matter how large the drawing gets.
    const points = new Map<string, Vec>()
    for (const id of editor.getVisibleShapeIds()) {
      const shape = editor.getResolvedShape(id)
      if (shape?.type !== 'line') continue
      for (const point of endpoints(shape)) {
        if (points.size >= MAX_MARKERS) break
        points.set(key(point), point)
      }
    }

    while (markers.length < points.size) {
      const marker = document.createElement('div')
      marker.className = 'hc-app-vertex'
      editor.overlayElement.append(marker)
      markers.push(marker)
    }

    const list = [...points.values()]
    markers.forEach((marker, index) => {
      const point = list[index]
      if (!point) {
        marker.hidden = true
        return
      }
      marker.hidden = false
      marker.style.transform = `translate(${point.x}px, ${point.y}px)`
    })
  }

  const stop = editor.onFrame(() => {
    renderGrid()
    renderMarkers()

    const segments = segmentsOf(editor)
    const vertices = new Set<string>()
    for (const shape of segments) for (const point of endpoints(shape)) vertices.add(key(point))

    setStatus(
      _([
        `${segments.length} segment(s) · ${vertices.size} vertices · ` +
          `${editor.overlayElement.querySelectorAll('*').length} overlay DOM nodes`,
        `${segments.length} 本の線 · ${vertices.size} 個の頂点 · ` +
          `オーバーレイの DOM ノード ${editor.overlayElement.querySelectorAll('*').length} 個`,
      ]),
    )
  })

  editor.transact(() => {
    const { pitch } = settings
    for (const [ax, ay, bx, by] of SEED) {
      const box = segmentBox({ x: ax * pitch, y: ay * pitch }, { x: bx * pitch, y: by * pitch })
      editor.createShape({
        type: 'line',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        props: {
          start: box.start,
          end: box.end,
          stroke: { color: settings.color, width: settings.width, cap: 'round' },
          shadow: null,
        },
      })
    }
  })

  return {
    dispose() {
      stop()
      grid.remove()
      for (const marker of markers) marker.remove()
      markers.length = 0
      controls.dispose()
      editor.dispose()
    },
  }
}
