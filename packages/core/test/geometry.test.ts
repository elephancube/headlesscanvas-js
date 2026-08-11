import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  distanceToSegment,
  flattenPath,
  parsePath,
  pathBounds,
  pointInPolygon,
} from '../src/shape/geometry'

describe('parsePath', () => {
  it('handles absolute and relative forms identically', () => {
    const absolute = parsePath('M 10 10 L 20 10 L 20 20 Z')
    const relative = parsePath('m 10 10 l 10 0 l 0 10 z')
    expect(relative).toEqual(absolute)
  })

  it('expands H and V into line segments', () => {
    expect(parsePath('M 0 0 H 50 V 30')).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 50, y: 0 },
      { type: 'L', x: 50, y: 30 },
    ])
  })

  it('treats extra coordinate pairs after M as line-tos, per the SVG spec', () => {
    expect(parsePath('M 0 0 10 10 20 20')).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 20, y: 20 },
    ])
  })

  it('reflects the previous control point for S', () => {
    const commands = parsePath('M 0 0 C 10 0 20 0 30 0 S 50 0 60 0')
    const smooth = commands[2]
    expect(smooth).toMatchObject({ type: 'C', x1: 40, y1: 0, x: 60, y: 0 })
  })

  it('skips unsupported commands instead of throwing', () => {
    // Arcs are out of scope; the rest of the path should still parse.
    const commands = parsePath('M 0 0 A 10 10 0 0 1 20 20 L 30 30')
    expect(commands.some((c) => c.type === 'L')).toBe(true)
  })

  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => parsePath(input)).not.toThrow()
      }),
    )
  })
})

describe('flattenPath', () => {
  it('produces a closed polyline for a closed triangle', () => {
    const subpaths = flattenPath(parsePath('M 0 0 L 10 0 L 10 10 Z'))
    expect(subpaths).toHaveLength(1)
    const points = subpaths[0]!
    expect(points[0]).toEqual(points[points.length - 1])
  })

  it('scales with the shape box', () => {
    const subpaths = flattenPath(parsePath('M 0 0 L 100 100'), 0.5, 2)
    expect(subpaths[0]![1]).toEqual({ x: 50, y: 200 })
  })

  it('bounds a cubic within its control hull', () => {
    const box = pathBounds(flattenPath(parsePath('M 0 0 C 0 100 100 100 100 0')))
    expect(box.x).toBeCloseTo(0)
    expect(box.width).toBeCloseTo(100)
    expect(box.height).toBeGreaterThan(0)
    expect(box.height).toBeLessThanOrEqual(100)
  })
})

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('separates inside from outside', () => {
    expect(pointInPolygon(square, { x: 5, y: 5 })).toBe(true)
    expect(pointInPolygon(square, { x: 15, y: 5 })).toBe(false)
    expect(pointInPolygon(square, { x: -1, y: -1 })).toBe(false)
  })
})

describe('distanceToSegment', () => {
  it('measures perpendicular distance within the segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3)
  })

  it('clamps to the endpoints beyond the segment', () => {
    expect(distanceToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4)
    expect(distanceToSegment({ x: 14, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4)
  })

  it('handles a degenerate segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5)
  })
})
