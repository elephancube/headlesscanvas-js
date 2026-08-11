# Editor

```ts
import { Editor } from '@headless-canvas/core'

const editor = new Editor({ container })
```

The editor owns a canvas for the shapes and a DOM overlay for the controls, and keeps them in step. There is no module-level state anywhere, so several editors can coexist on one page.

## Construction

```ts
interface EditorOptions {
  container: HTMLElement            // the editor builds its canvas and overlay inside this
  shapeUtils?: readonly ShapeUtil<any>[]   // replaces the default set
  initialDocument?: HcDocument
  messages?: Partial<Messages>
  zoomRange?: readonly [number, number]    // defaults to [0.02, 64]
  hitTolerance?: number                    // click slop in screen pixels, default 5
  history?: HistoryOptions
  snapping?: Partial<SnapSettings>
}
```

The container is given `position: relative` if it is static, `overflow: hidden`, `touch-action: none`, `tabindex="0"` if it has none, `role="application"` and the `hc-container` class. It must have a size of its own; the editor observes it and resizes the canvas to match.

## Elements

```ts
editor.container       // HTMLElement — what you passed in
editor.canvasElement   // HTMLCanvasElement — aria-hidden
editor.overlayElement  // HTMLElement — carries the viewport transform
```

Put your own control DOM inside `overlayElement`, in **world coordinates**. It is the only element the camera transform is written to, which is what makes panning cost the same at any control count.

## Sub-objects

```ts
editor.registry     // ShapeUtilRegistry
editor.controls     // Controls — see /api/controls
editor.resources    // ResourceCache
editor.history      // History
editor.selection    // selection API, below
editor.viewport     // camera API, below
editor.tools        // tool registry, below
```

## Lifecycle

### `dispose()`

Stops the render loop, disconnects the resize observer, releases cached resources and removes the elements it created. Calling any method afterwards throws. Required in a single-page application.

## State

### `getSnapshot(): StoreSnapshot`

```ts
interface StoreSnapshot {
  readonly version: number
  readonly shapes: ReadonlyMap<ShapeId, AnyShape>
  readonly rootChildren: readonly ShapeId[]   // paint order
  readonly paintOrder: readonly ShapeId[]     // everything, depth-first
  readonly selectedIds: readonly ShapeId[]
}
```

Immutable with structural sharing. Never shows an intermediate state from inside a transaction.

### `getRenderVersion(): number`

A cache key covering committed changes, ephemeral changes and the camera. Compare it to skip work when nothing has moved.

### `subscribe(listener): () => void`

Committed state changed. Never called from inside a transaction.

### `subscribeEphemeral(listener): () => void`

An in-flight interaction changed.

### `subscribeNotifications(listener: (n: Notification) => void): () => void`

Recoverable problems:

```ts
interface Notification {
  level: 'warning' | 'error'
  code: 'resource-load-failed' | 'unknown-shape-type' | 'export-failed' | 'schema-migration-failed'
  message: string
  detail?: unknown
}
```

### `transact<T>(fn: () => T, options?: TransactOptions): T`

One user action, one commit: subscribers are notified once and the history gets one entry. Reads inside see writes made earlier in the same transaction.

```ts
interface TransactOptions {
  addToHistory?: boolean   // false for changes the user did not make
  mergeKey?: string        // consecutive transactions sharing a key collapse
}
```

### `notify(notification: Notification): void`

Push onto the notification channel yourself — useful from a custom shape or tool.

## Shapes

### `createShape<K>(input: CreateShapeInput<K>): ShapeId`

```ts
type CreateShapeInput<K> = Partial<Omit<ShapeRegistry[K], 'id' | 'type' | 'props' | 'index'>> & {
  type: K
  props?: Partial<ShapeRegistry[K]['props']>
}
```

Anything omitted comes from the type's defaults. `props` is merged with them.

### `getShape<K>(id): ShapeRegistry[K] | undefined`

The **committed** record. Reads back writes made earlier in the same transaction.

### `getResolvedShape(id): AnyShape | undefined`

The shape with ephemeral changes applied — what is on screen right now.

### `updateShape(id, changes: Partial<AnyShape>): void`

`props` is replaced wholesale when supplied, so spread the existing value to change one field.

### `deleteShapes(ids: readonly ShapeId[]): void`

Descendants go with their parents.

### `applyPatch(patches: readonly Patch[], options?: TransactOptions): void`

Apply changes from outside — the same representation the history uses.

::: warning
History correctness under externally applied patches is not guaranteed in v1.0.
:::

## Ephemeral state

```ts
setEphemeral(changes: ReadonlyMap<ShapeId, Partial<AnyShape>>): void
commitEphemeral(options?: TransactOptions): void
clearEphemeral(): void
```

