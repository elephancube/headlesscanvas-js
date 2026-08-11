# React bindings

```sh
npm install @headless-canvas/core @headless-canvas/ui @headless-canvas/react
```

A thin adapter over the core. Everything here calls the same APIs a vanilla application would, from the right lifecycle hooks. See the [React guide](/guide/react) for usage.

## `<HcCanvas>`

```tsx
interface HcCanvasProps extends Omit<EditorOptions, 'container'> {
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
  onMount?: (editor: Editor) => void
}
```

Renders a `<div>` and constructs an `Editor` inside it in a layout effect, providing it through context. Disposes on unmount.

Nothing is constructed during render, so it is safe on the server: the markup is just the container, the overlay is empty, and there is no hydration mismatch.

Editor options are captured on mount. Changing `shapeUtils` or `messages` afterwards has no effect — remount if they genuinely need to change.

The wrapper defaults to `width: 100%; height: 100%`, so give its parent a size.

## `<HcDefaultControls>`

```tsx
function HcDefaultControls(props?: { accessibleList?: boolean }): null
```

Mounts the stock controls for the surrounding editor and removes them on unmount. Renders nothing itself — the controls are imperative DOM inside the overlay.

## `<HcTextEditor>`

```tsx
function HcTextEditor(props?: { submitOnEnter?: boolean }): null
```

The stock text editing dialog. Opens on double-click, <kbd>Enter</kbd> or <kbd>F2</kbd>, and is independent of which controls are mounted. See [Editing text](/guide/text-editing).

## `useEditor()`

```tsx
function useEditor(): Editor
```

Throws if called outside `<HcCanvas>`.

## `useValue()`

```tsx
function useValue<T>(selector: (snapshot: StoreSnapshot) => T): T
```

Subscribes to committed **and** ephemeral changes, so a derived value tracks an in-progress drag.

Built on `useSyncExternalStore`, which compares snapshots by identity — a selector returning a freshly built object every call would loop forever. The result is therefore cached against the editor's render version *and the selector's identity*:

```tsx
// ✓ stable identity
const count = useValue(useCallback((s) => s.shapes.size, []))

// ✗ new function every render — the cache never hits
const count = useValue((s) => s.shapes.size)
```

## `useSelectedIds()`

```tsx
function useSelectedIds(): readonly ShapeId[]
```

## `useShape()`

```tsx
function useShape<K extends ShapeType = ShapeType>(id: ShapeId): ShapeRegistry[K] | undefined
```

Resolved: ephemeral changes are applied, so it follows a drag.

## `useZoom()`

```tsx
function useZoom(): number
```

The camera's `z`. Use it to divide inline styles inside the overlay — see [Counter-scaling](/guide/styling#counter-scaling).

## `useSelectionBox()`

```tsx
function useSelectionBox(): {
  descriptor: SelectionBoxDescriptor | null
  getHandleProps(handle: HandleDescriptor): {
    ref: (element: HTMLElement | null) => void
    'data-hc-handle': string
    style: React.CSSProperties
  }
}
```

Level 3. `descriptor` is `null` when nothing is selected.

`getHandleProps` returns a **ref**, not event handlers. The ref calls `controls.bindHandle`, so a hand-built React UI drives the same implementation as the stock UI and a vanilla one — and React's synthetic event types stay out of the core's public surface. Bindings are released when the ref detaches and when the component unmounts.

The returned `style` positions the handle within the box and sets its cursor; spread your own after it.

```tsx
const { style, ...props } = getHandleProps(handle)
return <div key={handle.id} {...props} style={{ ...style, width: 14 / zoom }} />
```

Render your controls into `editor.overlayElement` with `createPortal`. That is the element carrying the viewport transform, so world-coordinate children stay pinned to their shapes for one style write per frame.

## `useEditingSession()`

```tsx
function useEditingSession(): { id: ShapeId | null; initialText: string | null }
```

For building an editing surface of your own. `commit` and `cancel` come from `editor.editing` rather than this hook, so a hand-built surface ends a session exactly the way the stock dialog does.

It subscribes to `editor.editing.subscribe` rather than the store, because a session is not a document change and `editor.subscribe` never fires for one.

## Re-exports

```ts
export type { DefaultControlsOptions }
```

Everything else comes from `@headless-canvas/core` directly.
