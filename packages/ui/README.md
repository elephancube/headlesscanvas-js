# @headless-canvas/ui

The stock control UI for [HeadlessCanvas](https://github.com/elephancube/headlesscanvas-js): selection box, resize and rotate handles, marquee, alignment guides, the text editing dialog, and the visually hidden shape list that screen readers walk.

**Imperative DOM, not a component library.** It has no framework of its own, so it works from vanilla JavaScript, Vue, Svelte or anything else — a ready-made UI that needed React would push everyone else straight to writing their own.

## Install

```sh
npm install @headless-canvas/core @headless-canvas/ui
```

## Usage

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
const controls = createDefaultControls(editor)

// controls.dispose() on teardown
```

Also exported: `createClipboardBinding` (copy, cut, paste, image drop) and `createTextEditor` (the editing dialog).

The stylesheet is a separate file rather than injected at runtime, so there is no flash of unstyled controls during SSR hydration and nothing to fight a strict CSP.

## Restyling

Class names, `data-hc-*` attributes and CSS variables are **public API** under semver:

```css
.hc-container { --hc-accent: rebeccapurple; --hc-handle-size: 12px; }
.hc-handle { border-radius: 50%; }
.hc-container[data-hc-tool='hand'] { cursor: grab; }
```

See the [CSS contract](https://elephancube.github.io/headlesscanvas-js/api/css).

## Documentation

- [Guide and live demos](https://elephancube.github.io/headlesscanvas-js/)
- [日本語のドキュメント](https://elephancube.github.io/headlesscanvas-js/ja/)

## License

MIT © elephancube
