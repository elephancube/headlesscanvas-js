import type { Bounds } from '../math/bounds'
import type { Matrix } from '../math/matrix'
import { worldAabb } from '../render/canvas2d'
import type { AnyShape, ShapeId } from '../shape/types'
import { RTree } from '../util/rtree'

/**
 * Broad-phase lookup for hit testing and culling.
 *
 * The index is built from committed state only. Shapes with a pending
 * interactive change are held aside and scanned linearly, because rebuilding
 * the tree on every pointer move would cost far more than checking the handful
 * of shapes currently being dragged (spec §5.2.4, §9.1).
 */
export class SpatialIndex {
  private readonly tree = new RTree<ShapeId>()
  private dirty = true
  private excluded: ReadonlySet<ShapeId> = new Set()

  /** Mark the index stale; it is rebuilt on the next query. */
  invalidate(): void {
    this.dirty = true
  }

  setExcluded(ids: ReadonlySet<ShapeId>): void {
    this.excluded = ids
  }

  get excludedIds(): ReadonlySet<ShapeId> {
    return this.excluded
  }

  private rebuild(
    order: readonly ShapeId[],
    resolve: (id: ShapeId) => AnyShape | undefined,
    transformOf: (id: ShapeId) => Matrix | null,
  ): void {
    const entries: Array<{ item: ShapeId; bounds: Bounds }> = []
    for (const id of order) {
      const shape = resolve(id)
      const transform = transformOf(id)
      if (!shape || !transform) continue
      entries.push({ item: id, bounds: worldAabb(shape, transform) })
    }
    this.tree.load(entries)
    this.dirty = false
  }

  ensure(
    order: readonly ShapeId[],
    resolve: (id: ShapeId) => AnyShape | undefined,
    transformOf: (id: ShapeId) => Matrix | null,
  ): void {
    if (this.dirty) this.rebuild(order, resolve, transformOf)
  }

  /** Candidate ids intersecting `area`, plus every excluded (in-flight) shape. */
  search(area: Bounds): Set<ShapeId> {
    const found = new Set(this.tree.search(area))
    for (const id of this.excluded) found.add(id)
    return found
  }

  searchPoint(x: number, y: number): Set<ShapeId> {
    const found = new Set(this.tree.searchPoint(x, y))
    for (const id of this.excluded) found.add(id)
    return found
  }

  get size(): number {
    return this.tree.size
  }
}
