import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Bounds } from '../src/math/bounds'
import { RTree } from '../src/util/rtree'

/**
 * The index is only ever an optimisation: it must return exactly what a linear
 * scan would. That equivalence is checked against generated inputs, because a
 * spatial index that silently drops a candidate produces shapes that cannot be
 * clicked — a bug that is miserable to track down from a bug report.
 */

const arbBounds = fc.record({
  x: fc.integer({ min: -2000, max: 2000 }),
  y: fc.integer({ min: -2000, max: 2000 }),
  width: fc.integer({ min: 0, max: 400 }),
  height: fc.integer({ min: 0, max: 400 }),
})

const intersects = (a: Bounds, b: Bounds): boolean =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height

const contains = (b: Bounds, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height

describe('RTree', () => {
  it('matches a linear scan for area queries', () => {
    fc.assert(
      fc.property(
        fc.array(arbBounds, { minLength: 0, maxLength: 300 }),
        arbBounds,
        (boxes, query) => {
          const tree = new RTree<number>()
          tree.load(boxes.map((bounds, item) => ({ item, bounds })))

          const expected = boxes
            .map((bounds, index) => ({ bounds, index }))
            .filter(({ bounds }) => intersects(bounds, query))
            .map(({ index }) => index)

          expect([...tree.search(query)].sort((a, b) => a - b)).toEqual(expected)
        },
      ),
    )
  })

  it('matches a linear scan for point queries', () => {
    fc.assert(
      fc.property(
        fc.array(arbBounds, { minLength: 0, maxLength: 300 }),
        fc.integer({ min: -2000, max: 2000 }),
        fc.integer({ min: -2000, max: 2000 }),
        (boxes, x, y) => {
          const tree = new RTree<number>()
          tree.load(boxes.map((bounds, item) => ({ item, bounds })))

          const expected = boxes
            .map((bounds, index) => ({ bounds, index }))
            .filter(({ bounds }) => contains(bounds, x, y))
            .map(({ index }) => index)

          expect([...tree.searchPoint(x, y)].sort((a, b) => a - b)).toEqual(expected)
        },
      ),
    )
  })

  it('handles an empty index', () => {
    const tree = new RTree<number>()
    expect(tree.size).toBe(0)
    expect(tree.search({ x: 0, y: 0, width: 10, height: 10 })).toEqual([])
    expect(tree.searchPoint(0, 0)).toEqual([])
  })

  it('handles zero-area boxes, which lines and points produce', () => {
    const tree = new RTree<string>()
    tree.load([
      { item: 'point', bounds: { x: 10, y: 10, width: 0, height: 0 } },
      { item: 'hline', bounds: { x: 0, y: 50, width: 100, height: 0 } },
    ])

    expect(tree.searchPoint(10, 10)).toEqual(['point'])
    expect(tree.search({ x: 40, y: 50, width: 1, height: 1 })).toEqual(['hline'])
  })

  it('reloads cleanly', () => {
    const tree = new RTree<number>()
    tree.load(
      Array.from({ length: 500 }, (_, i) => ({
        item: i,
        bounds: { x: i * 10, y: 0, width: 5, height: 5 },
      })),
    )
    expect(tree.size).toBe(500)

    tree.load([{ item: 1, bounds: { x: 0, y: 0, width: 1, height: 1 } }])
    expect(tree.size).toBe(1)
    expect(tree.searchPoint(4000, 0)).toEqual([])
  })

  it('finds every item when the query covers everything', () => {
    const tree = new RTree<number>()
    const count = 2000
    tree.load(
      Array.from({ length: count }, (_, i) => ({
        item: i,
        bounds: { x: (i % 50) * 30, y: Math.floor(i / 50) * 30, width: 20, height: 20 },
      })),
    )
    expect(tree.search({ x: -1e6, y: -1e6, width: 2e6, height: 2e6 })).toHaveLength(count)
  })
})
