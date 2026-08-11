# Editing text

<Demo id="text-editing" title="The same session, two different surfaces" />

## Turning it on

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)
```

That is all. Double-clicking a text shape opens a dialog; so does <kbd>Enter</kbd> or <kbd>F2</kbd> with one selected.

Without it, sessions still open — the core opens them — but nothing is on screen to type into. That separation is the point of the design, and it is what makes the dialog replaceable.

## Why a dialog

The obvious approach is to overlay a `<textarea>` on the shape so the text appears to be edited where it sits. It does not work, and not for want of effort: canvas text metrics and the browser's text layout are **different implementations**. The field's line breaks drift from the rendered ones, the caret lands in the wrong place, and the discrepancy grows with the amount of text.

A dialog admits the separation rather than hiding it badly. If you want an in-place editor anyway, the session API below is what you would build it on, and the trade-off is yours to make with the constraint stated.

## Who can be edited

Not "shapes of type `text`". A shape is editable exactly when its `ShapeUtil` implements **both** `getText` and `setText`:

```ts
const badgeUtil: ShapeUtil<BadgeShape> = {
  type: 'badge',
  // ...
  getText: (shape) => shape.props.caption,
  setText: (_shape, text) => ({ caption: text }),
}
```

A custom shape that implements the pair becomes editable everywhere the built-in text block is — double-click, keyboard, the stock dialog, and any surface you write. The editor holds no per-type knowledge of its own.

```ts
editor.editing.canEdit(id)   // false for a rect, and for anything locked
```

## The session API

```ts
editor.editing.id            // ShapeId | null
editor.editing.initialText   // string | null — the text when the session opened
editor.editing.canEdit(id)
editor.editing.begin(id)     // false if the shape has no text, or is locked
editor.editing.commit(text)  // close, writing one history entry
editor.editing.cancel()      // close, discarding
editor.editing.subscribe(fn) // sessions opening and closing
```

Three things are worth knowing.

**Beginning a session selects the shape.** Otherwise the selection UI would be pointing at something other than the text being changed.

**Committing identical text records nothing.** Opening an editor and closing it again is not an edit and should not cost an undo step.

**`subscribe` is its own channel.** A session is not a document change: the store does not move and the render version does not either, so `editor.subscribe` would never fire. This is the only correct way to observe one.

While a session is open, `data-hc-state` on the container is `editing`, so a stylesheet can react without any JavaScript:

```css
.hc-container[data-hc-state='editing'] .hc-selection { opacity: 0.4; }
```

## Building your own surface

Anything that can read a string and call two methods will do — a side panel, an inline field, a form elsewhere in your application:

```ts
const stop = editor.editing.subscribe(() => {
  const id = editor.editing.id
  if (id === null) {
    panel.hidden = true
    return
  }
  panel.hidden = false
  input.value = editor.editing.initialText ?? ''
  input.focus()
})

saveButton.addEventListener('click', () => editor.editing.commit(input.value))
cancelButton.addEventListener('click', () => editor.editing.cancel())
```

The demo at the top of this page switches between the stock dialog and exactly this, at runtime. Neither knows about the other.

::: warning Keyboard ownership
If your surface lives inside `editor.container`, its key events bubble to the editor. The editor ignores them while a session is open, and also ignores keys originating from an `<input>`, `<textarea>`, `<select>` or anything `contenteditable` — otherwise typing "v" into a field would switch tools and <kbd>⌘Z</kbd> would undo the document instead of the typing. A surface **outside** the container is unaffected either way.
:::

## Entering shapes generally

Double-click is routed to the active tool as `onDoubleClick`, and the select tool's response happens to be "begin an editing session". A tool of your own can do something else with it entirely:

```ts
onDoubleClick(event: HcPointerEvent): void {
  if (event.target) this.enterSubEditor(event.target)
}
```

See [Tools](/guide/tools).

## Options

```ts
createTextEditor(editor, { submitOnEnter: true })
```

By default <kbd>Enter</kbd> inserts a newline and <kbd>⌘Enter</kbd> saves, because a text block is multi-line. With `submitOnEnter`, that swaps: <kbd>Enter</kbd> saves and <kbd>⇧Enter</kbd> inserts a newline — the right choice for single-line labels.

## Styling

The dialog uses the same CSS contract as everything else. It is **not** inside the overlay, so nothing here is counter-scaled — it is chrome at screen scale and stays legible at any zoom.

| Class | Element |
|---|---|
| `.hc-text-dialog` | The `<dialog>`. Style `::backdrop` here too |
| `.hc-text-form` | The form inside it |
| `.hc-text-label` | Label wrapping the field |
| `.hc-text-input` | The `<textarea>` |
| `.hc-text-actions` | The button row |
| `.hc-text-button` | A button; `[data-hc-text-action]` is `save` or `cancel` |

```css
.hc-text-dialog { border-radius: 2px; }
.hc-text-dialog::backdrop { background: rgb(0 0 0 / 60%); }
.hc-text-button[data-hc-text-action='save'] { background: rebeccapurple; }
```

The button labels come from the [message table](/guide/accessibility#translating-the-strings) — `edit.label`, `edit.save` and `edit.cancel`.

## In React

```tsx
import { HcTextEditor, useEditingSession } from '@headless-canvas/react'

<HcCanvas>
  <HcDefaultControls />
  <HcTextEditor />
</HcCanvas>
```

`useEditingSession()` returns `{ id, initialText }` for building your own, subscribed to the same channel.

## What this is not

This is a **plain-text** editor for a single-style block. Rich text — mixed styles within one block, inline formatting, a full editing engine — is out of scope for v1.0 and is [not on the roadmap](/guide/#what-it-is-not) as a library feature.
