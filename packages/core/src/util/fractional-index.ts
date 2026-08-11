/**
 * Fractional indexing for z-order.
 *
 * Keys are strings ordered lexicographically, and a new key can always be
 * produced strictly between any two existing keys. Reordering therefore touches
 * a single shape rather than every shape after it, which keeps patches small
 * and makes merging externally-originated changes tractable (spec §5.3.2).
 *
 * The midpoint scheme is the well-known one popularised by Figma's "Realtime
 * editing of ordered sequences" and implemented in the MIT-licensed
 * `fractional-indexing` package. It is reimplemented here rather than taken as
 * a dependency because `core` ships with no runtime dependencies (spec §14.3).
 *
 * Invariant: a key never ends in the lowest digit ('0'), which is what
 * guarantees a midpoint always exists below it.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const digitAt = (s: string, i: number): number => {
  const index = DIGITS.indexOf(s[i]!)
  if (index < 0) throw new Error(`invalid fractional index digit: ${s[i]}`)
  return index
}

/**
 * A string strictly between `a` and `b`.
 *
 * `a` is the empty string for "no lower bound"; `b` is null for "no upper
 * bound". Requires `a < b`.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`fractional index out of order: ${a} >= ${b}`)
  }
  if (a.endsWith('0') || b?.endsWith('0')) {
    throw new Error('fractional index must not end in the lowest digit')
  }

  if (b !== null) {
    // Strip the shared prefix and recurse on the remainder.
    let n = 0
    while ((a[n] ?? '0') === b[n]) n++
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
    }
  }

  const digitA = a.length > 0 ? digitAt(a, 0) : 0
  const digitB = b !== null ? digitAt(b, 0) : DIGITS.length

  if (digitB - digitA > 1) {
    // There is room for a digit strictly between the two.
    return DIGITS[Math.round(0.5 * (digitA + digitB))]!
  }

  if (b !== null && b.length > 1) {
    // The digits are adjacent, but `b` has more to give.
    return b.slice(0, 1)
  }

  // The digits are adjacent and `b` is a single digit (or absent): descend into
  // `a` and find room one place further down.
  return DIGITS[digitA]! + midpoint(a.slice(1), null)
}

/**
 * Generate a key ordered strictly between `before` and `after`.
 *
 * Pass null for either side to append at that end. `generateIndexBetween(null,
 * null)` produces the first key of a list.
 */
export function generateIndexBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`fractional index out of order: ${before} >= ${after}`)
  }
  return midpoint(before ?? '', after)
}

/** Keys for `n` consecutive positions between `before` and `after`. */
export function generateNIndexesBetween(
  before: string | null,
  after: string | null,
  n: number,
): string[] {
  const out: string[] = []
  let lower = before
  for (let i = 0; i < n; i++) {
    const key = generateIndexBetween(lower, after)
    out.push(key)
    lower = key
  }
  return out
}

/** Comparator for sorting shapes into paint order. */
export const compareIndexes = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
