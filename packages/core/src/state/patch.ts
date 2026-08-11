import type { AnyShape, ShapeId } from '../shape/types'

/**
 * A single change to the document.
 *
 * Undo/redo and `Editor.applyPatch` share this representation deliberately: an
 * inverse patch is what undo replays, so the history and the
 * external-change path rest on one mechanism rather than two (spec §5.9.1).
 */
export type Patch =
  | { op: 'create'; shape: AnyShape }
  | { op: 'update'; id: ShapeId; before: Partial<AnyShape>; after: Partial<AnyShape> }
  | { op: 'delete'; shape: AnyShape }

export function invertPatch(patch: Patch): Patch {
  switch (patch.op) {
    case 'create':
      return { op: 'delete', shape: patch.shape }
    case 'delete':
      return { op: 'create', shape: patch.shape }
    case 'update':
      return { op: 'update', id: patch.id, before: patch.after, after: patch.before }
  }
}

export const invertPatches = (patches: readonly Patch[]): Patch[] =>
  patches.map(invertPatch).reverse()
