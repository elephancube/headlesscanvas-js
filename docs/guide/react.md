# React

`@headless-canvas/react` is a thin adapter. Everything it does is call the same core APIs a vanilla application would, from the right lifecycle hooks — there is no React-only behaviour, and nothing is unavailable outside it.

```sh
npm install @headless-canvas/core @headless-canvas/ui @headless-canvas/react
```

## Level 1

```tsx
import { HcCanvas, HcDefaultControls, HcTextEditor } from '@headless-canvas/react'
import '@headless-canvas/ui/styles.css'

export function Editor() {
  return (
    <div style={{ height: 480 }}>
      <HcCanvas onMount={(editor) => seed(editor)}>
        <HcDefaultControls />
        <HcTextEditor />
      </HcCanvas>
    </div>
  )
}
```

`<HcCanvas>` renders a container and constructs the editor in a layout effect. Nothing is constructed during render, so it is safe in a server bundle: the server emits the container, the overlay is empty, and there is no hydration mismatch to reconcile. It disposes the editor on unmount.

Its props are `EditorOptions` minus `container`, plus `className`, `style`, `children` and `onMount`.

## Reading state

```tsx
import { useEditor, useSelectedIds, useShape, useValue, useZoom } from '@headless-canvas/react'

function Inspector() {
  const editor = useEditor()
  const selected = useSelectedIds()
  const shape = useShape(selected[0])
  const zoom = useZoom()

  const count = useValue(useCallback((snapshot) => snapshot.shapes.size, []))

  return <p>{count} shapes, {selected.length} selected, {Math.round(zoom * 100)}%</p>
}
```

These are built on `useSyncExternalStore`, so concurrent rendering and `StrictMode` are handled properly. `useValue` subscribes to both committed and ephemeral changes, which is what makes an inspector track a shape live during a drag.

::: tip Memoise the selector
`useValue` caches against the editor's render version *and the selector identity*. An inline arrow is a new function every render, which defeats the cache. Wrap it in `useCallback`, or hoist it out of the component.
:::

`useEditor()` must be called inside `<HcCanvas>`; it throws otherwise, which is more useful than returning null and failing later.

## Writing state

The editor is not a React store — call its methods directly:

```tsx
function Toolbar() {
  const editor = useEditor()
  return (
    <>
      <button onClick={() => editor.createShape({ type: 'rect', x: 0, y: 0, width: 100, height: 60 })}>
        Rectangle
      </button>
      <button onClick={() => editor.history.undo()}>Undo</button>
    </>
  )
}
```

Multi-step changes still belong in a transaction, exactly as they would elsewhere:

```tsx
editor.transact(() => {
  for (const item of items) editor.createShape(toShape(item))
})
```

## Level 3

```tsx
import { useSelectionBox, useZoom } from '@headless-canvas/react'
import { createPortal } from 'react-dom'

function CustomControls() {
  const editor = useEditor()
  const { descriptor, getHandleProps } = useSelectionBox()
  const zoom = useZoom()
  if (!descriptor) return null

  const { bounds } = descriptor
  return createPortal(
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: bounds.width,
        height: bounds.height,
        transform: `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`,
        border: `${2 / zoom}px dashed #7c3aed`,
        boxSizing: 'border-box',
      }}
    >
      {descriptor.handles.map((handle) => {
        const { style, ...props } = getHandleProps(handle)
        return (
          <div
            key={handle.id}
            {...props}
            style={{ ...style, width: 14 / zoom, height: 14 / zoom, background: '#fff' }}
          />
        )
      })}
    </div>,
    editor.overlayElement,
  )
}
```

Two things are load-bearing here.

**The portal target is `editor.overlayElement`.** That is the element carrying the viewport transform, so children positioned in world coordinates stay pinned to their shapes for one style write per frame. Rendering the controls anywhere else means recomputing screen positions yourself on every camera change.

**`getHandleProps` returns a `ref`, not event handlers.** The ref calls `controls.bindHandle`, which is the same primitive the vanilla implementation uses — so there is one copy of the pointer, keyboard and ARIA logic rather than a React one and a DOM one that drift. It also keeps React's synthetic event types out of the core's public surface.

```ts
getHandleProps(handle) // { ref, 'data-hc-handle', style }
```

Note the divisions by `zoom` in the styles above. The [counter-scaling rule](/guide/styling#counter-scaling) applies to inline styles exactly as it does to CSS; `useZoom()` is how you get the number.

## Custom shapes

Register them where you construct the editor:

```tsx
<HcCanvas shapeUtils={[...defaultShapeUtils, starShapeUtil]} />
```

`shapeUtils` is captured on mount. Changing it later does not re-register — remount the component if the set genuinely needs to change.

## Server-side rendering

`@headless-canvas/core` touches no browser API at import time, so it is safe in a server bundle, and `<HcCanvas>` constructs nothing during render. The stylesheet is a static import rather than runtime-injected CSS, so there is no flash of unstyled controls during hydration.

```tsx
import '@headless-canvas/ui/styles.css'
```

Under Next.js this belongs in a client component, since the editor needs the DOM to do anything.

## API summary

| Export | Purpose |
|---|---|
| `<HcCanvas>` | Mounts an editor, provides it through context |
| `<HcDefaultControls>` | The stock controls |
| `<HcTextEditor>` | The stock text editing dialog |
| `useEditor()` | The instance |
| `useValue(selector)` | Any derived value, subscribed |
| `useSelectedIds()` | Current selection |
| `useShape(id)` | One shape, ephemeral changes applied |
| `useZoom()` | Camera zoom |
| `useSelectionBox()` | Level 3: descriptor plus `getHandleProps` |
| `useEditingSession()` | The open editing session, for a surface of your own |

Full signatures are in the [React API reference](/api/react).
