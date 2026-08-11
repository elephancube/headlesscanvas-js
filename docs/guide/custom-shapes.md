# Custom shapes

Shape types are registered, not hard-coded. The seven built-in types go through exactly the mechanism described here — there is no privileged set, and no `switch (shape.type)` anywhere in the renderer, the hit tester or the serialiser.

<Demo id="custom-shape" title="A star, defined entirely in application code" />

## Define the type

```ts
import type { ShapeBase } from '@headless-canvas/core'

interface StarShape extends ShapeBase<'star', { points: number; fill: string }> {}
```

Then merge it into the registry so the rest of the API knows about it:

```ts
declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}
```

This is what keeps `props` typed. Without it, `createShape({ type: 'star', ... })` would not type-check and `getShape(id).props` would be `unknown`. Declaration merging is a deliberate choice over a generic parameter threaded through every call: tightening types later is a breaking change, so the strict version is the one that ships first.

## Implement the util

```ts
import type { ShapeUtil, Vec } from '@headless-canvas/core'

const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 1,
  preserveAspectRatio: true,

  getDefaultProps: () => ({ points: 5, fill: '#f59e0b' }),

  render(shape, ctx, info) {
    // ctx is already transformed into the shape's local space:
    // (0, 0) is the shape's top-left, before rotation.
    ctx.beginPath()
    for (const [i, point] of starPoints(shape).entries()) {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.closePath()
    ctx.fillStyle = shape.props.fill
    ctx.fill()
  },

  hitTest(shape, point, tolerance) {
    // `point` is in local space; `tolerance` is already converted from screen
    // pixels into that space for you.
    return pointInPolygon(starPoints(shape), point)
  },
}
```

Register it when constructing the editor:

```ts
import { defaultShapeUtils, Editor } from '@headless-canvas/core'

const editor = new Editor({
  container,
  shapeUtils: [...defaultShapeUtils, starShapeUtil],
})
```

Passing `shapeUtils` **replaces** the default set, so spread `defaultShapeUtils` unless you genuinely want only your own types.

## The full interface

| Member | Required | Purpose |
|---|---|---|
| `type` | ✓ | The discriminator. Must match the registry key |
| `getDefaultProps()` | ✓ | Filled in for anything `createShape` omits |
| `render(shape, ctx, info)` | ✓ | Draw, in local space |
| `hitTest(shape, point, tolerance)` | ✓ | Exact test, after the broad phase |
| `getPath(shape)` | | Outline as SVG path data, for SVG export |
| `toSvg(shape, info)` | | Full control over the SVG, when an outline is not enough |
| `getLocalBounds(shape)` | | Exact local bounds. Defaults to `(0, 0, width, height)` |
| `onResize(shape, next)` | | Dependent `props` adjustments during a resize |
| `getResources(shape)` | | Images and fonts to preload |
| `getAccessibleLabel(shape)` | | What a screen reader announces |
| `propsVersion` | | Schema version of `props` |
| `migrateProps(props, from)` | | Upgrade older `props` |
| `getText` / `setText` | | Editable text — implement both to make the shape editable |
| `preserveAspectRatio` | | Resize uniformly |
| `canRotate` | | Defaults to true; false removes the rotate handle |

### `render`

The context arrives translated and rotated into the shape's local space, with `globalAlpha` already reflecting inherited opacity. Draw between `(0, 0)` and `(width, height)`; do not save/restore around the whole thing on the library's behalf — that is handled.

`info` carries what you need to draw well at any zoom:

```ts
interface RenderInfo {
  zoom: number                                    // keep hairlines visible
  isExporting: boolean                            // hold animation still
  getImage?(src: string): CanvasImageSource | null // null while loading
}
```

To match the built-in fill and stroke semantics exactly rather than approximating them, reuse the same helpers the built-ins do:

```ts
import { applyShadow, applyStrokeStyle, paintPath, resolveFill } from '@headless-canvas/core'
```

### `getPath` / `toSvg`

Neither is required, but a shape that implements neither cannot appear in an SVG export — it is left out and reported as `export-failed` rather than silently dropped.

If your `props` carry the standard `fill` / `stroke` / `shadow`, returning the outline is enough. The exporter applies them with the same semantics `paintPath` applies on the canvas, including gradients, stroke alignment and shadows:

```ts
getPath(shape) {
  const { width: w, height: h } = shape
  return `M${w / 2},0L${w},${h}L0,${h}Z`
}
```

