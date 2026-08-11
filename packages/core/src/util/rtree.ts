import type { Bounds } from '../math/bounds'

/**
 * Bulk-loaded R-tree over axis-aligned boxes.
 *
 * The broad phase for hit testing and culling. A linear scan is fine at a few
 * hundred shapes and stops being fine well before the 5,000 the performance
 * target calls for, at which point both operations run on every frame
 * (spec §9.1).
 *
 * Written here rather than taken from a dependency because `core` ships with no
 * runtime dependencies (spec §14.3). The structure follows the standard OMT
 * (overlap-minimising top-down) bulk load used by rbush.
 *
 * Note what this index does *not* contain: shapes with a pending interactive
 * change. Their committed position is stale by definition, so they are held
 * separately and scanned linearly — there are at most a handful of them, and
 * keeping them out avoids rebuilding the tree on every pointer move
 * (spec §5.2.4).
 */

const MAX_ENTRIES = 9
const MIN_ENTRIES = Math.max(2, Math.ceil(MAX_ENTRIES * 0.4))

interface Node<T> {
  children: Array<Node<T> | Leaf<T>>
  bounds: Bounds
  leaf: boolean
  height: number
}

interface Leaf<T> {
  item: T
  bounds: Bounds
}

const isLeafEntry = <T>(entry: Node<T> | Leaf<T>): entry is Leaf<T> => 'item' in entry

function enclose(entries: ReadonlyArray<{ bounds: Bounds }>): Bounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const entry of entries) {
    const b = entry.bounds
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y + b.height > maxY) maxY = b.y + b.height
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const intersects = (a: Bounds, b: Bounds): boolean =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height

const containsPoint = (b: Bounds, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height

/** Partial sort placing the k-th element as if the whole range were sorted. */
function quickselect<T>(
  items: T[],
  k: number,
  left: number,
  right: number,
  compare: (a: T, b: T) => number,
): void {
  while (right > left) {
    if (right - left > 600) {
      // Sampling heuristic from the original select algorithm; keeps the
      // recursion shallow on large inputs.
      const n = right - left + 1
      const m = k - left + 1
      const z = Math.log(n)
      const s = 0.5 * Math.exp((2 * z) / 3)
      const sd = 0.5 * Math.sqrt((z * s * (n - s)) / n) * (m - n / 2 < 0 ? -1 : 1)
      const newLeft = Math.max(left, Math.floor(k - (m * s) / n + sd))
      const newRight = Math.min(right, Math.floor(k + ((n - m) * s) / n + sd))
      quickselect(items, k, newLeft, newRight, compare)
    }

    const t = items[k]!
    let i = left
    let j = right

    swap(items, left, k)
    if (compare(items[right]!, t) > 0) swap(items, left, right)

    while (i < j) {
      swap(items, i, j)
      i++
      j--
      while (compare(items[i]!, t) < 0) i++
      while (compare(items[j]!, t) > 0) j--
    }

    if (compare(items[left]!, t) === 0) swap(items, left, j)
    else {
      j++
      swap(items, j, right)
    }

    if (j <= k) left = j + 1
    if (k <= j) right = j - 1
  }
}

function swap<T>(items: T[], i: number, j: number): void {
  const tmp = items[i]!
  items[i] = items[j]!
  items[j] = tmp
}

export class RTree<T> {
  private root: Node<T> = { children: [], bounds: emptyBounds(), leaf: true, height: 1 }
  private count = 0

  get size(): number {
    return this.count
  }

  /**
   * Rebuild from scratch.
   *
   * Bulk loading beats repeated insertion badly enough that the index is simply
   * rebuilt when the document changes, rather than maintained incrementally.
   * Document changes happen per user action; interactive changes never touch it.
   */
  load(entries: ReadonlyArray<{ item: T; bounds: Bounds }>): void {
    this.count = entries.length
    if (entries.length === 0) {
      this.root = { children: [], bounds: emptyBounds(), leaf: true, height: 1 }
      return
    }
    const leaves: Leaf<T>[] = entries.map((entry) => ({ item: entry.item, bounds: entry.bounds }))
    this.root = build(leaves, 0, leaves.length - 1, treeHeight(leaves.length))
  }

  clear(): void {
    this.load([])
  }

  search(area: Bounds): T[] {
    const out: T[] = []
    if (this.count === 0 || !intersects(this.root.bounds, area)) return out

    const stack: Array<Node<T>> = [this.root]
    while (stack.length > 0) {
      const node = stack.pop()!
      for (const child of node.children) {
        if (!intersects(child.bounds, area)) continue
        if (isLeafEntry(child)) out.push(child.item)
        else stack.push(child)
      }
    }
    return out
  }

  searchPoint(x: number, y: number): T[] {
    const out: T[] = []
    if (this.count === 0 || !containsPoint(this.root.bounds, x, y)) return out

    const stack: Array<Node<T>> = [this.root]
    while (stack.length > 0) {
      const node = stack.pop()!
      for (const child of node.children) {
        if (!containsPoint(child.bounds, x, y)) continue
        if (isLeafEntry(child)) out.push(child.item)
        else stack.push(child)
      }
    }
    return out
  }
}

function emptyBounds(): Bounds {
  return { x: 0, y: 0, width: 0, height: 0 }
}

function treeHeight(count: number): number {
  return Math.ceil(Math.log(count) / Math.log(MAX_ENTRIES))
}

function build<T>(leaves: Leaf<T>[], left: number, right: number, height: number): Node<T> {
  const count = right - left + 1

  if (count <= MAX_ENTRIES) {
    const children = leaves.slice(left, right + 1)
    return { children, bounds: enclose(children), leaf: true, height: 1 }
  }

  const targetHeight = height || treeHeight(count)
  const rootCapacity = Math.ceil(count / MAX_ENTRIES ** (targetHeight - 1))

  // Split into vertical slices, then split each slice horizontally, so the
  // resulting boxes overlap as little as possible.
  const sliceCount = Math.ceil(count / rootCapacity)
  const stripe = rootCapacity * Math.ceil(Math.sqrt(sliceCount))

  multiSelect(leaves, left, right, stripe, compareMinX)

  const children: Array<Node<T>> = []
  for (let i = left; i <= right; i += stripe) {
    const stripeRight = Math.min(i + stripe - 1, right)
    multiSelect(leaves, i, stripeRight, rootCapacity, compareMinY)
    for (let j = i; j <= stripeRight; j += rootCapacity) {
      children.push(build(leaves, j, Math.min(j + rootCapacity - 1, stripeRight), targetHeight - 1))
    }
  }

  return { children, bounds: enclose(children), leaf: false, height: targetHeight }
}

function multiSelect<T>(
  items: Leaf<T>[],
  left: number,
  right: number,
  n: number,
  compare: (a: Leaf<T>, b: Leaf<T>) => number,
): void {
  const stack: number[] = [left, right]
  while (stack.length > 0) {
    const hi = stack.pop()!
    const lo = stack.pop()!
    if (hi - lo <= n) continue
    const mid = lo + Math.ceil((hi - lo) / n / 2) * n
    quickselect(items, mid, lo, hi, compare)
    stack.push(lo, mid, mid, hi)
  }
}

const compareMinX = <T>(a: Leaf<T>, b: Leaf<T>): number => a.bounds.x - b.bounds.x
const compareMinY = <T>(a: Leaf<T>, b: Leaf<T>): number => a.bounds.y - b.bounds.y

export { MAX_ENTRIES as RTREE_MAX_ENTRIES, MIN_ENTRIES as RTREE_MIN_ENTRIES }
