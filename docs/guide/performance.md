# Performance

The architecture makes a specific claim: putting the controls in the DOM costs nothing at scale. This page is what that rests on, and how to check it in your own application.

<Demo id="performance" title="Watch the overlay node count as the shape count grows" />

## Targets

| Metric | Target |
|---|---|
| Pan and zoom with 5,000 shapes | 60fps |
| Hit test | under 1ms |
| Overlay DOM nodes | Constant — a function of the controls shown, never of the document |

The first two are hardware-dependent and measured in the browser; the demo above reports both. The third is structural and holds by construction.

## Why the DOM overlay does not become the bottleneck

**Only the selection has control DOM.** Ten thousand shapes and one selected means one box and nine handles. A multi-selection is still one box. Node count tracks what is being manipulated, not what exists.

**The viewport transform is written once, to one element.** Overlay children sit at world coordinates and are never touched when the camera moves. Panning costs one style write whether there are 3 controls or 30.

**Handle sizes are corrected in CSS,** by dividing by `--hc-zoom`. The alternative — writing a corrected pixel size onto each element every frame — would reintroduce exactly the per-element work the previous point removes. This is why [the counter-scaling rule](/guide/styling#counter-scaling) is a rule and not a suggestion.

## Culling

Shapes outside the viewport are not drawn. The R-tree that answers hit tests answers the visibility query too, so culling costs almost nothing beyond what is already there.

```ts
editor.getRenderStats()   // { drawn: 214, culled: 4786, indexed: 5000 }
editor.getVisibleShapeIds()
```

Shapes in [ephemeral state](/guide/concepts#ephemeral-state) are **never** culled — otherwise something dragged in from off-screen would disappear at the moment it matters most.

## Hit testing

Two phases. The R-tree narrows candidates by bounding box, then `ShapeUtil.hitTest` decides exactly.

Both are necessary. The bounding box of a rotated shape is much larger than the shape, so a box test alone selects empty space; and testing every shape exactly is linear in document size. Candidates are walked in reverse paint order, so the topmost match wins and the search stops there.

Tolerance arrives in screen pixels and is converted per query, so a 1px line stays clickable at any zoom.

## Rendering

Renders are coalesced into `requestAnimationFrame`: any number of state changes in one tick produce one frame. Nothing renders synchronously, so a loop of `updateShape` calls does not paint N times — though it should still be a transaction, for the history.

Dirty-rectangle rendering is not in v1.0. The full visible set is redrawn each frame, which is what makes culling the load-bearing optimisation.

## Writing tools that stay fast

The single most important rule: **write ephemeral state during an interaction, commit once at the end.**

```ts
// during the drag, once per frame
editor.setEphemeral(new Map([[id, { x, y }]]))

// on pointer up
editor.commitEphemeral()
```

Writing committed state every frame rebuilds the immutable tree sixty times a second *and* fills the undo stack. Both problems disappear together — which is why the ephemeral layer exists rather than being an optimisation bolted on afterwards.

Ephemeral shapes are excluded from the spatial index and handled linearly, on the assumption that at most about 100 shapes move at once. If your application genuinely drags thousands simultaneously, measure before relying on this.

## Transactions

```ts
editor.transact(() => {
  for (const row of tenThousandRows) editor.createShape(toShape(row))
})
```

One notification, one history entry, one index rebuild. Without the wrapper: ten thousand of each.

## Bundle size

`core` and `ui` have **zero runtime dependencies**. The R-tree, the ID generator and the fractional index are implemented in-tree rather than pulled from npm — three small, stable algorithms against three supply-chain surfaces and three sets of transitive dependencies.

The published target for `core` is 30KB gzipped, treated as a target rather than a hard limit; CI warns on overshoot and fails only well beyond it. The figure to care about is your own bundle after tree-shaking, not the size of the barrel export, which nobody imports whole. `sideEffects` is declared, so unused shapes, tools and utilities drop out.

## Measuring your own application

```ts
editor.getRenderStats()                              // drawn / culled / indexed
editor.overlayElement.querySelectorAll('*').length   // should not track shape count
editor.getSnapshot().shapes.size
```

If the overlay node count grows with the document, something is creating control DOM per shape — which is invariant 2 being broken, and the point at which the DOM overlay stops being free.