Write these during a drag and commit once at the end. See [Ephemeral state](/guide/concepts#ephemeral-state).

## Hierarchy and order

```ts
getChildren(parentId: ShapeId | null): ShapeId[]     // paint order
getAncestors(id: ShapeId): ShapeId[]                 // nearest first

setParent(ids, parentId: ShapeId | null, at?: ZIndexAnchor): void  // world appearance preserved
moveTo(ids, anchor: ZIndexAnchor): void
reorder(ids, to: 'front' | 'back' | 'forward' | 'backward'): void

group(ids): ShapeId | null       // the new group, or null if fewer than two
ungroup(groupId): ShapeId[]      // the freed children
```

```ts
type ZIndexAnchor =
  | { before: ShapeId }
  | { after: ShapeId }
  | { position: 'first' | 'last' }
```

Neither grouping nor ungrouping bakes the transform into the children.

## Geometry

```ts
getWorldTransform(id): Matrix | null
getShapeBounds(id, space?: 'world' | 'screen'): OrientedBounds | null
hitTest(screenPoint: Vec): ShapeId | null      // topmost; returns the outermost group
hitTestArea(screenBounds: Bounds): ShapeId[]   // skips locked shapes
getVisibleShapeIds(): ShapeId[]
```

`hitTest` returns the outermost enclosing group when it hits a grouped child, which is what users expect from a grouped object.

## Selection

```ts
editor.selection.ids                  // readonly ShapeId[]
editor.selection.set(ids)
editor.selection.add(ids)
editor.selection.remove(ids)
editor.selection.clear()
editor.selection.selectAll()
editor.selection.getBounds()          // OrientedBounds | null
```

A single selection reports the shape's rotated box; a multi-selection reports an axis-aligned one.

## Viewport

```ts
editor.viewport.camera                             // { x, y, z }
editor.viewport.setCamera(next: Partial<Camera>)
editor.viewport.panBy(delta: Vec)                  // screen pixels
editor.viewport.zoomTo(z, centerInScreen?: Vec)    // keeps that point fixed
editor.viewport.zoomToFit(ids?, padding = 40)
editor.viewport.screenToWorld(p: Vec): Vec
editor.viewport.worldToScreen(p: Vec): Vec
editor.viewport.getVisibleBounds(): Bounds
```

Zoom is clamped to `zoomRange`. The viewport is not part of the history.

## Tools

```ts
editor.tools.register(id: string, factory: (editor: Editor) => Tool): void
editor.tools.setCurrent(id: string): void      // throws on an unregistered id
editor.tools.current                           // string
editor.tools.instance                          // Tool | null
editor.tools.state                             // ToolState
editor.tools.setState(state: ToolState): void  // drives data-hc-state
editor.tools.cancel(): void

editor.getBrush(): Bounds | null               // from the active tool
editor.interactionState                        // alias of tools.state
```

`select`, `hand` and `draw` are registered by default, on <kbd>v</kbd>, <kbd>h</kbd> and <kbd>d</kbd>. Registering an id that already exists replaces it — **including the live instance if that tool is active**, which is how a tool is reconfigured:

```ts
import { DrawTool } from '@headless-canvas/core'
editor.tools.register('draw', (e) => new DrawTool(e, { color: '#f00', width: 8 }))
```

See [Tools](/guide/tools#drawing-freehand) for `DrawToolOptions` and how a stroke is fitted.

## Text editing

```ts
editor.editing.id                          // ShapeId | null
editor.editing.initialText                 // string | null
editor.editing.canEdit(id): boolean        // false for locked, or no text
editor.editing.begin(id): boolean
editor.editing.commit(text: string): void  // one history entry; no-ops if unchanged
editor.editing.cancel(): void
editor.editing.subscribe(fn): () => void
```

A shape is editable exactly when its `ShapeUtil` implements both `getText` and `setText`. `begin` also selects the shape and sets `data-hc-state` to `editing`.

`subscribe` is a separate channel because a session is not a document change — the store does not move, so `editor.subscribe` never fires for one. See [Editing text](/guide/text-editing).

## Snapping

```ts
editor.snapping                                  // Readonly<SnapSettings>
editor.setSnapping(settings: Partial<SnapSettings>): void
editor.getSnapGuides(): readonly SnapGuide[]
editor.computeSnap(proposed: Bounds, exclude: ReadonlySet<ShapeId>): SnapResult
editor.clearSnapGuides(): void
```

## Input helpers

```ts
editor.beginHandleInteraction(handle: HandleId, event: PointerEvent): void
editor.nudgeHandle(handle: HandleId, delta: Vec): void
editor.nudgeSelection(delta: Vec): void
```

`bindHandle` calls the first two for you. Use them directly only if you are binding handles by hand.

## Documents and export

```ts
editor.toJSON(meta?: Record<string, unknown>, options?: SerializeOptions): HcDocument
editor.loadDocument(document: HcDocument): void      // clears the history
editor.getSelectionAsDocument(): HcDocument
editor.insertDocument(document: HcDocument, at?: Vec): ShapeId[]

editor.export(options?: ExportOptions): Promise<Blob>       // png, jpeg
editor.exportSvg(options?: SvgExportOptions): string        // synchronous; no pixels to encode
```

`export` rejects with `HcTaintedCanvasError` when cross-origin images have tainted the canvas; the error names them.

`exportSvg` builds the document from each shape's `getPath` or `toSvg`; a shape that implements neither is left out and reported as `export-failed`. Both throw when there is nothing to export.

`toJSON`'s `{ embedImages: true }` inlines referenced images into `HcDocument.resources` so the document stands alone. The shapes are not rewritten — they keep naming the URL each image came from. Images a loaded document already carried are written back whether or not this save asked to embed. See [Documents and export](/guide/documents).

## Rendering

```ts
editor.onFrame(render: () => void): () => void
editor.getRenderStats(): { drawn: number; culled: number; indexed: number }
```

`onFrame` runs when the editor renders, and not otherwise — an idle editor draws nothing. It is how the default UI and any custom controls stay in step.

## Messages

```ts
editor.message(key: keyof Messages, params?: Record<string, string | number>): string
```

Resolves through the table supplied in `EditorOptions.messages`, falling back to English. See [Accessibility](/guide/accessibility#translating-the-strings).
