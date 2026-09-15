# Photo collage

Drag photographs onto the pile. Each lands as a print — white card, cropped photo, caption — tilted a little. Double-click one to write on it.

<Demo id="polaroid" />

Nothing leaves your browser: the pictures are read as object URLs and drawn locally. There is no server behind this page to send them to.

## One file, pictures included

**Save .hcanvas** writes the whole collage — including the photographs — into a single file you can hand to somebody. **Open .hcanvas** brings it back.

The interesting part is where the pictures go. `embedImages` does *not* rewrite each image shape's `src` with a data URI. It puts the bytes in a side table on the document and leaves the shapes pointing at the URL they always pointed at:

```ts
const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
// doc.shapes[…].props.src  → "blob:…"        where the picture came from
// doc.resources["blob:…"]  → "data:image/png;base64,…"   what it looked like
```

Rewriting `src` would have been simpler and wrong twice over. Every shape type holding a URL would have to declare where its URLs live for the exporter to find them — a per-type branch, which is what the registry exists to avoid — and the document would lose the provenance of its own pictures. A side table keeps both. [Documents and export →](/guide/documents)

Loading is the mirror image: `ResourceCache` maps each recorded URL to its inlined copy, so the shapes resolve without knowing anything happened.

## A print is three shapes and a group

The card, the photograph and the caption are separate shapes, grouped so they drag as one:

```ts
const group = editor.group([card, photo, text])
if (group !== null) editor.updateShape(group, { rotation })
```

The tilt is applied to the group **after** grouping, not to each piece before it — otherwise the paper would be straight and the photo crooked on it. Grouping never bakes transforms into children, so ungrouping a print later leaves the three pieces exactly where they look like they are. [Concepts →](/guide/concepts)

The crop is `object-fit: cover`, in the document:

```ts
function cover(natural: { width: number; height: number }) {
  const target = PHOTO_W / PHOTO_H
  const source = natural.width / natural.height
  if (source > target) {
    const width = target / source
    return { x: (1 - width) / 2, y: 0, width, height: 1 }   // trim the sides
  }
  const height = source / target
  return { x: 0, y: (1 - height) / 2, width: 1, height }    // trim top and bottom
}
```

`image` stores its crop as ratios of the natural size, so it survives resizing and reopening, and a saved collage comes back framed the way it was left.

## Editing the caption without rewriting the tool

Double-clicking a print should edit its caption. Everything else about the stock tool — moving, resizing, rotating, marquee selection — is wanted exactly as it is. So the tool is subclassed rather than replaced, and one method changes:

```ts
class CardTool extends SelectTool {
  override onDoubleClick(event: HcPointerEvent): void {
    const caption = captionOf(this.host, event.target)
    if (caption === null) return super.onDoubleClick(event)
    this.host.editing.begin(caption)
  }
}

editor.tools.register('select', (e) => new CardTool(e))
```

`editing.begin` opens a session in the core; what appears on screen while it is open is a separate decision, and this page takes the stock dialog by calling `createTextEditor(editor)`. A dialog rather than a field laid over the text, because canvas metrics and browser text layout are different implementations and the caret would drift. [Editing text →](/guide/text-editing)

## Export

**Save PNG** renders at 2× with a margin. The card shadows, the tilts and the cropped photographs all come through, because they are shapes rather than CSS — the exporter draws the same scene the screen does.

## Source

The three photographs the page opens with are generated, not stock: a handful of colours on a small grid, scaled up and blurred. A documentation site should not ship photography it does not have the rights to.

::: details The application
<<< @/.vitepress/apps/polaroid.ts
:::

[← All sample applications](./)
