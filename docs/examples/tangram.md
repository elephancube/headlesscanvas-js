# Tangram

Seven pieces, one silhouette. Drag a piece, press <kbd>R</kbd> to turn it 45°, <kbd>F</kbd> to flip the parallelogram. Drop one near where it belongs and it clicks in.

<Demo id="tangram" />

## Making the wrong move unreachable

A tangram has exactly three legal moves — slide, turn by 45°, reflect — and the stock select tool offers several that are not on the list. Free rotation puts pieces at angles no tangram has; resizing makes a piece that cannot fit; delete removes one entirely.

None of those is fixed by telling the user not to. They are removed:

```ts
// A tool with the whole repertoire and nothing else.
editor.tools.register('piece', (e) => new PieceTool(e, actions))
editor.tools.setCurrent('piece')
```

```css
/* The handles are elements, so the ones with no meaning here simply go. */
.hc-app-pick .hc-handle { display: none; }
```

`PieceTool` is about sixty lines: press to select, drag to move through the ephemeral layer, release to commit, and <kbd>R</kbd> / <kbd>F</kbd> through `onKeyDown`. Returning `true` from a key handler marks the event consumed, so the editor's own shortcuts do not also fire. [Tools →](/guide/tools)

Picking a piece up also brings it to the front, because pieces overlap constantly while a solution is being assembled and dragging one that stays buried reads as the wrong piece moving. That write stays out of the history — z-order here follows from touching something, and undo should not have to walk back through every piece the user merely clicked on.

```ts
this.editor.transact(() => this.editor.reorder([target], 'front'), { addToHistory: false })
```

## The magnet, and why it is one undo

Without a magnet the last few pixels of every placement are a test of the mouse rather than of the solver. With one, the piece snaps home — and the snap must not be a *second* thing to undo.

It is not, because it happens before the commit. The drag lives in the ephemeral layer the whole time; on release the tool writes the settled position into that same layer and only then commits.

```ts
onPointerUp(event: HcPointerEvent): void {
  const loose = this.moved(drag, event)
  // The whole drag is one entry, and the piece clicks into place as part of it
  // rather than as a second, separately undoable nudge.
  this.editor.setEphemeral(new Map([[drag.id, this.actions.settle(drag.id, loose.x, loose.y)]]))
  this.editor.commitEphemeral()
}
```

`settle` looks for an unoccupied slot of the same kind whose rotation the piece already matches, within 26 units. Rotation is compared in eighths of a turn, modulo each piece's own symmetry — a square repeats every quarter turn, a parallelogram every half, a triangle not at all.

## The geometry was computed, not guessed

The seven placements in the source are a table of numbers produced offline by a script that first *checks* the dissection: the areas sum to the square, and 160,000 sample points are each covered by exactly one piece. Then, for each piece, it searches the eight rotations and both reflections for the one that lands the canonical outline exactly on its target.

Deriving a tangram by hand and trusting it is how these end up with a puzzle that almost works. It is worth saying plainly: the interesting part of this application is not the library, it is arithmetic — and the arithmetic is where the bugs would have been.

The silhouette is drawn from the same table, in grey, `locked: true` so it is scenery rather than something to pick up. Target and answer cannot disagree, because they are the same seven numbers.

## Pieces are paths

No custom shape type here. A tangram piece is a polygon, `path` already draws polygons, and taking it means hit testing, serialisation and SVG export arrived working — solve the puzzle and export it, and the seven pieces come out as seven `<path>` elements. [Shapes →](/guide/shapes)

Flipping the parallelogram swaps the path data for its mirror and records which way round it is in `meta`, the per-shape slot the library never looks inside:

```ts
editor.updateShape(id, {
  meta: { ...shape.meta, flipped },
  props: { ...shape.props, d: flipped ? spec.mirror : spec.d },
})
```

## Source

::: details The application
<<< @/.vitepress/apps/tangram.ts
:::

[← All sample applications](./)
