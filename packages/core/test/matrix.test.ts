import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyToPoint,
  compose,
  determinant,
  identity,
  invert,
  type Matrix,
  multiply,
  rotation,
  scaleMatrix,
  shapeTransform,
  translate,
} from '../src/math'

/**
 * Transform maths is the one part of the library where a subtle sign error is
 * both easy to make and invisible until a rotated shape resizes strangely.
 * Property-based tests are worth the setup here: they check the algebra itself
 * rather than a handful of examples.
 */

const finite = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true })

const arbMatrix = fc
  .record({
    a: finite(-10, 10),
    b: finite(-10, 10),
    c: finite(-10, 10),
    d: finite(-10, 10),
    e: finite(-1000, 1000),
    f: finite(-1000, 1000),
  })
  .filter((m) => Math.abs(determinant(m)) > 1e-3)

const arbPoint = fc.record({ x: finite(-1000, 1000), y: finite(-1000, 1000) })

const closeTo = (actual: number, expected: number, epsilon = 1e-6) =>
  Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected))

const matricesClose = (a: Matrix, b: Matrix, epsilon = 1e-6) =>
  (['a', 'b', 'c', 'd', 'e', 'f'] as const).every((k) => closeTo(a[k], b[k], epsilon))

describe('matrix', () => {
  it('composing with the inverse yields the identity', () => {
    fc.assert(
      fc.property(arbMatrix, (m) => {
        const inverse = invert(m)
        expect(inverse).not.toBeNull()
        expect(matricesClose(multiply(m, inverse!), identity(), 1e-4)).toBe(true)
        expect(matricesClose(multiply(inverse!, m), identity(), 1e-4)).toBe(true)
      }),
    )
  })

  it('is associative', () => {
    fc.assert(
      fc.property(arbMatrix, arbMatrix, arbMatrix, (m, n, o) => {
        expect(matricesClose(multiply(multiply(m, n), o), multiply(m, multiply(n, o)), 1e-3)).toBe(
          true,
        )
      }),
    )
  })

  it('applies as function composition: multiply(m, n) means n then m', () => {
    fc.assert(
      fc.property(arbMatrix, arbMatrix, arbPoint, (m, n, p) => {
        const direct = applyToPoint(multiply(m, n), p)
        const stepwise = applyToPoint(m, applyToPoint(n, p))
        expect(closeTo(direct.x, stepwise.x, 1e-4)).toBe(true)
        expect(closeTo(direct.y, stepwise.y, 1e-4)).toBe(true)
      }),
    )
  })

  it('round-trips a point through a transform and its inverse', () => {
    fc.assert(
      fc.property(arbMatrix, arbPoint, (m, p) => {
        const inverse = invert(m)!
        const back = applyToPoint(inverse, applyToPoint(m, p))
        expect(closeTo(back.x, p.x, 1e-3)).toBe(true)
        expect(closeTo(back.y, p.y, 1e-3)).toBe(true)
      }),
    )
  })

  it('reports no inverse for a singular matrix', () => {
    expect(invert({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toBeNull()
    expect(invert(scaleMatrix(0, 0))).toBeNull()
  })

  it('rotates by a full turn back to the identity', () => {
    expect(matricesClose(rotation(Math.PI * 2), identity(), 1e-9)).toBe(true)
  })

  it('translates then rotates in the documented order', () => {
    const m = compose(translate(10, 0), rotation(Math.PI / 2))
    const p = applyToPoint(m, { x: 1, y: 0 })
    expect(closeTo(p.x, 10, 1e-9)).toBe(true)
    expect(closeTo(p.y, 1, 1e-9)).toBe(true)
  })
})

describe('shapeTransform', () => {
  it('maps the local origin to the shape position when unrotated', () => {
    fc.assert(
      fc.property(
        finite(-500, 500),
        finite(-500, 500),
        finite(1, 500),
        finite(1, 500),
        (x, y, width, height) => {
          const m = shapeTransform({ x, y, width, height, rotation: 0 })
          const origin = applyToPoint(m, { x: 0, y: 0 })
          expect(closeTo(origin.x, x, 1e-6)).toBe(true)
          expect(closeTo(origin.y, y, 1e-6)).toBe(true)
        },
      ),
    )
  })

  it('keeps the centre fixed under rotation', () => {
    fc.assert(
      fc.property(
        finite(-500, 500),
        finite(-500, 500),
        finite(1, 500),
        finite(1, 500),
        finite(-Math.PI, Math.PI),
        (x, y, width, height, angle) => {
          const m = shapeTransform({ x, y, width, height, rotation: angle })
          const centre = applyToPoint(m, { x: width / 2, y: height / 2 })
          expect(closeTo(centre.x, x + width / 2, 1e-6)).toBe(true)
          expect(closeTo(centre.y, y + height / 2, 1e-6)).toBe(true)
        },
      ),
    )
  })

  it('preserves side lengths, since the model carries no scale component', () => {
    fc.assert(
      fc.property(finite(1, 500), finite(1, 500), finite(-Math.PI, Math.PI), (w, h, angle) => {
        const m = shapeTransform({ x: 0, y: 0, width: w, height: h, rotation: angle })
        const a = applyToPoint(m, { x: 0, y: 0 })
        const b = applyToPoint(m, { x: w, y: 0 })
        expect(closeTo(Math.hypot(b.x - a.x, b.y - a.y), w, 1e-6)).toBe(true)
      }),
    )
  })
})
