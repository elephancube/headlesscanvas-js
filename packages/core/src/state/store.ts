import type { AnyShape, ShapeId } from '../shape/types'
import { DEV } from '../util/dev'
import { compareIndexes } from '../util/fractional-index'
import type { Patch } from './patch'

/**
 * The immutable view of the document handed to subscribers.
 *
 * A stable object identity per version is what lets React's
 * `useSyncExternalStore` compare snapshots without tearing under concurrent
 * rendering (spec §5.2.1).
 */
export interface StoreSnapshot {
  readonly version: number
  readonly shapes: ReadonlyMap<ShapeId, AnyShape>
  /** Root-level shapes in paint order. */
  readonly rootChildren: readonly ShapeId[]
  /** Every shape in paint order, depth-first. */
  readonly paintOrder: readonly ShapeId[]
  readonly selectedIds: readonly ShapeId[]
}

export interface TransactOptions {
  /** Skip the history entry — used for changes the user did not make. */
  addToHistory?: boolean
  /** Consecutive transactions sharing a key collapse into one entry. */
  mergeKey?: string
}

export interface CommitEvent {
  patches: readonly Patch[]
  options: TransactOptions
  selectionBefore: readonly ShapeId[]
  selectionAfter: readonly ShapeId[]
}

function buildOrder(shapes: ReadonlyMap<ShapeId, AnyShape>): {
  rootChildren: ShapeId[]
  paintOrder: ShapeId[]
} {
  const childrenByParent = new Map<ShapeId | null, AnyShape[]>()
  for (const shape of shapes.values()) {
    const siblings = childrenByParent.get(shape.parentId)
    if (siblings) siblings.push(shape)
    else childrenByParent.set(shape.parentId, [shape])
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => compareIndexes(a.index, b.index))
  }

  const paintOrder: ShapeId[] = []
  const walk = (parentId: ShapeId | null): ShapeId[] => {
    const siblings = childrenByParent.get(parentId) ?? []
    const ids: ShapeId[] = []
    for (const shape of siblings) {
      ids.push(shape.id)
      paintOrder.push(shape.id)
      walk(shape.id)
    }
    return ids
  }

  return { rootChildren: walk(null), paintOrder }
}

const EMPTY_SNAPSHOT: StoreSnapshot = {
  version: 0,
  shapes: new Map(),
  rootChildren: [],
  paintOrder: [],
  selectedIds: [],
}

/**
 * Document state.
 *
 * Two things are worth knowing before reading the rest:
 *
 * 1. Writes go through `transact`. Reads inside a transaction see the
 *    uncommitted values (read-your-writes), because a tool that updates several
 *    shapes in sequence needs to observe its own work. Subscribers, on the
 *    other hand, never see an intermediate state — `getSnapshot` keeps
 *    returning the committed one until the outermost transaction closes
 *    (spec §5.2.3).
 *
 * 2. Interactive changes do not go through `transact` at all while they are in
 *    flight. A drag writes to the *ephemeral* layer, which is a plain overlay
 *    map that costs nothing to update per frame, and commits once on pointer
 *    release. Rebuilding the immutable tree on every `pointermove` is what
 *    would otherwise blow the frame budget (spec §5.2.4).
 */
export class Store {
  private snapshot: StoreSnapshot = EMPTY_SNAPSHOT

  private draft: Map<ShapeId, AnyShape | null> | null = null
  private draftSelection: ShapeId[] | null = null
  private depth = 0
  private patches: Patch[] = []
  private selectionBefore: readonly ShapeId[] = []

  private readonly listeners = new Set<() => void>()
  private readonly commitListeners = new Set<(event: CommitEvent) => void>()

  private ephemeral: Map<ShapeId, Partial<AnyShape>> = new Map()
  private readonly ephemeralListeners = new Set<() => void>()

  private notifying = false
  private renderVersion = 0

  // --- reading -------------------------------------------------------------

  getSnapshot(): StoreSnapshot {
    return this.snapshot
  }

  /**
   * Advances on every change that alters what is on screen, committed or
   * ephemeral. Adapters use it as a cache key so that a derived value can be
   * recomputed only when it could actually have changed — `useSyncExternalStore`
   * requires a stable result between changes or it re-renders forever.
   */
  getRenderVersion(): number {
    return this.renderVersion
  }

