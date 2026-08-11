# Getting started

## Install

::: code-group

```sh [npm]
npm install @headless-canvas/core @headless-canvas/ui
```

```sh [pnpm]
pnpm add @headless-canvas/core @headless-canvas/ui
```

```sh [yarn]
yarn add @headless-canvas/core @headless-canvas/ui
```

:::

For React, add `@headless-canvas/react` and see the [React guide](/guide/react).

## Mount an editor

The editor builds its canvas and overlay inside a container element you provide. That element needs a size — the editor observes it and resizes the canvas to match, but it will not invent dimensions for you.

```html
<div id="app" style="width: 100%; height: 480px"></div>
```

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
const controls = createDefaultControls(editor)
```

The stylesheet is a separate file you import yourself. Nothing is injected into the document at runtime: that would produce a flash of unstyled controls during SSR hydration, break under a strict Content Security Policy, and leave dead CSS in the bundle for anyone who replaces the default UI entirely.

## Add some shapes

```ts
editor.createShape({
  type: 'rect',
  x: 40,
  y: 40,
  width: 180,
  height: 120,
  props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 8 },
})

editor.createShape({
  type: 'text',
  x: 40,
  y: 190,
  width: 300,
  height: 60,
  props: { text: 'Drag me', fontSize: 24 },
})
```

Anything not supplied falls back to the shape type's defaults, so `{ type: 'rect', x, y, width, height }` on its own is valid.

When you create several shapes as one user action, wrap them so they commit together — one notification to subscribers and one entry in the undo stack instead of five:

```ts
editor.transact(() => {
  for (const row of data) {
    editor.createShape({ type: 'rect', x: row.x, y: row.y, width: 40, height: 40 })
  }
})
```

## What you get for free

Once `createDefaultControls` is mounted:

| Input | Result |
|---|---|
| Click | Select. <kbd>⇧</kbd>-click adds to the selection |
| Drag a shape | Move it, snapping to the grid and to other shapes. <kbd>Alt</kbd> suspends snapping |
| Drag empty space | Marquee selection |
| Drag a handle | Resize, or rotate from the handle above the box. <kbd>⇧</kbd> preserves the aspect ratio while resizing and snaps rotation to 15° |
| Middle or right drag | Pan, whatever the current tool |
| Wheel | Pan. <kbd>Ctrl</kbd> or <kbd>⌘</kbd> plus wheel zooms about the pointer |
| Double-click | Edit a text shape. <kbd>Enter</kbd> or <kbd>F2</kbd> does the same for a selected one |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> | Select tool / hand tool / draw tool |
| Arrow keys | Nudge the selection by 1, or by 10 with <kbd>⇧</kbd> |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection |
| <kbd>⌘A</kbd> / <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> | Select all, group, ungroup |
| <kbd>⌘Z</kbd> | Undo. <kbd>⇧⌘Z</kbd> or <kbd>Ctrl+Y</kbd> redoes |
| <kbd>Escape</kbd> | Cancel the interaction in progress, leaving no partial state |
| <kbd>Tab</kbd> | Walk the shapes in view, then the handles, as focusable buttons |
| Arrow keys on a focused handle | Resize or rotate by keyboard |

Every keyboard handler is attached to **the container, not `window`**. An editor that does not have focus never consumes a key, which is what makes two editors on one page behave sensibly — and what stops an editor from stealing <kbd>⌘Z</kbd> from a text field elsewhere on the page.

The same operations are available as methods, for toolbar buttons of your own:

```ts
editor.history.undo()
editor.history.redo()
editor.history.getSize() // { undo: 3, redo: 0 } — for disabling buttons
```

Copy, cut, paste and image drag-and-drop are one call, kept out of the core because reading the system clipboard can raise a permission prompt and the application should decide when that happens:

```ts
import { createClipboardBinding } from '@headless-canvas/ui'

createClipboardBinding(editor)
```

Text editing is one call as well — see [Editing text](/guide/text-editing):

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)
```

## Clean up

```ts
controls.dispose()
editor.dispose()
```

Both are required in a single-page application. `editor.dispose()` stops the render loop, disconnects the resize observer, releases cached images and removes the elements it created. Nothing is stored at module level, so several editors can live on one page without interfering.

## Handle recoverable problems

An image that fails to load, a document containing a shape type you have not registered, a failed export — none of these should stop the editor, so they are reported rather than thrown:

```ts
editor.subscribeNotifications((notification) => {
  console.warn(notification.code, notification.message)
})
```

Programming errors — an unregistered tool id, a disposed editor — still throw. The distinction is deliberate: one class of problem is a bug in your code, the other is the world being unreliable.

## Server-side rendering

The modules touch no browser API at import time, so they are safe to include in a server bundle. Construct the `Editor` in an effect or after mount, never during render. The React `<HcCanvas>` component already does this.

<Demo id="basics" title="The result" />

## Next

- [Concepts](/guide/concepts) — coordinates, transactions, the invariants
- [Shapes](/guide/shapes) — what ships and how to manipulate it
- [Styling the controls](/guide/styling) — the CSS contract
