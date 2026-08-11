import { describe, expect, it } from 'vitest'
import { computeSnap, defaultSnapSettings, type SnapSettings } from '../src/editor/snapping'
import type { Bounds } from '../src/math/bounds'

const box = (x: number, y: number, width = 100, height = 60): Bounds => ({ x, y, width, height })

const settings = (overrides: Partial<SnapSettings> = {}): SnapSettings => ({
  ...defaultSnapSettings,
  ...overrides,
})

describe('object snapping', () => {
  it('aligns left edges', () => {
    const result = computeSnap(box(103, 400), [box(100, 0)], settings(), 1)
    expect(result.dx).toBe(-3)
    expect(result.dy).toBe(0)
  })

  it('aligns centres', () => {
    // Moving box centre is at 152; target centre is at 150.
    const result = computeSnap(box(102, 400), [box(100, 0)], settings(), 1)
    expect(result.dx).toBe(-2)
  })

  it('aligns a right edge to a left edge', () => {
    const result = computeSnap(box(-3, 400), [box(100, 0)], settings(), 1)
    expect(result.dx).toBe(3)
  })

  it('ignores targets beyond the threshold', () => {
    const result = computeSnap(box(140, 400), [box(100, 0)], settings({ thresholdPx: 5 }), 1)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('scales the threshold with zoom', () => {
    // 3 world units is 6 screen pixels at 2x, which is outside a 5px threshold.
    const zoomedIn = computeSnap(box(103, 400), [box(100, 0)], settings({ thresholdPx: 5 }), 2)
    expect(zoomedIn.dx).toBe(0)

    const zoomedOut = computeSnap(box(103, 400), [box(100, 0)], settings({ thresholdPx: 5 }), 0.5)
    expect(zoomedOut.dx).toBe(-3)
  })

  it('reports a guide spanning both boxes', () => {
    const result = computeSnap(box(103, 400), [box(100, 0, 100, 60)], settings(), 1)
    const guide = result.guides.find((g) => g.axis === 'x')!

    expect(guide.position).toBe(100)
    expect(guide.start).toBe(0)
    expect(guide.end).toBe(460)
  })

  it('snaps both axes independently', () => {
    const result = computeSnap(box(102, 58), [box(100, 60)], settings(), 1)
    expect(result.dx).toBe(-2)
    expect(result.dy).toBe(2)
    expect(result.guides.some((g) => g.axis === 'x')).toBe(true)
    expect(result.guides.some((g) => g.axis === 'y')).toBe(true)
  })

  it('reports every alignment that lands on the winning offset', () => {
    // Same-sized boxes: left, centre and right all line up at once, and the
    // user should see all three.
    const result = computeSnap(box(102, 400), [box(100, 0)], settings(), 1)
    const xGuides = result.guides.filter((g) => g.axis === 'x')
    expect(xGuides.map((g) => g.position).sort((a, b) => a - b)).toEqual([100, 150, 200])
  })
})

describe('grid snapping', () => {
  it('rounds to the nearest grid line', () => {
    const result = computeSnap(box(98, 202), [], settings({ grid: 20, toObjects: false }), 1)
    expect(result.dx).toBe(2)
    expect(result.dy).toBe(-2)
  })

  it('leaves a position that is already far from a line', () => {
    const result = computeSnap(box(110, 0), [], settings({ grid: 100, toObjects: false }), 1)
    expect(result.dx).toBe(0)
  })

  it('yields to an object snap on the same axis', () => {
    // The grid would pull x to 100; the neighbouring shape pulls it to 97.
    const result = computeSnap(
      box(98, 500),
      [box(97, 0)],
      settings({ grid: 100, toObjects: true }),
      1,
    )
    // Aligning by eye should not be overridden by a grid line a pixel away.
    expect(result.dx).toBe(-1)
  })

  it('still applies on an axis where no object matched', () => {
    const result = computeSnap(
      box(98, 202),
      [box(97, 900)],
      settings({ grid: 20, toObjects: true }),
      1,
    )
    expect(result.dx).toBe(-1)
    expect(result.dy).toBe(-2)
  })
})

describe('disabled snapping', () => {
  it('returns no correction at all', () => {
    const result = computeSnap(box(103, 202), [box(100, 200)], settings({ enabled: false }), 1)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('honours toObjects being off', () => {
    const result = computeSnap(box(103, 400), [box(100, 0)], settings({ toObjects: false }), 1)
    expect(result.dx).toBe(0)
  })
})