  /** Committed value, or the uncommitted one when inside a transaction. */
  get(id: ShapeId): AnyShape | undefined {
    if (this.draft?.has(id)) return this.draft.get(id) ?? undefined
    return this.snapshot.shapes.get(id)
  }

  /**
   * The value as it currently appears on screen — committed state with any
   * ephemeral overlay applied. Rendering, hit testing and bounds queries all
   * use this so that "what the user sees" and "what the API reports" agree
   * mid-drag (spec §5.2.4).
   */
  getResolved(id: ShapeId): AnyShape | undefined {
    const base = this.get(id)
    if (!base) return undefined
    const overlay = this.ephemeral.get(id)
    return overlay ? ({ ...base, ...overlay } as AnyShape) : base
  }

  get selectedIds(): readonly ShapeId[] {
    return this.draftSelection ?? this.snapshot.selectedIds
  }

  /**
   * Every shape as it currently stands, including uncommitted changes.
   *
   * `getSnapshot().shapes` deliberately lags behind inside a transaction, so
   * anything that has to see the work in progress — assigning the next z-order
   * key while creating several shapes at once, for instance — must come through
   * here instead (spec §5.2.3).
   */
  *currentShapes(): Generator<AnyShape> {
    if (!this.draft) {
      yield* this.snapshot.shapes.values()
      return
    }
    for (const shape of this.draft.values()) {
      if (shape !== null) yield shape
    }
    for (const [id, shape] of this.snapshot.shapes) {
      if (!this.draft.has(id)) yield shape
    }
  }

  // --- subscribing ---------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Fires every frame during an interaction, so it is kept off the main path. */
  subscribeEphemeral(listener: () => void): () => void {
    this.ephemeralListeners.add(listener)
    return () => this.ephemeralListeners.delete(listener)
  }

  /** Commit feed for the history stack. */
  subscribeCommit(listener: (event: CommitEvent) => void): () => void {
    this.commitListeners.add(listener)
    return () => this.commitListeners.delete(listener)
  }

  // --- writing -------------------------------------------------------------

  transact<T>(fn: () => T, options: TransactOptions = {}): T {
    if (DEV && this.notifying) {
      console.warn(
        '[headless-canvas] state was changed from inside a subscriber; ' +
          'defer the change to avoid re-entrant updates',
      )
    }

    const isOutermost = this.depth === 0
    if (isOutermost) {
      this.draft = new Map()
      this.draftSelection = null
      this.patches = []
      this.selectionBefore = this.snapshot.selectedIds
    }
    this.depth++

    let result: T
    try {
      result = fn()
    } catch (error) {
      this.depth--
      if (this.depth === 0) this.rollback()
      throw error
    }

    this.depth--
    if (this.depth === 0) this.commit(options)
    return result
  }

  put(shape: AnyShape): void {
    this.ensureTransaction(() => {
      this.draft!.set(shape.id, DEV ? Object.freeze(shape) : shape)
      this.patches.push({ op: 'create', shape })
    })
  }

  update(id: ShapeId, changes: Partial<AnyShape>): void {
    this.ensureTransaction(() => {
      const current = this.get(id)
      if (!current) {
        if (DEV) console.warn(`[headless-canvas] update of unknown shape: ${id}`)
        return
      }

      const currentRecord = current as unknown as Record<string, unknown>
      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      let changed = false
      for (const [key, value] of Object.entries(changes)) {
        if (currentRecord[key] === value) continue
        before[key] = currentRecord[key]
        after[key] = value
        changed = true
      }
      if (!changed) return

      const next = { ...current, ...changes } as AnyShape
      this.draft!.set(id, DEV ? Object.freeze(next) : next)
      this.patches.push({
        op: 'update',
        id,
        before: before as Partial<AnyShape>,
        after: after as Partial<AnyShape>,
      })
    })
  }

  remove(id: ShapeId): void {
    this.ensureTransaction(() => {
      const current = this.get(id)
      if (!current) return
      this.draft!.set(id, null)
      this.patches.push({ op: 'delete', shape: current })
    })
  }

