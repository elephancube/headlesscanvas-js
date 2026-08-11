# ShapeUtil

The implementation of one shape type. Every shape goes through this interface, including all seven built-ins — which is what keeps type-specific `switch` statements out of the renderer, the hit tester and the serialiser.

```ts
interface ShapeUtil<S extends ShapeBase = AnyShape> {
  readonly type: S['type']

  readonly propsVersion?: number
  migrateProps?(props: unknown, fromVersion: number): S['props']

  getDefaultProps(): S['props']

  render(shape: S, ctx: CanvasRenderingContext2D, info: RenderInfo): void
  hitTest(shape: S, point: Vec, tolerance: number): boolean

  getPath?(shape: S): string | null
  toSvg?(shape: S, info: SvgRenderInfo): SvgNode | SvgNode[] | null

  getLocalBounds?(shape: S): Bounds
  onResize?(shape: S, next: { width: number; height: number }): Partial<S['props']>
  getResources?(shape: S): ResourceRequest[]
  getAccessibleLabel?(shape: S): string

  getText?(shape: S): string | null
  setText?(shape: S, text: string): Partial<S['props']>

  readonly preserveAspectRatio?: boolean
  readonly canRotate?: boolean          // defaults to true
}
```

See [Custom shapes](/guide/custom-shapes) for the guide; this page is the reference.

## Members

### `type`

The discriminator. Must match the key used in the `ShapeRegistry` declaration merge.

### `getDefaultProps()`

Called for anything `createShape` omits. Must return a complete `props` object.

### `render(shape, ctx, info)`

The context arrives translated and rotated into the shape's **local space** — `(0, 0)` is the shape's top-left before rotation — with `globalAlpha` already reflecting inherited opacity. Draw between `(0, 0)` and `(width, height)`.

```ts
interface RenderInfo {
  zoom: number                                      // keep hairlines visible when zoomed out
  isExporting: boolean                              // hold animation still
  getImage?(src: string): CanvasImageSource | null  // null while loading
}
```

`getImage` requests rather than awaits, which keeps rendering synchronous: an image that has not arrived is skipped this frame and appears on the repaint that follows the load.

### `hitTest(shape, point, tolerance)`

Called only for shapes the spatial index has already put in range, so it can afford to be exact.

`point` is in local space — rotation is handled for you. `tolerance` is the click slop, already converted from screen pixels into local units; use it for thin geometry that would otherwise be impossible to click.

### `getPath(shape)` / `toSvg(shape, info)`

