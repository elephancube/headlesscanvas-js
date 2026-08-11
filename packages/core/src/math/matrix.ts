import type { Vec } from './vec'

/**
 * A 2D affine transform.
 *
 * ```
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 * ```
 *
 * The component names match the CSS `matrix()` function and
 * `CanvasRenderingContext2D.setTransform`, so a matrix can be handed to either
 * without conversion.
 */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY: Readonly<Matrix> = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export const identity = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export const translate = (tx: number, ty: number): Matrix => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
})

export const scaleMatrix = (sx: number, sy: number = sx): Matrix => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
})

export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/**
 * Compose two transforms. The result applies `n` first, then `m` —
 * so `multiply(parent, child)` is the child's transform expressed in the
 * parent's parent space.
 */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}

export const compose = (...matrices: Matrix[]): Matrix =>
  matrices.reduce((acc, m) => multiply(acc, m), identity())

export function determinant(m: Matrix): number {
  return m.a * m.d - m.b * m.c
}

/** Returns null when the matrix is singular (determinant 0). */
export function invert(m: Matrix): Matrix | null {
  const det = determinant(m)
  if (det === 0 || !Number.isFinite(det)) return null
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  }
}

export function applyToPoint(m: Matrix, p: Vec): Vec {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }
}

/** Serialise for the CSS `transform` property. */
export function toCssMatrix(m: Matrix): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`
}

/**
 * Local-to-parent transform for a shape.
 *
 * The shape's local space runs from (0,0) at its top-left to (width,height) at
 * its bottom-right. Rotation is applied around the shape's centre.
 *
 * Note there is no scale component: `width`/`height` are always real dimensions
 * (see spec §5.3.3), which is what keeps stroke widths and corner radii from
 * distorting when a shape is resized.
 */
export function shapeTransform(shape: {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}): Matrix {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  return compose(
    translate(cx, cy),
    rotation(shape.rotation),
    translate(-shape.width / 2, -shape.height / 2),
  )
}
