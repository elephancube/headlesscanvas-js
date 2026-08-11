# Controls

```ts
editor.controls
```

The headless half of the control UI. Nothing here creates or owns DOM: it reports what should be drawn, and turns elements you already have into working handles.

This lives in `core` rather than in `ui` on purpose. The default UI is not React-specific, so if the interaction logic lived alongside it, the React bindings and anyone writing their own controls would each need their own copy — three implementations to keep in agreement. There is one.

## `getSelectionBox()`

```ts
getSelectionBox(): SelectionBoxDescriptor | null
```

What the selection UI should look like right now, or `null` when nothing is selected — which is also why no control DOM exists in that case.

```ts
interface SelectionBoxDescriptor {
  bounds: OrientedBounds       // world space
  isSingle: boolean
  hasLocked: boolean
  handles: readonly HandleDescriptor[]
}

interface HandleDescriptor {
  id: HandleId                 // 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'
  position: Vec                // 0..1 within the box — percentages work directly
  cursor: string
  label: string                // already resolved through the message table
}
```

`bounds.rotation` follows the shape when one is selected and is `0` for a multi-selection.

`handles` is **empty** when the selection contains a locked shape. The rotate handle is omitted when a single selected shape's util declares `canRotate: false`.

## `bindHandle()`

```ts
bindHandle(element: HTMLElement, handle: HandleId): () => void
```

Makes `element` behave as that handle. Returns a function that detaches everything — keep it and call it on teardown.

It sets:

- `role="button"`, `aria-label` from the message table, `data-hc-handle`, and `tabindex="0"` if the element has none
- `pointer-events: auto` and `touch-action: none` inline

And attaches:

- `pointerdown` — captures the pointer, stops the event reaching the canvas surface, and routes the interaction to the current tool via `onHandlePointerDown`
- `keydown` — arrow keys operate the handle, 1 unit or 10 with <kbd>⇧</kbd>, via `onHandleNudge`

The overlay is `pointer-events: none` and handles opt back in individually. That is what lets the browser arbitrate ownership: on a handle, the handle wins; anywhere else, the canvas does. No JavaScript hit testing decides it.

## Accessibility descriptors

```ts
getA11yShapeDescriptors(): A11yShapeDescriptor[]
getA11ySummary(): { total: number; visible: number }
```

```ts
interface A11yShapeDescriptor {
  id: ShapeId
  label: string      // from ShapeUtil.getAccessibleLabel, or the type name
  selected: boolean
  locked: boolean
}
```

Descriptors cover the **viewport only**. Emitting one per shape would put five thousand nodes in the DOM and give up the bounded node count the architecture depends on. Report the summary alongside the list so the total is not hidden.

## Constants

```ts
const RESIZE_HANDLES: readonly HandleId[]
// ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
```

Handle positions and cursors:

| Handle | `position` | Cursor |
|---|---|---|
| `nw` | `{ x: 0, y: 0 }` | `nwse-resize` |
| `n` | `{ x: 0.5, y: 0 }` | `ns-resize` |
| `ne` | `{ x: 1, y: 0 }` | `nesw-resize` |
| `e` | `{ x: 1, y: 0.5 }` | `ew-resize` |
| `se` | `{ x: 1, y: 1 }` | `nwse-resize` |
| `s` | `{ x: 0.5, y: 1 }` | `ns-resize` |
| `sw` | `{ x: 0, y: 1 }` | `nesw-resize` |
| `w` | `{ x: 0, y: 0.5 }` | `ew-resize` |
| `rotate` | `{ x: 0.5, y: 0 }` | `grab` |

`rotate` shares its position with `n`; the stylesheet lifts it clear using `--hc-rotate-distance`.

## Usage

See [Building your own controls](/guide/custom-controls) for a complete implementation, and [React](/guide/react#level-3) for the hook that wraps these.