  setSelection(ids: readonly ShapeId[]): void {
    this.ensureTransaction(() => {
      this.draftSelection = [...ids]
    })
  }

  /** Apply patches directly. Used by undo/redo and by external sources. */
  applyPatches(patches: readonly Patch[], options: TransactOptions = {}): void {
    this.transact(() => {
      for (const patch of patches) {
        switch (patch.op) {
          case 'create':
            this.put(patch.shape)
            break
          case 'delete':
            this.remove(patch.shape.id)
            break
          case 'update':
            this.update(patch.id, patch.after)
            break
        }
      }
    }, options)
  }

  // --- ephemeral layer -----------------------------------------------------

  setEphemeral(changes: ReadonlyMap<ShapeId, Partial<AnyShape>>): void {
    this.ephemeral = new Map(changes)
    this.notifyEphemeral()
  }

  getEphemeral(): ReadonlyMap<ShapeId, Partial<AnyShape>> {
    return this.ephemeral
  }

  hasEphemeral(): boolean {
    return this.ephemeral.size > 0
  }

  clearEphemeral(): void {
    if (this.ephemeral.size === 0) return
    this.ephemeral = new Map()
    this.notifyEphemeral()
  }

  /** Fold the ephemeral overlay into committed state as a single transaction. */
  commitEphemeral(options: TransactOptions = {}): void {
    if (this.ephemeral.size === 0) return
    const changes = this.ephemeral
    this.ephemeral = new Map()
    this.transact(() => {
      for (const [id, patch] of changes) this.update(id, patch)
    }, options)
    this.notifyEphemeral()
  }

  // --- internals -----------------------------------------------------------

  private ensureTransaction(fn: () => void): void {
    if (this.depth > 0) {
      fn()
      return
    }
    this.transact(fn)
  }

  private rollback(): void {
    this.draft = null
    this.draftSelection = null
    this.patches = []
  }

  private commit(options: TransactOptions): void {
    const draft = this.draft
    const draftSelection = this.draftSelection
    this.draft = null
    this.draftSelection = null

    const hasShapeChanges = draft !== null && draft.size > 0
    const hasSelectionChange =
      draftSelection !== null && !sameIds(draftSelection, this.snapshot.selectedIds)

    if (!hasShapeChanges && !hasSelectionChange) {
      this.patches = []
      return
    }

    let shapes = this.snapshot.shapes
    let rootChildren = this.snapshot.rootChildren
    let paintOrder = this.snapshot.paintOrder

    if (hasShapeChanges) {
      // Copy-on-write at the map level. Fine because committed writes happen
      // per user action rather than per frame — that is exactly what the
      // ephemeral layer buys. A persistent map would be the Phase 2 upgrade if
      // benchmarks ask for it.
      const next = new Map(shapes)
      for (const [id, shape] of draft!) {
        if (shape === null) next.delete(id)
        else next.set(id, shape)
      }
      shapes = next
      const order = buildOrder(next)
      rootChildren = order.rootChildren
      paintOrder = order.paintOrder
    }

    const selectionBefore = this.snapshot.selectedIds
    const selectedIds = hasSelectionChange
      ? draftSelection!.filter((id) => shapes.has(id))
      : selectionBefore.filter((id) => shapes.has(id))

    this.snapshot = {
      version: this.snapshot.version + 1,
      shapes,
      rootChildren,
      paintOrder,
      selectedIds,
    }

    const patches = this.patches
    this.patches = []

    if (patches.length > 0 && options.addToHistory !== false) {
      const event: CommitEvent = {
        patches,
        options,
        selectionBefore: this.selectionBefore,
        selectionAfter: selectedIds,
      }
      for (const listener of this.commitListeners) listener(event)
    }

    this.notify()
  }

  private notify(): void {
    this.renderVersion++
    this.notifying = true
    try {
      for (const listener of this.listeners) listener()
    } finally {
      this.notifying = false
    }
  }

  private notifyEphemeral(): void {
    this.renderVersion++
    for (const listener of this.ephemeralListeners) listener()
  }
}

function sameIds(a: readonly ShapeId[], b: readonly ShapeId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
