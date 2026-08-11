# Concepts

Most of the API follows from a small number of decisions. This page covers them, because several things that look arbitrary in isolation are consequences of one of these.

## Two layers

```
┌─────────────────────────────────────┐
│  DOM overlay  — selection, handles  │
├─────────────────────────────────────┤
│  Canvas       — shapes, images      │
└─────────────────────────────────────┘
```

The canvas renders shapes and nothing else. The overlay carries everything a user can grab. Neither layer calls the other: the editor's state changes, and both redraw from it independently.

### The four invariants

1. **No UI is drawn into the canvas.** Selection boxes, handles and hover indication are DOM elements, restyleable with CSS.
2. **Unselected shapes get no control DOM.** A multi-selection draws one bounding box, not one per shape. The number of overlay nodes is a function of the controls being shown, never of the document size. The visually hidden list that assistive technology reads is not control UI and is exempt — but it is virtualised to the viewport, so it stays bounded too.
3. **The viewport transform is applied once, to one element.** Overlay children are positioned in world coordinates. Panning writes one `transform` regardless of how many controls are on screen.
4. **Handle sizes are corrected in CSS**, using the `--hc-zoom` variable the library writes. Correcting each element from JavaScript would mean touching N elements per frame, giving up what invariant 3 buys.

If you build your own controls, invariants 3 and 4 are yours to keep. [Building your own controls](/guide/custom-controls) shows what that looks like in practice.

## Coordinates

There are three spaces.

| Space | Origin | Used by |
|---|---|---|
| **Screen** | Container's top-left corner, in CSS pixels | Pointer events, `hitTest`, hit tolerance |
| **World** | The document's own space | Shape `x`/`y`, selection bounds, snapping, the overlay's children |
| **Local** | A shape's own top-left, before rotation | `ShapeUtil.render`, `ShapeUtil.hitTest` |

Y points **down**. Rotation is in **radians, clockwise**. At zoom 1.0 with the camera at the origin, world and screen coincide.

```ts
const world = editor.viewport.screenToWorld({ x: 100, y: 40 })
const screen = editor.viewport.worldToScreen(world)
```

Hit tolerance is specified in **screen** pixels (5 by default) and converted to world units per query, because a fixed world tolerance would grow and shrink visually as you zoom.

## The transform model

A shape stores `x`, `y`, `width`, `height` and `rotation`. There is **no scale component**.

This matters more than it sounds. Fabric.js keeps `width` alongside `scaleX`, which is why stroke widths, corner radii and text distort when a shape is resized there — the scale multiplies everything, including the things that should not scale. Here, resizing rewrites the real `width` and `height`, so a 2px stroke stays 2px and a 24px font stays 24px.

Since v1.0 has no skew, the transform stays decomposed and the matrix is derived when needed. Serialised documents are readable as a result, and there is never a matrix to decompose ambiguously back into components.

```ts
const matrix = editor.getWorldTransform(id)      // parent chain included
const bounds = editor.getShapeBounds(id, 'world') // oriented: has a rotation
```

## State, transactions and time

State is **immutable with structural sharing**. Reading gives you a snapshot; the snapshot does not change under you.

```ts
const snapshot = editor.getSnapshot()
snapshot.shapes      // ReadonlyMap<ShapeId, AnyShape>
snapshot.paintOrder  // every shape, depth-first, in paint order
snapshot.selectedIds
```

The unit of change is **one user action = one transaction**. A transaction commits once: subscribers are notified once, and the history gets one entry.

```ts
editor.transact(() => {
  editor.createShape({ type: 'rect', x: 0, y: 0, width: 10, height: 10 })
  editor.createShape({ type: 'rect', x: 20, y: 0, width: 10, height: 10 })
}) // one notification, one undo step
```

Inside a transaction, reads see writes made earlier in the same transaction. Outside it, `getSnapshot()` never shows an intermediate state — a subscriber cannot observe a half-finished operation.

```ts
editor.transact(() => {
  const id = editor.createShape({ type: 'rect', x: 0, y: 0, width: 10, height: 10 })
  editor.getShape(id) // defined, mid-transaction
})
```

### Ephemeral state

Dragging at 60fps and rebuilding an immutable tree every frame are incompatible. So a drag does not touch committed state at all: the tool writes a **diff** that lives outside the document, and commits it on pointer up.

```ts
editor.setEphemeral(new Map([[id, { x: 120, y: 80 }]])) // per frame, cheap
editor.commitEphemeral()                                // once, on pointer up
editor.clearEphemeral()                                 // on cancel
```

This is also what makes the undo granularity correct: a drag across the screen is one history entry, not four hundred.

Ephemeral state interacts with several subsystems, and the rules are worth knowing if you build tools:

| Subsystem | Rule |
|---|---|
| Spatial index | Ephemeral shapes are excluded and handled linearly — at most ~100 move at once |
| Culling | Ephemeral shapes are **always** drawn, so something dragged in from off-screen does not vanish |
| Hit testing | Uses the ephemeral position, so drop targets are judged where the shape appears to be |
| Snapping | The query comes from the ephemeral position; the index it queries holds committed positions |
| Bounds APIs | Return ephemeral-aware values |

`editor.getResolvedShape(id)` gives the shape with ephemeral changes applied; `editor.getShape(id)` gives the committed record.

## Identity and order

**IDs are opaque collision-resistant strings.** Not sequential integers — those collide the moment changes arrive from anywhere other than this editor instance, which is exactly the case the external-patch path exists for.

**Z-order is a fractional index**: a string key you can always generate a new value *between*. Reordering one shape rewrites one field, not the whole array, and the API exposes the operation that makes this worth having:

```ts
editor.moveTo([id], { before: otherId })
editor.moveTo([id], { after: otherId })
editor.reorder([id], 'front')
```

Dragging a row in a layers panel is `moveTo` with a `before` or `after` anchor. If that were not exposed, choosing a fractional index over an array would have bought nothing.

## Hierarchy

Shapes form a tree via `parentId`. Grouping and ungrouping are *not* the only operations — a real editor needs re-parenting that preserves world appearance:

```ts
editor.setParent([childId], groupId)   // the shape does not visually move
editor.getChildren(parentId)           // in paint order
editor.getAncestors(id)                // nearest first
```

Grouping and ungrouping **never bake the transform into the children**. Ungrouping a rotated group leaves its children looking exactly as they did.

## Events, in and out

There are three subscription channels, deliberately separate:

```ts
editor.subscribe(() => {})            // committed state changed
editor.subscribeEphemeral(() => {})   // an in-flight interaction changed
editor.subscribeNotifications(n => {}) // something recoverable went wrong
```

The third exists because a failed image load, an unregistered shape type in a loaded file, or a rejected export are not bugs in the caller's code — throwing at them would force a `try`/`catch` around ordinary operations. Programming errors, such as switching to a tool that was never registered, still throw.

Subscribers are never invoked from inside a transaction, so a listener cannot re-enter the store mid-write.

## Rendering

Renders are coalesced into `requestAnimationFrame`. Anything that changes state schedules one; nothing renders synchronously. To draw your own overlay content in step with the editor, use the same hook the default UI does:

```ts
const stop = editor.onFrame(() => {
  const box = editor.controls.getSelectionBox()
  // position your elements
})
```

Shapes outside the viewport are culled using the same R-tree that answers hit tests, so culling costs almost nothing and is on by default. `editor.getRenderStats()` reports what was drawn and what was skipped.

## Next

- [Shapes](/guide/shapes)
- [Tools](/guide/tools) — the state machine that owns input
- [Performance](/guide/performance) — the numbers behind the invariants
