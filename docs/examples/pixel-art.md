# Pixel editor

A 32×32 board, sixteen colours, a bucket and an eyedropper. Save it at 32 pixels for an icon or at 512 for something you can look at.

<Demo id="pixel-art" />

## One cell is one shape

Every painted square is an ordinary `rect`. That sounds extravagant for a pixel editor and it is the reason this application is short: erasing, undo, redo, clearing and export were all finished before the first line of it was written. A full board is 1,024 shapes, which is a fifth of what the renderer is benchmarked at.

The document is the picture, so the application never keeps a bitmap of its own. It reads the board back when it needs one:

```ts
function readBoard(editor: Editor): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const id of editor.getChildren(null)) {
    const shape = editor.getShape(id)
    if (shape?.type !== 'rect') continue
    const fill = shape.props.fill
    cells.set(cellKey(Math.round(shape.x / CELL), Math.round(shape.y / CELL)), {
      id,
      color: fill.type === 'solid' ? fill.color : '#000000',
    })
  }
  return cells
}
```

Derived rather than cached, and deliberately so: undo, redo and loading a file all rewrite the document without asking the application first. A cache would be wrong exactly when the user pressed undo.

## One stroke is one undo

A drag across thirty cells has to be one press of undo, but the user also has to *see* each cell as it is crossed — so the writes cannot be deferred. Both are satisfied by giving every write in a stroke the same merge key, and sealing the entry when the pointer comes up.

```ts
this.editor.transact(() => { /* paint the cells this move crossed */ }, { mergeKey: 'pixel' })

// …and on release:
this.editor.history.mark()   // the next stroke starts a new entry
```

Without `mark()` the two strokes would fold together whenever they happened within a second of each other. [History and snapping →](/guide/editing)

Pointer events arrive far too sparsely to paint one cell each, so a fast drag walks the cells between the last position and this one — plain Bresenham, in the tool.

## Exporting big does not mean blurring

`editor.export({ scale })` is not an image resize. It re-renders the scene at the new scale, and since a pixel here is a rectangle, a 512-pixel export draws the same rectangles sixteen times larger. The edges stay exactly as hard as they look on screen.

```ts
editor.export({
  format: 'png',
  scale: 16 / CELL,
  background: transparent ? null : '#ffffff',
  // The whole board, not the bounding box of what happens to be painted, so
  // the image is always 32×32 and a sprite keeps its offsets.
  bounds: { x: 0, y: 0, width: SIZE, height: SIZE },
})
```

That `bounds` matters more than it looks: without it, a sprite drawn in the corner would export as a tight crop and lose the position that made it a sprite. [Documents and export →](/guide/documents)

## Sharing

**Share on social** hands a 512-pixel PNG to whatever the browser offers: the OS share sheet on phones and tablets, the clipboard on desktop, a download otherwise. There is no server behind the page, and no network accepts an image through a link, so that is as far as a static site can honestly go — the same three rungs the [sketchpad](./sketchpad#sharing-honestly) uses.

Shared images are always on white, even with **Transparent** ticked. Transparency suits a sprite you are saving; in a timeline, dark pixels on a transparent background disappear against a dark theme.

## The grid is one element

It goes in the overlay, which already carries the viewport transform, so it pans and zooms with the board. Written once at mount and never touched again — the only thing JavaScript sets is `background-size`.

```css
.hc-app-pixel-grid {
  background-image:
    linear-gradient(to right, var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)), transparent 0),
    linear-gradient(to bottom, var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)), transparent 0);
}
```

Dividing by `--hc-zoom` keeps the lines one screen pixel wide at any zoom, the same way the stock handles keep their size. [Styling the controls →](/guide/styling)

## Source

::: details The application
<<< @/.vitepress/apps/pixel-art.ts
:::

[← All sample applications](./)
