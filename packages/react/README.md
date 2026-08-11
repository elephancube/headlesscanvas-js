# @headless-canvas/react

React bindings for [HeadlessCanvas](https://github.com/elephancube/headlesscanvas-js).

A thin adapter, deliberately. The editor and its default UI are plain TypeScript with no framework of their own; this package mounts them from an effect and exposes the state through `useSyncExternalStore`. Nothing here is a reimplementation, so React is never the privileged way to use the library.

## Install

```sh
npm install @headless-canvas/core @headless-canvas/ui @headless-canvas/react
```

React 18 or later, as a peer dependency.

## Usage

```tsx
import { HcCanvas, HcDefaultControls, useEditor, useSelectedIds } from '@headless-canvas/react'
import '@headless-canvas/ui/styles.css'

function Toolbar() {
  const editor = useEditor()
  const selected = useSelectedIds()
  return <button onClick={() => editor.deleteShapes(selected)}>Delete {selected.length}</button>
}

export function App() {
  return (
    <HcCanvas onMount={(editor) => editor.createShape({ type: 'rect', x: 40, y: 40, width: 160, height: 110 })}>
      <HcDefaultControls />
      <Toolbar />
    </HcCanvas>
  )
}
```

Hooks: `useEditor`, `useValue`, `useSelectedIds`, `useShape`, `useZoom`, `useSelectionBox`, `useEditingSession`. Components: `HcCanvas`, `HcDefaultControls`, `HcTextEditor`.

To build the controls yourself, `useSelectionBox()` returns the box and a prop-getter per handle — the same primitive the stock UI uses.

## Documentation

- [React guide](https://elephancube.github.io/headlesscanvas-js/guide/react)
- [API reference](https://elephancube.github.io/headlesscanvas-js/api/react)
- [日本語のドキュメント](https://elephancube.github.io/headlesscanvas-js/ja/guide/react)

## License

MIT © elephancube
