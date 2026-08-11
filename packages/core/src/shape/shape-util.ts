import type { Bounds, Vec } from '../math'
import type { SvgNode, SvgRenderInfo } from '../render/svg'
import type { AnyShape, ShapeBase } from './types'

export interface RenderInfo {
  /** Current zoom. Useful for keeping hairlines visible when zoomed out. */
  zoom: number
  /** True while rendering for export, so animated shapes can hold still. */
  isExporting: boolean
  /**
   * A decoded image, or null while it loads. Requesting rather than awaiting
   * keeps rendering synchronous: a missing image is skipped this frame and
   * appears on the repaint that follows the load (spec §5.6).
   */
  getImage?(src: string): CanvasImageSource | null
}

export interface ResourceRequest {
  kind: 'image' | 'font'
  src: string
  crossOrigin?: 'anonymous' | 'use-credentials' | null
}

/**
 * The implementation of one shape type.
 *
 * Every shape — including the built-ins — goes through this interface, which is
 * what keeps type-specific `switch` statements out of the renderer, the hit
 * tester and the serialiser. It is a cross-cutting concern and cannot be
 * introduced later, so it is part of the core from the start (spec §5.4).
 */
export interface ShapeUtil<S extends ShapeBase = AnyShape> {
  readonly type: S['type']

  /**
   * Schema version of `props`. Custom shapes start evolving as soon as they
   * ship, so the migration hook is standardised up front rather than left for
   * each plugin author to invent (spec §11.2).
   */
  readonly propsVersion?: number
  migrateProps?(props: unknown, fromVersion: number): S['props']

  getDefaultProps(): S['props']

  /** Draw the shape. `ctx` is already transformed into the shape's local space. */
  render(shape: S, ctx: CanvasRenderingContext2D, info: RenderInfo): void

  /**
   * The shape's outline as SVG path data, in its local space.
   *
   * This is all most shapes need to be exportable as vectors: the exporter
   * combines the outline with the shape's fill, stroke and shadow using the same
   * semantics `paintPath` applies on the canvas. Implementing it is optional —
   * a shape that implements neither this nor `toSvg` is reported on the
   * notification channel and left out of the SVG, rather than silently missing.
   *
   * The data may use the full path grammar, including arcs, which is wider than
   * the subset `parsePath` reads back.
   */
  getPath?(shape: S): string | null

  /**
   * Full control over the shape's SVG, for shapes that are not a painted
   * outline — text, images, anything with structure. Takes precedence over
   * `getPath`.
   *
   * Return an empty array for a shape that deliberately draws nothing, so it is
   * not mistaken for one that cannot be represented.
   */
  toSvg?(shape: S, info: SvgRenderInfo): SvgNode | SvgNode[] | null

  /**
   * Precise hit test, called after the broad-phase has narrowed the candidates.
   * `point` is in the shape's local space and `tolerance` is already converted
   * from screen pixels to that space (spec §5.8.4).
   */
  hitTest(shape: S, point: Vec, tolerance: number): boolean

  /** Exact local-space bounds. Defaults to (0, 0, width, height). */
  getLocalBounds?(shape: S): Bounds

  /**
   * Adjust `props` to follow a resize. The core rewrites width/height itself;
   * this only returns dependent adjustments, such as clamping a corner radius.
   */
  onResize?(shape: S, next: { width: number; height: number }): Partial<S['props']>

  /** External resources this shape needs loaded (spec §5.6). */
  getResources?(shape: S): ResourceRequest[]

  /** Description read out by assistive technology (spec §10.1). */
  getAccessibleLabel?(shape: S): string

  /**
   * The shape's editable text, or null when it has none.
   *
   * Implementing this pair is what makes a shape editable: the editor offers
   * no per-type knowledge of its own, so a custom shape becomes editable on
   * exactly the same terms as the built-in text block.
   */
  getText?(shape: S): string | null
  /**
   * Props to apply for replacement text. Only meaningful alongside `getText`.
   *
   * Returns a partial rather than writing, so the caller keeps control of the
   * transaction the change lands in.
   */
  setText?(shape: S, text: string): Partial<S['props']>

  readonly preserveAspectRatio?: boolean
  /** Defaults to true. */
  readonly canRotate?: boolean
}

/** Registry of shape implementations, keyed by type. */
export class ShapeUtilRegistry {
  private readonly utils = new Map<string, ShapeUtil<any>>()

  constructor(utils: readonly ShapeUtil<any>[] = []) {
    for (const util of utils) this.register(util)
  }

  register(util: ShapeUtil<any>): void {
    this.utils.set(util.type, util)
  }

  /** Undefined for unregistered types, which are preserved but not drawn. */
  get(type: string): ShapeUtil<any> | undefined {
    return this.utils.get(type)
  }

  has(type: string): boolean {
    return this.utils.has(type)
  }

  types(): string[] {
    return [...this.utils.keys()]
  }
}
