# @headless-canvas/core

The engine behind [HeadlessCanvas](https://github.com/elephancube/headlesscanvas-js) — a canvas editor whose selection handles are **DOM elements**, not pixels painted into the canvas. That one difference is what makes them restyleable with CSS and reachable by assistive technology.

This package holds everything that is not a control: the editor and its Canvas 2D renderer, immutable state with undo/redo, transforms and hit testing, the tool state machine, the shape registry, document serialisation, PNG/JPEG and SVG export, and the headless primitives the control UI is built from.

**Zero runtime dependencies.** Shapes render and input works, but nothing draws a selection box until you add one — either [`@headless-canvas/ui`](https://www.npmjs.com/package/@headless-canvas/ui) or your own.

## Install

```sh
npm install @headless-canvas/core
```

## Usage

```ts
import { Editor } from '@headless-canvas/core'

const editor = new Editor({ container: document.querySelector('#app')! })

editor.createShape({ type: 'rect', x: 40, y: 40, width: 160, height: 110 })
editor.tools.setCurrent('draw')
```

Shape types are registered rather than hard-coded, so your own go through exactly the same interface the built-in seven do — including rendering, hit testing, migration and SVG export.

## Documentation

- [Guide and live demos](https://elephancube.github.io/headlesscanvas-js/)
- [日本語のドキュメント](https://elephancube.github.io/headlesscanvas-js/ja/)
- [API reference](https://elephancube.github.io/headlesscanvas-js/api/)

## License

MIT © elephancube
