# History and snapping

## Undo and redo

```ts
editor.history.undo()
editor.history.redo()
editor.history.clear()
editor.history.getSize()    // { undo: 3, redo: 0 }
editor.history.subscribe(() => updateToolbarButtons())
```

<kbd>⌘Z</kbd>, <kbd>⇧⌘Z</kbd> and <kbd>Ctrl+Y</kbd> are bound on the container already.

### How it works

The stack holds **inverse patches**, not snapshots. Snapshots are easier to write, but their memory cost scales with document size, and an inverse patch is something the editor already knows how to apply — `applyPatch` consumes the same representation. So undo and external changes rest on one mechanism instead of two.

```ts
type Patch =
  | { op: 'create'; shape: AnyShape }
  | { op: 'update'; id: ShapeId; before: Partial<AnyShape>; after: Partial<AnyShape> }
  | { op: 'delete'; shape: AnyShape }
```

### What is not in the stack

**The viewport.** Undoing a pan is not what anyone means by undo.

**The selection** — but each entry records the selection before and after, and undo *restores* it. Without that, an undo changes something off-screen and the user has no idea what happened.

### Granularity

One transaction is one entry:

```ts
editor.transact(() => {
  editor.updateShape(a, { x: 10 })
  editor.updateShape(b, { x: 10 })
}) // one undo step
```

A drag is one entry however many frames it took, because the frames are [ephemeral](/guide/concepts#ephemeral-state) and only the commit is recorded.

Consecutive commits sharing a `mergeKey` fold into one, within a time window (1000ms by default):

```ts
// Dragging a slider in your own inspector panel
editor.transact(
  () => editor.updateShape(id, { props: { ...shape.props, cornerRadius: value } }),
  { mergeKey: `corner-radius:${id}` },
)
```

The built-ins use this already: holding an arrow key produces one entry rather than forty, and a resize is one entry per handle rather than one per frame. The time window is what keeps two deliberate presses a second apart separate — merging purely by key would join them forever.

`editor.history.mark()` forces a boundary regardless.

### Changes that should not be undoable

```ts
editor.transact(() => { /* ... */ }, { addToHistory: false })
```

Use it for changes the user did not make: state arriving from a collaborator, a value backfilled by a loader.

::: warning
Applying external patches while a history stack exists is not guaranteed correct in v1.0. `applyPatch` is provided for that future; the interaction between it and undo is not something to depend on yet.
:::

## Snapping

<Demo id="snapping" title="Object edges and centres take priority over the grid" />

```ts
editor.setSnapping({ enabled: true, grid: 20, toObjects: true, thresholdPx: 5 })
editor.snapping             // current settings, read-only
editor.getSnapGuides()      // the guides currently active
```

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `grid` | `null` | Grid size in world units, or `null` for none |
| `toObjects` | `true` | Snap to other shapes' edges and centres |
| `thresholdPx` | `5` | Pull distance, in **screen** pixels |

The threshold is in screen pixels so it feels the same at any zoom — a fixed world threshold would become unusable when zoomed out.

Holding <kbd>Alt</kbd> during a drag suspends snapping.

### Two decisions worth knowing

**Object snapping beats the grid.** Something the user aligned by eye should not be yanked onto a grid line one pixel away; that destroys the alignment they were making.

**The selection snaps as one box.** Snapping each shape in a multi-selection independently would change the spacing inside the selection. The bounding box is snapped instead and the resulting offset is applied to everything uniformly.

### Guides

```ts
interface SnapGuide {
  axis: 'x' | 'y'
  position: number   // world coordinate of the line
  start: number      // extent along the other axis
  end: number
}
```

All pairs matching the winning offset are returned, not just the first. Two same-sized boxes can align left, centre and right simultaneously, and showing one line would understate what actually happened.

The default UI draws these as `.hc-guide` elements. If you build your own controls, read `getSnapGuides()` in your `onFrame` callback.

### From your own tool

```ts
const result = editor.computeSnap(proposedBounds, new Set(movingIds))
// { dx, dy, guides }
```

Exclude the shapes being moved — otherwise they snap to themselves.

## Clipboard

```ts
import { createClipboardBinding } from '@headless-canvas/ui'

const clipboard = createClipboardBinding(editor)
clipboard.dispose()
```

Copy, cut, paste and image drag-and-drop. It lives in `ui` rather than `core` because reading the system clipboard can raise a permission prompt, and when that prompt appears is an application decision, not a library one.

The core provides the primitives it is built on, if you want different behaviour:

```ts
const doc = editor.getSelectionAsDocument()
const ids = editor.insertDocument(doc, { x: 24, y: 24 })
```

Pasted images are stored as data URLs. They are same-origin as a result, so they do not taint the canvas and [export keeps working](/guide/documents#cors-and-tainted-canvases).
