# Introduction

HeadlessCanvas is an engine for building canvas editors: design tools, whiteboards, diagram editors, floor planners, image annotation UIs. It renders shapes to `<canvas>` and puts everything the user manipulates — selection boxes, resize handles, rotation UI — in the DOM on top.

## The problem it solves

Canvas libraries draw their selection handles into the canvas. Konva and Fabric both do. Two things follow from that, and no amount of application code can undo either:

- **The handles cannot be restyled.** They are pixels, not elements. A design system that specifies a 2px focus ring in the brand colour has nowhere to apply it.
- **Assistive technology cannot see them.** A canvas is one opaque node in the accessibility tree. There is no handle to focus, no button to activate, nothing to announce.

Moving the controls into the DOM fixes both at once, and it is the reason this library exists.

## The trade this makes

Putting UI in the DOM is not free. Done carelessly it means a DOM node per shape, and a layout pass on every frame of a pan. The library is built around four rules that keep that from happening:

1. **The canvas never draws UI.** Selection boxes and handles are DOM.
2. **Only the selection gets control UI.** Ten thousand shapes still means a handful of overlay nodes. A multi-selection draws one bounding box, not N boxes.
3. **One transform write per frame.** The overlay container carries the viewport transform; its children sit at world coordinates. Panning costs the same at 10 shapes as at 10,000.
4. **Handle sizes are corrected in CSS,** by dividing by the `--hc-zoom` variable — never by writing a size onto each element from JavaScript, which would give rule 3 away.

These are covered in [Concepts](/guide/concepts). They are worth reading before building anything non-trivial on top, because they explain why several APIs are shaped the way they are.

## What it is not

HeadlessCanvas is an engine, not an application. It deliberately ships **no toolbars, no colour pickers, no layer panels, no menus** — those are product decisions, and a library that makes them for you is a library you end up fighting.

Also out of scope for v1.0: feature parity with Fabric.js, a rich-text editing engine, image filters, server-side rendering of documents, and the notion of pages or artboards. SVG import is not included either; supporting the SVG specification is a project of comparable size to everything else here.

## How it compares

| | Rendering | Controls UI | Styleable with CSS | Screen-reader accessible | Licence |
|---|---|---|---|---|---|
| **HeadlessCanvas** | Canvas | **DOM** | **Yes** | **Yes** | **MIT** |
| Konva.js | Canvas | Canvas | No | No | MIT |
| Fabric.js | Canvas | Canvas | No | No | MIT |
| tldraw | DOM/SVG | DOM | Yes | Partial | Not open source |
| Excalidraw | Canvas | DOM | It is an app, not a reusable library | — | MIT |

tldraw is the closest architectural relative and the honest comparison to make. It is a mature product with a much larger feature set. It is also not open source: production use requires a licence key, the "Made with tldraw" watermark must be preserved unless you buy a commercial licence, and anyone who builds on your project needs their own licence. If that is compatible with what you are building, it is a strong choice. If it is not — if you are shipping a library, an internal tool with no budget line, or anything where a downstream licence obligation is unacceptable — that is the gap this project fills.

## Packages

| Package | Contents | Runtime dependencies |
|---|---|---|
| `@headless-canvas/core` | Scene graph, renderer, state, transforms, tools, shape registry, control primitives | None |
| `@headless-canvas/ui` | The default controls and their stylesheet — imperative DOM, usable from any framework or none | `core` |
| `@headless-canvas/react` | React bindings over both | `core`, `ui`, `react` |

The default UI is **not** React-specific. If the only ready-made controls needed React, everyone else would be pushed straight into writing their own, which is not a reasonable starting position for a library whose selling point is that the controls are replaceable.

## Next

- [Getting started](/guide/getting-started) — install and mount an editor
- [Concepts](/guide/concepts) — the model, the coordinate system, the invariants
- [Demos](/demos) — everything above, running
