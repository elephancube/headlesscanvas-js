# HeadlessCanvas

**A canvas editor engine for building design tools, whiteboards, diagram editors, floor planners and image annotation UIs — where the selection handles are real DOM elements you style with CSS.**

[Documentation and live demos](https://elephancube.github.io/headlesscanvas-js/) · [日本語版 README](./README.ja.md)

> **Status: pre-alpha.** Working towards v1.0; see [Roadmap](#roadmap). The API is settled but not yet published to npm.

Shapes are rendered to `<canvas>` for speed. Selection boxes, resize handles and rotation UI are rendered as **DOM elements overlaid on top**, so you restyle them with plain CSS — or replace them entirely with your own markup.

```
┌─────────────────────────────────────┐
│  DOM overlay  — selection, handles  │  ← your CSS, your markup, keyboard accessible
├─────────────────────────────────────┤
│  Canvas       — shapes, images      │  ← fast rendering, no UI drawn here
└─────────────────────────────────────┘
```

## Why another canvas library?

| | Rendering | Controls UI | Styleable with CSS | Screen-reader accessible | License |
|---|---|---|---|---|---|
| **HeadlessCanvas** | Canvas | **DOM** | **Yes** | **Yes** | **MIT** |
| Konva.js | Canvas | Canvas | No | No | MIT |
| Fabric.js | Canvas | Canvas | No | No | MIT |
| tldraw | DOM/SVG | DOM | Yes | Partial | Not open source — watermark required, paid commercial license |
| Excalidraw | Canvas | DOM | It is an app, not a reusable library | — | MIT |

Drawing controls *into* the canvas — what Konva and Fabric do — has two consequences that cannot be worked around: you cannot restyle them with CSS, and assistive technology cannot see them at all. Putting the controls in the DOM fixes both at once.

tldraw shares this architecture but is not open source: production use requires a license key, the "Made with tldraw" watermark must be preserved unless you buy a commercial license, and every downstream user of your project needs their own license. HeadlessCanvas is MIT with no watermark, no license key, and no fees.

## Design principles

1. **The canvas never draws UI.** Selection boxes and handles are DOM. This is the whole point of the library.
2. **DOM node count stays bounded.** Only selected objects get control UI — 10,000 shapes still means a handful of DOM nodes.
3. **One transform write per frame.** The overlay container receives the viewport transform; children are positioned in world coordinates. Panning and zooming cost the same whether you have 10 shapes or 10,000.
4. **Framework-agnostic.** The core and the default UI are plain TypeScript. React is a thin adapter, not a requirement.

## Packages

| Package | Contents |
|---|---|
| `@headless-canvas/core` | Scene graph, renderer, state, transforms, tools, shape registry, headless control primitives. Zero runtime dependencies. |
| `@headless-canvas/ui` | Default control UI and stylesheet. Imperative DOM — usable from any framework or none. |
| `@headless-canvas/react` | React bindings over `core` and `ui`. |

## Three levels of customization

**Level 1 — use the defaults.**

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
createDefaultControls(editor)
```

**Level 2 — restyle with CSS.** State lives in data attributes, so you target it directly:

```css
.hc-handle { border-radius: 50%; }
.hc-handle[data-hc-handle='rotate'] { background: tomato; }
.hc-container[data-hc-tool='hand'] { cursor: grab; }
:root { --hc-accent: rebeccapurple; --hc-handle-size: 12px; }
```

**Level 3 — bring your own markup.** Skip the default UI and bind your own elements:

```ts
const box = editor.controls.getSelectionBox()
for (const handle of box.handles) {
  const el = myOwnHandleElement(handle)
  editor.controls.bindHandle(el, handle.id) // pointer capture, keyboard and ARIA included
}
```

The same primitives back the React bindings, so Level 3 works identically in both.

## Custom shapes

Shape types are registered, not hard-coded — the built-in shapes use exactly the same mechanism:

```ts
const wallUtil: ShapeUtil<WallShape> = {
  type: 'wall',
  getDefaultProps: () => ({ thickness: 8 }),
  render(shape, ctx) { /* draw with the 2D context */ },
  hitTest(shape, point, tolerance) { /* ... */ },
}
```

Declare the type once and `createShape` / `getShape` infer its props:

```ts
declare module '@headless-canvas/core' {
  interface ShapeRegistry { wall: WallShape }
}
```

## Roadmap

| Phase | Contents | Status |
|---|---|---|
| 1 | Core math, state, shape registry, renderer, control primitives | Done |
| 2 | All basic shapes, viewport, hit testing, serialization, PNG export | Done |
| 3 | Default UI, React adapter, tool registry, accessibility, i18n | Done |
| 4 | Undo/redo, snapping, clipboard, text editing, freehand drawing, SVG export, documentation site → v1.0 | In progress |

Deliberately **out of scope**: feature parity with Fabric.js, a rich-text editing engine, image filters, and application chrome such as toolbars and colour pickers. HeadlessCanvas is an engine, not an app.

## License

MIT © elephancube
