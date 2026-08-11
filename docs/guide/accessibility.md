# Accessibility

A canvas is a single opaque node in the accessibility tree. Nothing drawn into it can be focused, announced or activated. Libraries that paint their selection handles into the canvas therefore cannot be made accessible from application code — not with effort, not at all.

Putting the controls in the DOM is what makes the rest of this page possible.

<Demo id="accessibility" title="The hidden layer, mirrored on screen" />

## What ships

### Handles are buttons

Each handle is a real `<button>` with `role="button"`, an `aria-label` from the message table, and `tabindex="0"`. It can be tabbed to and operated with the arrow keys — 1 unit per press, 10 with <kbd>⇧</kbd>. Resizing and rotating are available without a pointer at all.

That behaviour comes from `controls.bindHandle()`, so it is identical whether you use the default UI, the React bindings or [your own markup](/guide/custom-controls).

### The shape list

A visually hidden `<ul>` lists the shapes currently in view. Each entry is a button; activating it selects that shape and brings it into view.

```html
<ul class="hc-a11y-list" aria-label="Shapes on canvas">
  <li><button aria-pressed="false">Rectangle</button></li>
  <li><button aria-pressed="true">5-pointed star, selected</button></li>
  <li>12 more outside the view</li>
</ul>
```

The label comes from `ShapeUtil.getAccessibleLabel()`. Implement it on your own shape types — without it, every instance reads as its type name.

**The list is virtualised to the viewport.** Emitting one node per shape would put five thousand nodes in the DOM and give up the bounded node count the whole architecture is built around. A summary entry reports how many are outside the view, so the total is never hidden.

The buttons are hidden until focused, at which point they become visible — a focused control nobody can see is its own accessibility failure.

### Announcements

An `aria-live="polite"` region announces selection changes. The selection box is a purely visual cue; without this, a screen reader user gets no confirmation that anything happened.

```html
<div class="hc-a11y-live" aria-live="polite" aria-atomic="true">3 shapes selected</div>
```

### The container

`role="application"` with an `aria-label`, focusable, and a visible focus ring. The canvas inside it is `aria-hidden` — everything meaningful is exposed through the overlay instead.

## Translating the strings

Every string the library itself emits — handle labels, selection announcements, the editing dialog — is overridable. A library that hard-codes English `aria-label`s is unusable outside English-speaking products, which would undercut the reason for building the controls in the DOM in the first place. Shape labels come from elsewhere; see [below](#what-this-table-does-not-cover).

```ts
const editor = new Editor({
  container,
  messages: {
    'handle.nw': '左上からリサイズ',
    'handle.rotate': '回転',
    'selection.multiple': '{count} 個の図形を選択中',
    'canvas.label': 'キャンバス',
    'shapeList.label': 'キャンバス上の図形',
    'shapeList.more': '表示範囲外にあと {count} 個',
  },
})
```

Supply as few or as many as you like; the rest fall back to English. `{count}` is substituted.

| Key | Default |
|---|---|
| `handle.nw` … `handle.w` | `Resize from top left` … `Resize from left` |
| `handle.rotate` | `Rotate` |
| `selection.none` | `Nothing selected` |
| `selection.single` | `Selected shape` |
| `selection.multiple` | `{count} shapes selected` |
| `canvas.label` | `Canvas` |
| `shapeList.label` | `Shapes on canvas` |
| `shapeList.more` | `{count} more outside the view` |
| `shapeList.selected` | `selected` |
| `state.locked` | `locked` |
| `edit.label` | `Edit text` |
| `edit.save` / `edit.cancel` | `Save` / `Cancel` |

Adding a key in a future release is not a breaking change; removing or renaming one is.

### What this table does not cover

**Shape labels are not in it.** The text a screen reader reads for each entry in the list comes from `ShapeUtil.getAccessibleLabel(shape)`, and the built-in shapes return English — `Rectangle 160×110`, `Line`, `3-pointed star`. They are not routed through the message table, because a label depends on the shape's own contents and no fixed set of keys can cover a shape type the library has never heard of.

To translate them, register your own utils over the built-ins:

```ts
import { defaultShapeUtils, Editor, rectShapeUtil } from '@headless-canvas/core'

const utils = defaultShapeUtils.map((util) =>
  util === rectShapeUtil
    ? { ...util, getAccessibleLabel: (s) => `長方形 ${Math.round(s.width)}×${Math.round(s.height)}` }
    : util,
)

new Editor({ container, shapeUtils: utils })
```

Spreading rather than rewriting keeps everything else about the shape — its rendering, hit test and export — untouched.

## Turning it off

```ts
createDefaultControls(editor, { accessibleList: false })
```

Only do this if you are providing an equivalent yourself — a layers panel that is already keyboard-navigable, for instance. Otherwise it removes the only non-visual route into the document.

## Building your own

The same data is available directly:

```ts
editor.controls.getA11yShapeDescriptors()
// [{ id, label, selected, locked }, ...] — viewport only

editor.controls.getA11ySummary()
// { total: 5000, visible: 37 }
```

Report both numbers. "37 shapes" when the document holds 5,000 is a worse answer than saying so.

## Keyboard reference

| Key | Action |
|---|---|
| <kbd>Tab</kbd> | Into the shape list, then the handles |
| <kbd>Space</kbd> / <kbd>Enter</kbd> on a list entry | Select that shape and bring it into view |
| Arrow keys on a handle | Resize or rotate. <kbd>⇧</kbd> for 10 units |
| Arrow keys with a selection | Move it. <kbd>⇧</kbd> for 10 units |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection |
| <kbd>⌘A</kbd> / <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> | Select all, group, ungroup |
| <kbd>Enter</kbd> / <kbd>F2</kbd> with one shape selected | Edit its text, if it has any |
| <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> | Undo, redo |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> | Select tool, hand tool, draw tool |
| <kbd>Escape</kbd> | Cancel the current interaction |

## Status

::: warning Not yet verified on real assistive technology
The implementation and its automated tests are complete, but jsdom cannot tell you what a screen reader actually announces or in what order. Verification with NVDA and VoiceOver is outstanding before v1.0, and until that is done this page describes what the DOM contains rather than a tested experience. Reports from real-world use are welcome.
:::
