# Building your own controls

Level 3: skip the default UI entirely and write the markup yourself. What you do **not** write is any of the interaction logic — pointer capture, keyboard operation and ARIA attributes come from the core, so hand-built controls behave identically to the stock ones.

<Demo id="custom-controls" title="Hand-written controls, no framework" />

## The two primitives

```ts
editor.controls.getSelectionBox(): SelectionBoxDescriptor | null
editor.controls.bindHandle(element: HTMLElement, handle: HandleId): () => void
```

`getSelectionBox()` tells you what should be drawn right now. `bindHandle()` turns an element you already have into a working handle and returns a function that detaches it.

Neither creates DOM. That is the point: the library decides *what*, you decide *what it looks like*.

```ts
interface SelectionBoxDescriptor {
  bounds: OrientedBounds      // world space; rotated when one shape is selected
  isSingle: boolean
  hasLocked: boolean
  handles: readonly HandleDescriptor[]
}

interface HandleDescriptor {
  id: HandleId                // 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'
  position: Vec               // 0..1 within the box, so percentages work directly
  cursor: string
  label: string               // already resolved through the message table
}
```

`getSelectionBox()` returns `null` when nothing is selected — which is also why there is no control DOM in that case at all.

## A complete implementation

```ts
import type { Editor, HandleId } from '@headless-canvas/core'

export function createControls(editor: Editor): { dispose(): void } {
  const doc = editor.overlayElement.ownerDocument

  const box = doc.createElement('div')
  box.className = 'my-selection'
  box.hidden = true
  editor.overlayElement.append(box)

  const handles = new Map<HandleId, HTMLElement>()
  const unbind: Array<() => void> = []

  const stop = editor.onFrame(() => {
    const descriptor = editor.controls.getSelectionBox()
    if (!descriptor) {
      box.hidden = true
      return
    }

    const { bounds } = descriptor
    box.hidden = false
    box.style.width = `${bounds.width}px`
    box.style.height = `${bounds.height}px`
    // translate to the world position, then rotate about the box's own centre
    box.style.transform =
      `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`

    const wanted = new Set(descriptor.handles.map((h) => h.id))
    for (const handle of descriptor.handles) {
      let element = handles.get(handle.id)
      if (!element) {
        element = doc.createElement('button')
        element.className = 'my-handle'
        element.style.cursor = handle.cursor
        unbind.push(editor.controls.bindHandle(element, handle.id))
        handles.set(handle.id, element)
        box.append(element)
      }
      element.hidden = false
      element.style.left = `${handle.position.x * 100}%`
      element.style.top = `${handle.position.y * 100}%`
    }
    for (const [id, element] of handles) {
      if (!wanted.has(id)) element.hidden = true
    }
  })

  return {
    dispose() {
      stop()
      for (const off of unbind) off()
      box.remove()
      handles.clear()
    },
  }
}
```

Four things in there are worth calling out.

**Elements go inside `editor.overlayElement`** and are positioned in **world coordinates**. The overlay carries the viewport transform, so you never convert to screen space and never touch these elements when the camera moves.

**Handles are created once and reused.** Recreating them each frame would churn the DOM and lose focus mid-interaction. Hide what is not wanted rather than removing it.

**`onFrame` is the render hook.** It runs when the editor renders — committed changes, ephemeral changes, camera moves — and not otherwise. An idle editor draws nothing.

**Everything is undone in `dispose`.** Each `bindHandle` returns its own detach function; keep them.

## What `bindHandle` gives you

```ts
const unbind = editor.controls.bindHandle(element, 'se')
```

- `pointerdown` starts a resize or rotation, with pointer capture, and stops the event from also reaching the canvas surface
- Arrow keys operate the handle from the keyboard — 1 unit, or 10 with <kbd>⇧</kbd>
- `role="button"`, `aria-label` from the message table, `tabindex="0"` if the element has none
- `pointer-events: auto` and `touch-action: none` on the element

That last one matters. The overlay is `pointer-events: none` by default and handles opt back in individually, which is what lets the browser decide ownership: on a handle, the handle wins; anywhere else, the canvas does. No hit testing in JavaScript to arbitrate.

Because handles are real elements, they can be anything — a `<button>` with a label, an icon, a shape of your own. Use a `<button>` unless you have a reason not to; you get keyboard focus and the correct role for free.

## Counter-scaling is your job now

Everything in [Counter-scaling](/guide/styling#counter-scaling) applies. Any length inside the overlay must be divided by `--hc-zoom`, including font sizes:

```css
.my-handle {
  position: absolute;
  width: calc(14px / var(--hc-zoom));
  height: calc(14px / var(--hc-zoom));
  margin-left: calc(-7px / var(--hc-zoom));
  margin-top: calc(-7px / var(--hc-zoom));
  border: calc(2px / var(--hc-zoom)) solid #7c3aed;
}

.my-selection-label {
  font-size: calc(11px / var(--hc-zoom));
}
```

## Things only Level 3 can do

A floating toolbar attached to the selection is the common one, and it is only possible because the controls are DOM — a canvas cannot hold a button.

```ts
const toolbar = doc.createElement('div')
toolbar.style.pointerEvents = 'auto'
// Stop the press from starting a drag on the shape underneath.
toolbar.addEventListener('pointerdown', (event) => event.stopPropagation())
box.append(toolbar)
```

Position it relative to the box with `inset-block-start: 100%`, and remember the counter-scaling.

Other things this opens up: dimension readouts, per-handle labels, snapping indicators of your own design, context-sensitive handles that appear only for certain shape types, and hit areas larger than the visible handle.

## Other overlay content

The default UI also draws the marquee rectangle and the alignment guides. If you replace it, those are yours too:

```ts
editor.getBrush()       // Bounds | null — the marquee, in world space
editor.getSnapGuides()  // readonly SnapGuide[] — the guides currently active
```

## In React

The same primitives, wrapped as a hook. See [React](/guide/react#level-3).

```tsx
const { descriptor, getHandleProps } = useSelectionBox()
```

There is one implementation of the interaction logic, and the stock UI, the React bindings and the code on this page all drive it. That is the reason it lives in `core` rather than in `ui`.
