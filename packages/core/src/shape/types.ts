import type { Vec } from '../math/vec'

/**
 * Opaque shape identifier. Values come from `Editor.createShape`; the brand
 * exists so a raw string cannot be passed by accident.
 */
export type ShapeId = string & { readonly __brand: 'ShapeId' }

/** Opaque z-order key (see `util/fractional-index`). */
export type ZIndex = string & { readonly __brand: 'ZIndex' }

export const asShapeId = (s: string): ShapeId => s as ShapeId
export const asZIndex = (s: string): ZIndex => s as ZIndex

/**
 * Properties every shape carries.
 *
 * `width`/`height` are always real dimensions. Fabric.js keeps `width` and
 * `scaleX` side by side, which is why stroke widths and text distort when a
 * shape is resized there; this model has no scale component at all, and a
 * resize rewrites the real size (spec §5.3.3).
 *
 * v1.0 has no skew, so the transform is stored decomposed as x/y/rotation and
 * the matrix is derived when needed — which keeps serialised documents readable
 * and avoids the ambiguity of decomposing a matrix back into components.
 */
export interface ShapeBase<Type extends string = string, Props = unknown> {
  readonly id: ShapeId
  readonly type: Type

  /** Owning group, or null at the root. */
  parentId: ShapeId | null
  /** Paint order within the parent. */
  index: ZIndex

  /** Position in parent space (top-left, before rotation). */
  x: number
  y: number
  /** Real dimensions. Always positive. */
  width: number
  height: number
  /** Radians, clockwise, around the shape's centre. */
  rotation: number

  opacity: number
  locked: boolean
  visible: boolean

  /** Free-form data for the host application. Never interpreted by the library. */
  meta: Record<string, unknown>

  props: Props
}

/**
 * The set of known shape types.
 *
 * Applications add their own through declaration merging, which is what keeps
 * `props` strongly typed instead of collapsing to `any`:
 *
 * ```ts
 * declare module '@headless-canvas/core' {
 *   interface ShapeRegistry { wall: WallShape }
 * }
 * ```
 */
export interface ShapeRegistry {
  rect: RectShape
  ellipse: EllipseShape
  line: LineShape
  path: PathShape
  text: TextShape
  image: ImageShape
  group: GroupShape
}

export type ShapeType = keyof ShapeRegistry & string
export type AnyShape = ShapeRegistry[ShapeType]

// --- Styling ---------------------------------------------------------------

export interface GradientStop {
  /** 0..1 along the gradient. */
  offset: number
  color: string
}

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  /** `angle` is in radians, clockwise from the +X axis. */
  | { type: 'linear'; stops: GradientStop[]; angle: number }
  | { type: 'radial'; stops: GradientStop[] }
  | {
      type: 'pattern'
      src: string
      repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'
    }

export interface Stroke {
  color: string
  width: number
  /** Dash pattern in world units, or null for a solid line. */
  dash?: number[] | null
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
  /** Where the stroke sits relative to the outline. */
  align?: 'center' | 'inside' | 'outside'
}

export interface Shadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

/** Shared by every filled shape, so the renderer can apply them uniformly. */
export interface PaintProps {
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
  blendMode?: GlobalCompositeOperation
}

// --- Built-in shapes -------------------------------------------------------
// All of these are registered through the same ShapeUtil mechanism available to
// applications; nothing about them is privileged.

export interface RectProps extends PaintProps {
  cornerRadius: number
}
export interface RectShape extends ShapeBase<'rect', RectProps> {}

export interface EllipseProps extends PaintProps {}
export interface EllipseShape extends ShapeBase<'ellipse', EllipseProps> {}

export interface LineProps {
  /** Endpoints as ratios of the shape box, so a resize moves them with it. */
  start: Vec
  end: Vec
  stroke: Stroke
  shadow?: Shadow | null
}
export interface LineShape extends ShapeBase<'line', LineProps> {}

export interface PathProps extends PaintProps {
  /** SVG path syntax: M, L, H, V, C, Q, Z (absolute and relative). */
  d: string
  fillRule?: 'nonzero' | 'evenodd'
  /** Coordinate box the path data was authored in; scaled to the shape box. */
  viewBox?: { width: number; height: number }
}
export interface PathShape extends ShapeBase<'path', PathProps> {}

export interface TextProps {
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  /** Multiple of `fontSize`. */
  lineHeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  /** Wrap at the shape width. When false the text stays on one line. */
  wrap: boolean
  fill: Fill
  stroke?: Stroke | null
}
/**
 * A single-style text block.
 *
 * Mixed styles within one block and vertical writing are out of scope for v1.0,
 * and the type says so rather than leaving it to the documentation
 * (spec §8.5).
 */
export interface TextShape extends ShapeBase<'text', TextProps> {}

export interface ImageProps {
  src: string
  /**
   * Defaults to 'anonymous'. Loading a cross-origin image without CORS headers
   * taints the canvas and makes export fail — see `Editor.export`
   * (spec §12.1).
   */
  crossOrigin?: 'anonymous' | 'use-credentials' | null
  /** Populated once the image loads; recorded without touching the history. */
  naturalSize?: { width: number; height: number } | null
  /** Source rectangle as ratios of the natural size. */
  crop?: { x: number; y: number; width: number; height: number } | null
}
export interface ImageShape extends ShapeBase<'image', ImageProps> {}

export type GroupProps = {}
export interface GroupShape extends ShapeBase<'group', GroupProps> {}
