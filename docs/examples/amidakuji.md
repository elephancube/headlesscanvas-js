# Amidakuji

Click between two verticals to lay a rung. Click a letter at the top and a ball rolls down, taking every rung it meets.

<Demo id="amidakuji" />

## What is a drawing and what is the application talking

Four things move on this page, and only two of them are in the document.

**The ladder is a drawing.** Verticals and rungs are `line` shapes. Press **Save PNG** and they come out, because they are what the page is *of*.

**The trail is a drawing too.** It is what you would want to keep — the answer, drawn.

**The ball is not.** It marks where the animation has got to, and in a saved picture it would be a red dot with no explanation. So it is a `<div>` in the overlay, positioned in world coordinates, and the document never hears about it.

**The covers over the prizes are not either.** They are a game rule, not ink. Turning them off changes nothing in the document, which is why doing so is not something undo has an opinion about.

```css
.hc-app-ball {
  position: absolute;
  left: 0;
  top: 0;
  /* The overlay already carries the viewport transform, so a world
     coordinate is all the ball needs to travel with the ladder. */
}
```

This division is the whole architecture in miniature: shapes are content, the overlay is the application, and the two are kept apart deliberately rather than by accident. [Concepts →](/guide/concepts)

## Animating without touching the document

The trail grows sixty times a second. Writing it to the document at that rate would rebuild the immutable tree every frame and leave a history entry each time — for something the user did not even edit.

It goes to the ephemeral layer instead, exactly as a drag does. The shape is created once **outside the history**, and every frame after that is an overlay write that costs nothing and records nothing.

```ts
// Outside the history: a run is something you watch, not an edit.
trail = editor.transact(
  () => editor.createShape({ type: 'path', ...geometry(points.slice(0, 2)) }),
  { addToHistory: false },
)

const step = (now: number) => {
  travelled = Math.min(length, travelled + ((now - last) / 1000) * SPEED)
  editor.setEphemeral(new Map([[trail, geometry(prefix(points, travelled).points)]]))
  animation = requestAnimationFrame(step)
}
```

The geometry comes from `strokeFromPoints`, the same function the freehand tool uses, with fitting turned off — the ladder is made of straight segments, and smoothing them would draw a nice curve through the wrong answer. [Tools →](/guide/tools#drawing-freehand)

## A rung is an ordinary line that knows what it is

There is no `rung` shape type. A rung is a `line` with something written in `meta`:

```ts
editor.createShape({
  type: 'line',
  meta: { role: 'rung', row, gap },
  // …
})
```

`meta` is a free-form slot on every shape that the library never reads or interprets. It is the right place for the part of a model that is the application's business — here, which slot on the ladder a given line occupies — and it serialises with the shape, so a saved ladder is still a ladder when it comes back.

The board is then read *out of the document* rather than kept in a variable beside it:

```ts
function readRungs(editor: EditorInstance): Map<string, ShapeId> {
  const out = new Map<string, ShapeId>()
  for (const id of editor.getChildren(null)) {
    const meta = metaOf(editor, id)
    if (meta.role === 'rung') out.set(rungKey(meta.row, meta.gap), id)
  }
  return out
}
```

That is deliberate. Undo, redo and loading a file all rewrite the document without asking the application first, and a cached copy of the board would be wrong exactly when someone pressed undo.

## A new rung reshuffles the prizes

Adding a rung changes where runs end, so anything already revealed is now a spoiler. Laying a rung — by hand or with **Scatter rungs** — covers every prize again and deals them afresh. The rung and the new prizes are written in one transaction, so a single undo takes back both.

```ts
editor.transact(() => {
  addRung(row, gap)
  reshuffle()   // new prizes, all covered
})
```

Removing a rung does not reshuffle: taking a line away is how you correct a mistake, and it should not cost the round.

## The rule that makes the puzzle work

Rungs are not allowed to touch. If two met at the same height the walk would have a choice to make, and amidakuji works precisely because it never does: with no touching rungs the walk is a permutation, so no two starting letters can ever land on the same prize.

```ts
if (rungs.has(rungKey(row, gap - 1)) || rungs.has(rungKey(row, gap + 1))) {
  say('Rungs cannot touch.')
  return
}
```

## Source

::: details The application
<<< @/.vitepress/apps/amidakuji.ts
:::

[← All sample applications](./)
