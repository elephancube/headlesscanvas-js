---
layout: home

hero:
  name: HeadlessCanvas
  text: The handles are DOM elements
  tagline: A canvas editor engine for design tools, whiteboards, diagram editors and annotation UIs. Shapes render to canvas; selection UI is DOM you style with CSS. MIT licensed, no watermark, no framework required.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the demos
      link: /demos
    - theme: alt
      text: GitHub
      link: https://github.com/elephancube/headlesscanvas-js

features:
  - title: Restyle the controls with CSS
    details: Selection boxes and handles are real elements carrying documented class names and data attributes. Change how they look without forking anything.
    link: /guide/styling
    linkText: Styling guide
  - title: Reachable by assistive technology
    details: Handles are buttons. Shapes in view are exposed as a virtualised list a keyboard can walk. Controls painted into a canvas cannot be either.
    link: /guide/accessibility
    linkText: Accessibility guide
  - title: No framework required
    details: The core and the default UI are plain TypeScript with zero runtime dependencies. React is a thin adapter you can skip.
    link: /guide/react
    linkText: React bindings
  - title: MIT, in full
    details: No licence key, no watermark, no commercial tier. Ship it in a product and your users need nothing from us.
---

<Demo id="basics" title="Level 1 — the stock controls, unmodified" />

## Why the controls are not painted into the canvas

Konva and Fabric draw selection handles into the canvas alongside the artwork. Two consequences follow, and neither can be worked around from application code: the handles cannot be restyled with CSS, and assistive technology cannot see them at all.

HeadlessCanvas splits the two layers:

```
┌─────────────────────────────────────┐
│  DOM overlay  — selection, handles  │  ← your CSS, your markup, keyboard accessible
├─────────────────────────────────────┤
│  Canvas       — shapes, images      │  ← fast rendering, no UI drawn here
└─────────────────────────────────────┘
```

tldraw shares this architecture but is not open source: production use requires a licence key, the watermark must stay unless you buy a commercial licence, and every downstream user of your project needs their own. HeadlessCanvas is MIT.

| | Rendering | Controls UI | Styleable with CSS | Screen-reader accessible | Licence |
|---|---|---|---|---|---|
| **HeadlessCanvas** | Canvas | **DOM** | **Yes** | **Yes** | **MIT** |
| Konva.js | Canvas | Canvas | No | No | MIT |
| Fabric.js | Canvas | Canvas | No | No | MIT |
| tldraw | DOM/SVG | DOM | Yes | Partial | Not open source |
| Excalidraw | Canvas | DOM | It is an app, not a reusable library | — | MIT |

## Install

```sh
npm install @headless-canvas/core @headless-canvas/ui
```

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
createDefaultControls(editor)

editor.createShape({ type: 'rect', x: 40, y: 40, width: 160, height: 110 })
```

That is the whole setup. [Getting started](/guide/getting-started) covers the rest.
