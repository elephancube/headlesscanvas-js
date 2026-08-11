import type { Vec } from '../../math'
import { pathData, polylineToPath, simplifyPolyline } from '../../shape/geometry'
import type { PathProps, ShapeId } from '../../shape/types'
import type { Editor } from '../editor'
import type { HcPointerEvent, Tool } from './types'

export interface DrawToolOptions {
  color: string
  /** In world units, like every other stroke width. */
  width: number
  /**
   * Simplification tolerance in **screen** pixels, converted to world units at
   * the zoom the stroke was drawn at. Zero keeps every sample.
   */
  tolerance: number
  /** Tangent scale for the smoothing. 0 leaves the polyline unsmoothed. */
  smoothing: number
  /** Samples closer together than this (screen px) are dropped as they arrive. */
  minDistance: number
}

export const defaultDrawOptions: DrawToolOptions = {
  color: '#111827',
  width: 4,
  tolerance: 1,
  smoothing: 1,
  minDistance: 2,
}

/** A stroke as a shape box plus path data in that box's local space. */
export interface StrokeGeometry {
  x: number
  y: number
  width: number
  height: number
  props: PathProps
}

/**
 * Fit a run of points into a `path` shape.
 *
 * Exported because the tool is not the only way strokes arrive: a signature
 * pad, a pen device polled directly, or a replay of recorded input all end up
 * with the same list of coordinates and want the same shape out of it.
 *
 * `tolerance` here is in the same units as the points — the tool divides its
 * screen-pixel setting by the zoom before calling.
 */
export function strokeFromPoints(
  points: readonly Vec[],
  options: Partial<DrawToolOptions> = {},
): StrokeGeometry {
  const { color, width, tolerance, smoothing } = { ...defaultDrawOptions, ...options }
  const fitted = tolerance > 0 ? simplifyPolyline(points, tolerance) : points

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of fitted) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }

  // Padded by half the stroke width, because that is how far the paint reaches
  // beyond the geometry. Without it a horizontal line would be a shape of zero
  // height: unselectable, and impossible to resize.
  const pad = width / 2
  const x = minX - pad
  const y = minY - pad
  const boxWidth = maxX - minX + width
  const boxHeight = maxY - minY + width

  const local = fitted.map((point) => ({ x: point.x - x, y: point.y - y }))

  return {
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    props: {
      d: pathData(polylineToPath(local, smoothing)),
      // Equal to the box, so a resize scales the stroke rather than re-fitting
      // it to a coordinate system it was never drawn in.
      viewBox: { width: boxWidth, height: boxHeight },
      fill: { type: 'none' },
      stroke: { color, width, cap: 'round', join: 'round' },
      shadow: null,
      fillRule: 'nonzero',
    },
  }
}

/**
 * Freehand drawing.
 *
 * The stroke is a `path` shape, so it needs no new shape type and inherits hit
 * testing, resizing, serialisation and SVG export from one that already works.
 * Two consequences follow, and both are deliberate for v1.0:
 *
 * - The line has a **single width**. Pressure-varying strokes are not a stroked
 *   line at all but a filled outline, which is a different shape type.
 * - The points are simplified and smoothed **once, on release**. Re-fitting the
 *   whole run every frame would make a long stroke quadratic.
 *
 * While the pointer is down the stroke lives in the ephemeral layer, so a
 * hundred samples cost neither a hundred history entries nor a hundred
 * rebuilds of the document (spec §5.2.4).
 */
export class DrawTool implements Tool {
  readonly id = 'draw'

  private points: Vec[] = []
  private draft: ShapeId | null = null
  /** The zoom the stroke began at, so tolerances stay in screen terms. */
  private zoom = 1

  /**
   * `options` is held by reference: an application that wants a colour picker
   * can keep the object and mutate it, and the next stroke picks the change up.
   */
  constructor(
    private readonly editor: Editor,
    private readonly options: DrawToolOptions = defaultDrawOptions,
  ) {}

  onExit(): void {
    this.discard()
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    this.zoom = this.editor.viewport.camera.z
    this.points = [event.world]
    this.editor.tools.setState('dragging')

    // The draft is not a user action: it exists to be looked at while the
    // pointer is down, and is replaced on release by the shape that is.
    this.draft = this.editor.transact(
      () => this.editor.createShape({ type: 'path', ...this.geometry() }),
      { addToHistory: false },
    )
  }

  onPointerMove(event: HcPointerEvent): void {
    if (this.draft === null) return

    const last = this.points[this.points.length - 1] as Vec
    const minimum = this.options.minDistance / this.zoom
    if (Math.hypot(event.world.x - last.x, event.world.y - last.y) < minimum) return
    this.points.push(event.world)

    // Raw points while in flight; the fitting happens once, on release.
    this.editor.setEphemeral(new Map([[this.draft, this.geometry(false)]]))
  }

  onPointerUp(): void {
    const draft = this.draft
    if (draft === null) return
    const geometry = this.geometry()

    this.discard()
    // One history entry for one stroke: the draft leaves without being
    // recorded, and the shape that lands is a plain creation.
    this.editor.createShape({ type: 'path', ...geometry })
  }

  onCancel(): void {
    this.discard()
  }

  private discard(): void {
    const draft = this.draft
    this.draft = null
    this.points = []
    this.editor.clearEphemeral()
    if (draft !== null) {
      this.editor.transact(() => this.editor.deleteShapes([draft]), { addToHistory: false })
    }
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
  }

  /**
   * `fit` is false while the pointer is down: the raw polyline is what gets
   * shown, and the simplifying and smoothing happen once, on release.
   */
  private geometry(fit = true): StrokeGeometry {
    return strokeFromPoints(this.points, {
      ...this.options,
      // The setting is in screen pixels, so it has to reach world units at the
      // zoom the stroke was actually drawn at.
      tolerance: fit ? this.options.tolerance / this.zoom : 0,
      smoothing: fit ? this.options.smoothing : 0,
    })
  }
}
