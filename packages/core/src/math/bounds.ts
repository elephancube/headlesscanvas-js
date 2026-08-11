import type { Vec } from './vec'

/** An axis-aligned bounding box. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A bounding box that carries a rotation.
 *
 * `x`/`y`/`width`/`height` describe the box before rotation; `rotation` is applied
 * around its centre. A single-shape selection uses this so the box follows the
 * shape; a multi-shape selection reports `rotation: 0` (see spec §5.3.5).
 */
export interface OrientedBounds extends Bounds {
  /** Radians, clockwise. */
  rotation: number
}

export const boundsCenter = (b: Bounds): Vec => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
})

export function boundsContains(b: Bounds, p: Vec): boolean {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  )
}

/** Smallest box containing every input box. Returns null for an empty list. */
export function boundsUnion(list: readonly Bounds[]): Bounds | null {
  if (list.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const b of list) {
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y + b.height > maxY) maxY = b.y + b.height
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Smallest axis-aligned box containing the four (possibly rotated) corners. */
export function boundsFromPoints(points: readonly Vec[]): Bounds | null {
  if (points.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