How the shape appears in [`editor.exportSvg()`](/api/editor#documents-and-export). Neither is required; a shape implementing neither is left out of the SVG and reported as `export-failed`.

`getPath` returns the outline as SVG path data in local space. The exporter combines it with the shape's `fill`, `stroke`, `shadow` and `fillRule`, applying the same semantics `paintPath` applies on the canvas — gradients into `<defs>`, shadows as `feDropShadow`, inside and outside stroke alignment through a clip. The full path grammar is allowed, including arcs, which is wider than the subset `parsePath` reads back.

`toSvg` takes precedence and writes the markup itself, for shapes that are not a painted outline:

```ts
interface SvgNode {
  tag: string
  attrs?: Record<string, string | number | undefined>   // undefined dropped, numbers formatted
  children?: readonly SvgNode[]
  text?: string                                         // escaped; not combined with children
}

interface SvgRenderInfo {
  define(node: SvgNode): string                         // adds to <defs>, returns the id
  resolveFill(fill: Fill, width: number, height: number): string
  measureText(text: string, font: string, letterSpacing: number): number | null
  resolveImage(src: string): string                     // data URI, or the original URL
}
```

Return `[]` rather than `null` for a shape that deliberately draws nothing — `null` means "cannot be represented" and triggers the warning. `groupShapeUtil` returns `[]`.

The shape's transform, inherited opacity and blend mode are applied by the exporter on a wrapping `<g>`; emit local coordinates only, exactly as in `render`.

### `getLocalBounds(shape)`

Exact local bounds. Defaults to `(0, 0, width, height)`. Override when the drawn extent exceeds the shape box — an overhanging arrowhead, a glow. The spatial index and culling use this, so an incorrect value makes shapes vanish near the edge of the viewport.

### `onResize(shape, next)`

Return only the **dependent** `props` adjustments; the core rewrites `width` and `height` itself.

```ts
onResize(shape, next) {
  return { cornerRadius: Math.min(shape.props.cornerRadius, next.width / 2, next.height / 2) }
}
```

### `getResources(shape)`

```ts
interface ResourceRequest {
  kind: 'image' | 'font'
  src: string
  crossOrigin?: 'anonymous' | 'use-credentials' | null
}
```

The cache loads these. A completed load repaints without a history entry — it was not a user action.

### `getAccessibleLabel(shape)`

What the hidden shape list and the live region say. Without it, the type name is used and every instance reads identically.

### `getText` / `setText`

```ts
getText?(shape: S): string | null
setText?(shape: S, text: string): Partial<S['props']>
```

Implementing **both** makes the shape editable — double-click, <kbd>Enter</kbd>, <kbd>F2</kbd>, the stock dialog and any surface built on `editor.editing`. Implementing one alone does nothing; the editor checks for the pair.

`setText` returns a partial rather than writing, so the caller keeps control of the transaction the change lands in. See [Editing text](/guide/text-editing).

### `propsVersion` / `migrateProps`

```ts
propsVersion: 2,
migrateProps(props, fromVersion) {
  const next = props as Record<string, unknown>
  if (fromVersion < 2) next.fill = String(next.color ?? '#000')
  return next as S['props']
}
```

Documents record the props version per type, so a custom shape migrates independently of the library's schema version and of other plugins. A migration that throws is reported as `schema-migration-failed` and the shape is preserved unrendered rather than lost.

### `preserveAspectRatio`

Resize uniformly, as if <kbd>⇧</kbd> were held.

### `canRotate`

`false` removes the rotate handle for a single selection of this type. A multi-selection always offers rotation.

## The registry

```ts
class ShapeUtilRegistry {
  constructor(utils?: readonly ShapeUtil<any>[])
  register(util: ShapeUtil<any>): void
  get(type: string): ShapeUtil<any> | undefined   // undefined for unregistered types
  has(type: string): boolean
  types(): string[]
}
```

Reachable as `editor.registry`. Unregistered types are **preserved but not drawn** — see [Documents](/guide/documents#unregistered-shape-types).

## Typing your shape

```ts
interface StarShape extends ShapeBase<'star', { points: number; fill: string }> {}

declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}
```

Without the merge, `props` collapses to `unknown`. Tightening types later is a breaking change, so the strict form is what ships first.

## Registering

```ts
import { defaultShapeUtils, Editor } from '@headless-canvas/core'

new Editor({ container, shapeUtils: [...defaultShapeUtils, starShapeUtil] })
```

`shapeUtils` **replaces** the default set — spread `defaultShapeUtils` unless you want only your own types.

## Built-in utils

`rectShapeUtil`, `ellipseShapeUtil`, `lineShapeUtil`, `pathShapeUtil`, `textShapeUtil`, `imageShapeUtil`, `groupShapeUtil`, and `defaultShapeUtils` containing all seven.

## Helpers for your implementation

Painting, matching the built-ins exactly rather than approximating them:

```ts
resolveFill(ctx, fill, width, height, info): string | CanvasGradient | CanvasPattern | null
applyStrokeStyle(ctx, stroke): void
applyShadow(ctx, shadow): void
paintPath(ctx, options: PaintOptions): void
```

`paintPath` is the one to reach for. It applies fill, stroke, shadow and stroke alignment in the same order the built-ins do:

```ts
interface PaintOptions {
  buildPath(ctx: CanvasRenderingContext2D): void   // called more than once; keep it pure
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
  fillRule?: CanvasFillRule
  width: number
  height: number
  info: RenderInfo
}
```

The path is passed as a builder rather than left on the context because inside and outside stroke alignment are emulated by stroking at double width through a clip, which needs the outline more than once.

Geometry:

```ts
pointInPolygon(polygon, point): boolean
distanceToSegment(point, a, b): number
distanceToPolyline(points, point): number
parsePath(d): PathCommand[]
flattenPath(commands, ...): Vec[][]
pathBounds(subpaths): Bounds
emitPath(sink, commands, ...): void     // sink: a 2D context, a Path2D, or any PathSink
pathData(commands, ...): string         // the same commands as an SVG `d` attribute
```

Text metrics:

```ts
fontString(props): string
```
