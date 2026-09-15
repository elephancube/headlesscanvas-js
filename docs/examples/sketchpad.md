# Sketchpad

Draw with a mouse, a finger or a pen; erase whole strokes; export the result as a PNG or an SVG, or hand it to the share sheet.

<Demo id="sketchpad" />

## Almost none of this is about drawing

A stroke is not a stroke type. `DrawTool` fits the points and produces an ordinary `path` shape, which is why the application above contains no code for selecting, moving, resizing, undoing, serialising or exporting a stroke — those already worked for paths.

Switch to **Select** and drag a corner of something you drew. It resizes like any other shape, because it *is* any other shape.

The cost of that decision is real and worth stating: a `path` has one stroke width, so pressure-sensitive strokes are not supported. A varying-width stroke is not a stroked line at all but a filled outline, which is a different shape type — [see the roadmap](/guide/tools#drawing-freehand).

## Erasing, and what "undo" should mean

Sweeping the eraser across five strokes is one gesture, so it is one entry in the history. The tool does not delete anything while the pointer is down; it dims the shapes it has crossed through the **ephemeral layer** and deletes them all in a single transaction on release.

```ts
private mark(event: HcPointerEvent): void {
  const target = event.target
  if (target === null || this.marked.has(target)) return
  this.marked.add(target)
  this.editor.setEphemeral(new Map([...this.marked].map((id) => [id, { opacity: 0.15 }])))
}

onPointerUp(): void {
  const ids = [...this.marked]
  this.reset()
  if (ids.length > 0) this.editor.deleteShapes(ids)  // one transaction, one undo
}
```

Deleting as you go would have been fewer lines and the wrong behaviour: undo would then take five presses to reverse one sweep. [History and snapping →](/guide/editing)

## Sharing, honestly

There is no server behind this page, and no social network accepts an image through a link — a post's image has to come from the device. So "share" cannot mean "post to X", and the application tries three things in order:

1. **`navigator.share` with the file.** Opens the OS share sheet, which is the real answer on phones and tablets. Requires HTTPS and a user gesture.
2. **The clipboard.** A PNG written with `ClipboardItem` pastes straight into a post. This is the desktop path.
3. **A download.** Always available.

A dismissed share sheet stops there rather than falling through — handing someone a file they just declined to send is not a fallback.

```ts
if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
  try {
    await navigator.share({ files: [file], text })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  }
}
```

## Two exports, one drawing

`editor.export()` rasterises at any scale; `editor.exportSvg()` writes the strokes as vectors. Both take the same `background` and `padding`, so the PNG and the SVG frame the drawing identically.

The SVG is worth opening: the strokes come out as `<path>` elements with the curve data the fitting produced, not as a traced bitmap. [Documents and export →](/guide/documents)

## Source

The toolbar, palette, eraser and share helpers live in a shared chrome module, which is documentation-site code rather than library code — HeadlessCanvas ships no application UI at all.

::: details The application
<<< @/.vitepress/apps/sketchpad.ts
:::

::: details Shared chrome (toolbar, eraser, share)
<<< @/.vitepress/apps/chrome.ts
:::

[← All sample applications](./)
