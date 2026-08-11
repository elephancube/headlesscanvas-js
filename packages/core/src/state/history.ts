import type { ShapeId } from '../shape/types'
import { invertPatches, type Patch } from './patch'
import type { CommitEvent, Store } from './store'

export interface HistoryEntry {
  /** Applied to redo. */
  patches: Patch[]
  /** Applied to undo. */
  inverse: Patch[]
  selectionBefore: readonly ShapeId[]
  selectionAfter: readonly ShapeId[]
  mergeKey?: string
  /** Wall-clock time of the last commit folded into this entry. */
  timestamp: number
}

export interface HistoryOptions {
  /** Entries kept before the oldest is dropped. Defaults to 100. */
  limit?: number
  /**
   * How long consecutive commits sharing a `mergeKey` keep folding together.
   * Defaults to 1000ms; pass 0 to disable time-based merging entirely.
   */
  mergeWindowMs?: number
  now?(): number
}

/**
 * Undo/redo.
 *
 * Built on inverse patches rather than snapshots: a snapshot per step is simple
 * but its memory cost scales with document size, and the inverse of a patch is
 * something `applyPatch` already knows how to consume — so the history and the
 * external-change path rest on one mechanism instead of two (spec §5.9.1).
 *
 * Two things are deliberately kept out of the stack. The viewport, because
 * undoing a pan is not what anyone means by undo. And the selection, which is
 * recorded per entry and *restored* on undo rather than being undoable itself —
 * so the user can see what just changed (spec §5.9.2).
 */
export class History {
  private readonly undoStack: HistoryEntry[] = []
  private readonly redoStack: HistoryEntry[] = []
  private readonly limit: number
  private readonly mergeWindowMs: number
  private readonly now: () => number
  private readonly listeners = new Set<() => void>()

  private applying = false
  private ignoring = false
  private readonly unsubscribe: () => void

  constructor(
    private readonly store: Store,
    options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? 100
    this.mergeWindowMs = options.mergeWindowMs ?? 1000
    this.now = options.now ?? (() => Date.now())
    this.unsubscribe = store.subscribeCommit((event) => this.record(event))
  }

  dispose(): void {
    this.unsubscribe()
    this.listeners.clear()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Depths, for a UI that wants to show them. */
  getSize(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length }
  }

  undo(): void {
    const entry = this.undoStack.pop()
    if (!entry) return
    this.apply(entry.inverse, entry.selectionBefore)
    this.redoStack.push(entry)
    this.notify()
  }

  redo(): void {
    const entry = this.redoStack.pop()
    if (!entry) return
    this.apply(entry.patches, entry.selectionAfter)
    this.undoStack.push(entry)
    this.notify()
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.notify()
  }

  /** Changes made inside `fn` are not recorded. */
  ignore<T>(fn: () => T): T {
    const previous = this.ignoring
    this.ignoring = true
    try {
      return fn()
    } finally {
      this.ignoring = previous
    }
  }

  /**
   * Force a boundary, so the next commit starts a fresh entry even if it shares
   * a merge key with the last one.
   */
  mark(): void {
    const top = this.undoStack[this.undoStack.length - 1]
    if (top) top.mergeKey = undefined
  }

  private record(event: CommitEvent): void {
    // Undo and redo replay patches through the store; without this guard each
    // replay would push a new entry and the stack could never unwind.
    if (this.applying || this.ignoring) return

    const patches = [...event.patches]
    const entry: HistoryEntry = {
      patches,
      inverse: invertPatches(patches),
      selectionBefore: event.selectionBefore,
      selectionAfter: event.selectionAfter,
      mergeKey: event.options.mergeKey,
      timestamp: this.now(),
    }

    const top = this.undoStack[this.undoStack.length - 1]
    const mergeable =
      top !== undefined &&
      entry.mergeKey !== undefined &&
      top.mergeKey === entry.mergeKey &&
      (this.mergeWindowMs === 0 || entry.timestamp - top.timestamp <= this.mergeWindowMs)

    if (mergeable && top) {
      // Holding an arrow key should be one undo step, not one per repeat
      // (spec §5.9.3). The merged entry keeps the original starting point.
      top.patches.push(...entry.patches)
      top.inverse.unshift(...entry.inverse)
      top.selectionAfter = entry.selectionAfter
      top.timestamp = entry.timestamp
    } else {
      this.undoStack.push(entry)
      if (this.undoStack.length > this.limit) this.undoStack.shift()
    }

    // Any new edit invalidates the redo branch.
    this.redoStack.length = 0
    this.notify()
  }

  private apply(patches: readonly Patch[], selection: readonly ShapeId[]): void {
    this.applying = true
    try {
      this.store.transact(
        () => {
          this.store.applyPatches(patches, { addToHistory: false })
          this.store.setSelection(selection)
        },
        { addToHistory: false },
      )
    } finally {
      this.applying = false
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
