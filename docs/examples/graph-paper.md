# Graph paper

**Draw** drags a segment between grid points. **Move a vertex** drags one of the white dots, and every segment meeting it follows. Then press undo once.

<Demo id="graph-paper" />

## One gesture, one entry in the history

This is the whole reason the application is here. Dragging a vertex where four segments meet rewrites four shapes — position, size and both endpoint ratios on each — and it has to end up as **one** undoable step, because the user made one movement.

Writing those four shapes on every `pointermove` would be wrong twice over: it would rebuild the immutable document sixty times a second, and it would leave sixty entries in the history. The ephemeral layer exists for exactly this. Changes go into an overlay map that costs nothing to rewrite per frame, and `commitEphemeral()` folds the final state into the document as a single step.

```ts
onPointerMove(event: HcPointerEvent): void {
  const changes = new Map<ShapeId, Partial<AnyShape>>()
  for (const segment of pending.incident) {
    const box = segmentBox(this.snap(event.world), segment.anchor)
    changes.set(segment.id, { x: box.x, y: box.y, width: box.width, height: box.height, props: … })
  }
  this.editor.setEphemeral(changes)      // free to repeat every frame
}

onPointerUp(): void {
  if (pending.moved) this.editor.commitEphemeral()   // one entry, however many segments
}
```

Hit testing, bounds queries and rendering all read *through* the ephemeral layer, so nothing goes stale mid-drag. [Concepts →](/guide/concepts)

## Where a line keeps its endpoints

`line` stores `start` and `end` as fractions of its own box rather than as coordinates. That is what lets the ordinary resize machinery move a line's endpoints without a special case anywhere — and it means placing a segment is a matter of working out the box and where in it the two ends fall.

```ts
function segmentBox(from: Vec, to: Vec): SegmentBox {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  // A perfectly horizontal or vertical segment would otherwise get a
  // zero-sized box: impossible to select and impossible to resize.
  const width = Math.max(Math.abs(to.x - from.x), 1)
  const height = Math.max(Math.abs(to.y - from.y), 1)
  return {
    x, y, width, height,
    start: { x: (from.x - x) / width, y: (from.y - y) / height },
    end: { x: (to.x - x) / width, y: (to.y - y) / height },
  }
}
```

There is no notion of a *vertex* in the document at all — a vertex is just a coordinate two segments happen to share, and the application recovers them by comparing endpoints. Keeping that out of the library is deliberate: bindings between shapes are an application's model, not a canvas engine's.

## Drawing the lattice with one element

The grid is a single `<div>` inside the overlay. The overlay already carries the viewport transform, so the grid pans and zooms with the drawing for free — no per-frame work that grows with the page (invariant 3).

Its dots divide by `--hc-zoom`, for the same reason a resize handle's size does. The drawing scales; the marks on the paper do not.

```css
.hc-app-grid {
  background-image: radial-gradient(
    circle,
    var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)),
    transparent 0
  );
}
```

Below about five screen pixels per square the lattice is denser than it is legible, so it is simply not drawn. [Styling the controls →](/guide/styling)

## Keeping the vertex markers bounded

The white dots marking existing vertices are application DOM, and DOM that scales with the document is the thing this library is built to avoid. They are pooled, capped, and built only from `editor.getVisibleShapeIds()` — the same culling result the renderer uses — so their number is bounded by the viewport, not by the drawing.

```ts
for (const id of editor.getVisibleShapeIds()) {
  const shape = editor.getResolvedShape(id)
  if (shape?.type !== 'line') continue
  for (const point of endpoints(shape)) {
    if (points.size >= MAX_MARKERS) break
    points.set(key(point), point)
  }
}
```

Watch the overlay node count in the status line while you draw. [Performance →](/guide/performance)

## Three modes, three tools

Drawing, moving a vertex and erasing all want the same pointer events, and resolving that with conditionals produces code nobody can safely change. Each is a tool instead, and the application's own tools register through the call the built-in ones use:

```ts
editor.tools.register('draw-segment', (e) => new SegmentTool(e, settings, 'draw'))
editor.tools.register('move-vertex', (e) => new SegmentTool(e, settings, 'vertex'))
editor.tools.register('erase', (e) => new EraseTool(e))
editor.tools.setCurrent('draw-segment')
```

Drawing and moving a vertex share an implementation but not a mode, and the difference matters. An earlier version of this application decided between them by proximity — press near an existing vertex and you meant to move it, otherwise you meant to draw. It reads well and it is unusable: presses *near an existing vertex* are most presses, because that is where segments start, so the guess is wrong often enough to be maddening. Separate tools cannot guess wrong.

There is no select tool here at all. Free dragging is not what squared paper is for, and offering it would only let you pull a segment off the lattice.

`settings` is held by reference, so the pitch and ink controls reconfigure the live tool without re-registering it. [Tools →](/guide/tools)

## Source

::: details The application
<<< @/.vitepress/apps/graph-paper.ts
:::

[← All sample applications](./)
