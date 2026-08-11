# Documents and export

<Demo id="documents" title="The document, live, as it would be stored" />

## Saving and loading

```ts
const document = editor.toJSON({ savedBy: 'alice' })  // optional meta
editor.loadDocument(document)
```

`toJSON()` returns a plain object — serialise it however you like.

```ts
interface HcDocument {
  schemaVersion: number
  shapes: AnyShape[]
  propsVersions?: Record<string, number>   // per shape type
  resources?: Record<string, string>       // images, keyed by the URL they came from
  meta?: Record<string, unknown>
}
```

`schemaVersion` is present from the first release because it **cannot be added later**: a file written without one is indistinguishable from a future file whose version field happens to be missing. `propsVersions` records each shape type's own version, so a custom shape migrates independently of the library and of anyone else's plugin.

Loading is not undoable and clears the history — it replaces the document rather than editing it.

### As a file

There is no file format beyond this — it is JSON, so writing it out is whatever your application already does with JSON:

```ts
const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
```

```ts
const file = input.files?.[0]
if (file) editor.loadDocument(JSON.parse(await file.text()))
```

The demo above does exactly this, with `.hcanvas` as the extension.

### Making it stand alone

Images live at a URL, so a document that references one is not portable on its own — move the file and the picture goes missing. `embedImages` inlines them:

```ts
editor.toJSON(undefined, { embedImages: true })
```

The bytes go into `resources`, keyed by the URL. **The shapes are not rewritten** — they still record where each image came from, so the document says both what it shows and where it got it. It also means no shape type has to know where its own URLs live: `getResources()` already enumerates them through the registry.

Three consequences worth knowing:

- **A loaded document's images are always written back**, with or without `embedImages`. Dropping them because this particular save did not ask to embed would destroy data you were handed.
- **An image that cannot be read back is reported, not fatal.** Cross-origin without CORS headers is the same rule that taints the canvas; the document is written with a URL reference and a `export-failed` notification names the sources.
- **Embedding also un-breaks PNG export** for those images. What comes back is a data URI, which is same-origin and therefore cannot taint the canvas.

Copying carries embedded images too, so pasting into another editor still has the picture — but it does not encode new ones, because a clipboard write should not stall reading back every bitmap.

## Unregistered shape types

A document containing a type you have not registered is **preserved, not discarded**. The record is kept, not drawn, not selectable, and written back byte-identical on the next `toJSON()`.

This is what makes plugins safe to uninstall. The alternative — silently dropping the records — means removing a plugin to try something and losing every shape it owned.

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'unknown-shape-type') console.warn(n.message)
  if (n.code === 'schema-migration-failed') console.error(n.message, n.detail)
})
```

A migration that throws is reported the same way, and the shape is preserved unrendered rather than being lost.

## Export

```ts
const blob = await editor.export({
  format: 'png',        // 'png' | 'jpeg'
  scale: 2,             // output multiplier
  quality: 0.92,        // JPEG only, 0..1
  background: '#fff',   // null for transparency
  padding: 24,
  bounds: undefined,    // world-space region; defaults to everything drawn
})
```

`scale` is a real multiplier applied to the render, not an upscale of the result — a 2× export is drawn at 2× and stays sharp. Print and hand-off workflows routinely want 2–4.

```ts
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = 'artboard.png'
link.click()
URL.revokeObjectURL(url)
```

Export renders off-screen, so the on-screen viewport is not disturbed, and shape utils see `info.isExporting === true` in case something animated needs to hold still.

## Export as SVG

```ts
const svg = editor.exportSvg({
  background: '#fff',   // null for transparency
  padding: 24,
  scale: 1,             // sets the width/height attributes; the viewBox is unchanged
  bounds: undefined,    // world-space region; defaults to everything drawn
  embedImages: true,    // inline images as data URIs so the file stands alone
})
```

It returns a string, synchronously — there are no pixels to encode:

```ts
const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
```

The output is vector, so it stays sharp at any size and can be opened in a drawing program. `scale` therefore does something different here than it does for PNG: it sets the size the document displays at, without changing the geometry.

### How shapes get there

There is no canvas to draw into, so a shape cannot simply be asked to draw itself. Instead each one contributes its own geometry, through the same registry the renderer and the hit tester use:

- **`ShapeUtil.getPath(shape)`** returns the outline as SVG path data. The exporter applies the shape's fill, stroke and shadow to it — gradients, dash patterns, inside and outside stroke alignment included.
- **`ShapeUtil.toSvg(shape, info)`** writes the markup directly, for shapes that are not a painted outline.

Your shapes export on exactly the same terms as the built-in ones. A shape that implements neither is left out and reported:

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'export-failed') console.warn(n.message, n.detail)
})
```

The export still succeeds — one unexportable shape should not cost the whole document — but it does not pass in silence.

### What differs from the PNG

- **Text is text.** Real `<text>` elements, so it stays selectable and editable. The line breaks are computed here, from the same measurements the canvas used, but the glyphs within a line are laid out by whatever opens the file: a viewer without your font will space them differently. Converting text to outlines would fix that and lose everything else, and needs font data the browser does not expose.
- **Images are embedded** as data URIs by default. One that cannot be read back — cross-origin without CORS headers, the same rule that taints the canvas — is referenced by URL instead, and reported. Unlike the PNG path, this does not fail the export.
- **Blend modes** survive only where canvas and CSS agree (`multiply`, `screen`, `overlay`, …). The compositing operations with no `mix-blend-mode` equivalent are dropped rather than approximated.

## CORS and tainted canvases

Draw a cross-origin image without permissive CORS headers and the browser marks the canvas **tainted**: its pixels can no longer be read back, which means export fails. This is a browser rule with no workaround from JavaScript.

Since any editor that both loads remote images and exports will meet it, the failure is made specific rather than opaque:

```ts
import { HcTaintedCanvasError } from '@headless-canvas/core'

try {
  await editor.export({ format: 'png' })
} catch (error) {
  if (error instanceof HcTaintedCanvasError) {
    console.error('These images blocked the export:', error.sources)
  }
}
```

`error.sources` names the URLs responsible, which is the difference between a bug report you can act on and a `SecurityError` with no context.

To avoid it:

- Serve images with `Access-Control-Allow-Origin`. `crossOrigin` defaults to `'anonymous'`, so this is all that is needed
- Or proxy them through your own origin
- Or store them as data URLs — what the clipboard binding does with pasted images
- Setting `crossOrigin: null` **does not help**; it taints the canvas as soon as the image is drawn

## Resources

Decoded images live in a cache outside the state tree — the document holds the URL and the natural size, nothing more. A completed load is not a user action, so it repaints without touching the history.

```ts
editor.resources.getImage(src)      // CanvasImageSource | null while loading
editor.resources.getStatus(src)     // 'idle' | 'loading' | 'loaded' | 'error'
```

Failures arrive as `resource-load-failed` notifications rather than exceptions; a broken image should not take the editor down with it.

Fonts follow the same model, requested by a shape's `getResources()` and loaded through the same cache:

```ts
await editor.resources.loadFont('Inter', 600, 'normal')
```

The load waits on `document.fonts.load` and `document.fonts.ready` before repainting, because measuring text against a fallback face and then repainting with the real one shifts the layout under the user — worse than a marginally later first frame.

## Patching from outside

```ts
editor.applyPatch(patches, { addToHistory: false })
```

The same `Patch` representation the history uses. It exists for collaborative editing, which is **not** implemented in v1.0 — the hook is here because retrofitting an external-change path onto a state layer is a rewrite, not an addition.

::: warning
History correctness under externally applied patches is not guaranteed in v1.0.
:::