If your shape paints its own way, or is not an outline at all, write the markup yourself. This is what the built-in text and image shapes do:

```ts
toSvg(shape, info) {
  return {
    tag: 'path',
    attrs: { d: outlineOf(shape), fill: shape.props.fill, stroke: '#b45309', 'stroke-width': 2 },
  }
}
```

`info` supplies what a shape cannot work out alone — ids are unique to the document being written, gradients have to land in `<defs>`, and whether an image can be inlined depends on where it came from:

```ts
interface SvgRenderInfo {
  define(node: SvgNode): string                     // adds to <defs>, returns the id
  resolveFill(fill, width, height): string          // a colour, 'none', or url(#id)
  measureText(text, font, letterSpacing): number | null
  resolveImage(src): string                         // a data URI, or the original URL
}
```

Return `[]` — not `null` — for a shape that deliberately draws nothing, so it is not mistaken for one that cannot be represented. `groupShapeUtil` does exactly that.

### `hitTest`

Called only for shapes the R-tree has already put in range, so it can afford to be exact. Rotation is handled for you — the point has been mapped into local space.

`tolerance` is the click slop, converted from screen pixels to local units. Use it for thin geometry:

```ts
hitTest(shape, point, tolerance) {
  return distanceToPolyline(outline(shape), point) <= tolerance
}
```

`pointInPolygon`, `distanceToSegment` and `distanceToPolyline` are exported for this.

### `getLocalBounds`

Override when the drawn extent is not the shape box — an arrowhead that overhangs, a glow. The spatial index and culling use it, so getting it wrong makes shapes disappear near the edge of the viewport rather than merely looking odd.

### `onResize`

The core rewrites `width` and `height` itself. This hook returns only the *dependent* adjustments:

```ts
onResize(shape, next) {
  return { cornerRadius: Math.min(shape.props.cornerRadius, next.width / 2, next.height / 2) }
}
```

### `getResources`

Anything external the shape needs. The cache loads it, and a completed load triggers a repaint without a history entry — the load was not a user action.

```ts
getResources(shape) {
  return [{ kind: 'image', src: shape.props.src, crossOrigin: 'anonymous' }]
}
```

### `getAccessibleLabel`

What the hidden shape list and the live region say about this shape. Without it, the type name is used, and every star reads as "star".

```ts
getAccessibleLabel: (shape) => `${shape.props.points}-pointed star`
```

### `getText` / `setText`

Implement both and your shape becomes editable exactly like the built-in text block — double-click, <kbd>Enter</kbd>, <kbd>F2</kbd>, the stock dialog and any surface built on `editor.editing`:

```ts
getText: (shape) => shape.props.caption,
setText: (_shape, text) => ({ caption: text }),
```

The editor holds no per-type knowledge, so there is no privileged "text shape" — see [Editing text](/guide/text-editing).

## Versioning props

Custom shapes evolve as soon as they ship, so the migration hook is standardised rather than left to each author to reinvent:

```ts
const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 2,

  migrateProps(props, fromVersion) {
    const next = props as Record<string, unknown>
    if (fromVersion < 2) {
      // v1 stored a colour name; v2 stores a hex string
      next.fill = NAMED[next.fill as string] ?? '#f59e0b'
    }
    return next as StarShape['props']
  },
}
```

Documents record the props version **per type**, so your shape migrates independently of the library's schema version and of anyone else's plugin. A migration that throws is reported through the notification channel and the shape is preserved unrendered rather than discarded.

## Unregistered types are preserved

Load a document containing a type no util is registered for and the record is **kept, not dropped**. It is not drawn and cannot be selected, and re-serialising writes it back exactly as it arrived.

This is what makes plugins safe to remove. Uninstalling one to try something, saving, and losing every shape it owned is the failure mode this prevents. A notification (`unknown-shape-type`) tells you it happened:

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'unknown-shape-type') console.warn(n.message)
})
```

## Shapes that must be DOM

Video, an iframe, a live web view — things a canvas cannot draw. A DOM-rendered shape path is planned and is **not part of v1.0**: `ShapeUtil` has no `renderDOM` member yet, so every shape is canvas-rendered. It is mentioned here only so the omission is not mistaken for an oversight — the design reserves the extension point, including the rule that such elements would default to `pointer-events: none` so an iframe could not swallow the input needed to select and move it.
