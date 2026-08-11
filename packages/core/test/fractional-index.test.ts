import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateIndexBetween, generateNIndexesBetween } from '../src/util/fractional-index'

/**
 * The property that matters is simply "you can always insert between two keys".
 * If that ever fails, reordering silently corrupts paint order, so it is
 * checked against generated sequences rather than fixed examples.
 */
describe('fractional index', () => {
  it('produces an increasing sequence when appending', () => {
    const keys: string[] = []
    let last: string | null = null
    for (let i = 0; i < 200; i++) {
      last = generateIndexBetween(last, null)
      keys.push(last)
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true)
    }
  })

  it('produces a decreasing sequence when prepending', () => {
    const keys: string[] = []
    let first: string | null = null
    for (let i = 0; i < 200; i++) {
      first = generateIndexBetween(null, first)
      keys.unshift(first)
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true)
    }
  })

  it('always finds room between two adjacent keys', () => {
    let lower = generateIndexBetween(null, null)
    let upper = generateIndexBetween(lower, null)
    for (let i = 0; i < 200; i++) {
      const middle = generateIndexBetween(lower, upper)
      expect(lower < middle).toBe(true)
      expect(middle < upper).toBe(true)
      // Repeatedly subdividing the same gap is the worst case for key growth.
      upper = middle
    }
    lower = generateIndexBetween(null, null)
    expect(lower.length).toBeGreaterThan(0)
  })

  it('keeps ordering under arbitrary insert positions', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 50 }), { minLength: 1, maxLength: 60 }), (positions) => {
        const keys: string[] = [generateIndexBetween(null, null)]
        for (const raw of positions) {
          const at = raw % (keys.length + 1)
          const before = at === 0 ? null : keys[at - 1]!
          const after = at === keys.length ? null : keys[at]!
          const key = generateIndexBetween(before, after)
          keys.splice(at, 0, key)
        }
        for (let i = 1; i < keys.length; i++) {
          expect(keys[i - 1]! < keys[i]!).toBe(true)
        }
      }),
    )
  })

  it('generates n ordered keys in one call', () => {
    const keys = generateNIndexesBetween(null, null, 10)
    expect(keys).toHaveLength(10)
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true)
    }
  })

  it('rejects an inverted range', () => {
    const a = generateIndexBetween(null, null)
    const b = generateIndexBetween(a, null)
    expect(() => generateIndexBetween(b, a)).toThrow()
  })
})
