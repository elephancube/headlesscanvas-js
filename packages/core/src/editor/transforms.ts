import { applyToPoint, type Vec } from '../math'
import { type Matrix, multiply, shapeTransform } from '../math/matrix'
import type { AnyShape, ShapeId } from '../shape/types'

/**
 * Turn a transform back into the stored x/y/rotation triple.
 *
 * This is only well defined because the model carries no scale or skew
 * (spec §5.3.3) — with those present, a matrix has many valid decompositions
 * and reparenting would drift. Keeping the transform decomposed is what makes
 * "grouping never changes how anything looks" an exact statement rather than an
 * approximate one.
 */
export function decomposeTransform(
  m: Matrix,
  width: number,
  height: number,
): { x: number; y: number; rotation: number } {
  const rotation = Math.atan2(m.b, m.a)
  const centre = applyToPoint(m, { x: width / 2, y: height / 2 })
  return { x: centre.x - width / 2, y: centre.y - height / 2, rotation }
}

/**
 * Compose a shape's local transform with its ancestors'.
 *
 * `resolve` supplies shapes so the caller can decide whether ephemeral changes
 * are included.
 */
export function worldTransformOf(
  shape: AnyShape,
  resolve: (id: ShapeId) => AnyShape | undefined,
): Matrix {
  let transform = shapeTransform(shape)
  let parentId = shape.parentId
  const seen = new Set<ShapeId>([shape.id])

  while (parentId !== null) {
    if (seen.has(parentId)) break // defensive: a cycle would otherwise hang
    seen.add(parentId)
    const parent = resolve(parentId)
    if (!parent) break
    transform = multiply(shapeTransform(parent), transform)
    parentId = parent.parentId
  }

  return transform
}

/** The four corners of a shape in world space. */
export function worldCorners(shape: AnyShape, transform: Matrix): Vec[] {
  return [
    applyToPoint(transform, { x: 0, y: 0 }),
    applyToPoint(transform, { x: shape.width, y: 0 }),
    applyToPoint(transform, { x: shape.width, y: shape.height }),
    applyToPoint(transform, { x: 0, y: shape.height }),
  ]
}

/** Product of a shape's opacity and every ancestor's. */
export function inheritedOpacity(
  shape: AnyShape,
  resolve: (id: ShapeId) => AnyShape | undefined,
): number {
  let opacity = shape.opacity
  let parentId = shape.parentId
  const seen = new Set<ShapeId>([shape.id])
  while (parentId !== null) {
    if (seen.has(parentId)) break
    seen.add(parentId)
    const parent = resolve(parentId)
    if (!parent) break
    opacity *= parent.opacity
    parentId = parent.parentId
  }
  return opacity
}
