# Shapes

## The common fields

Every shape carries the same base, whatever its type:

```ts
interface ShapeBase<Type, Props> {
  readonly id: ShapeId
  readonly type: Type

  parentId: ShapeId | null   // owning group, null at the root
  index: ZIndex              // fractional index — paint order within the parent

  x: number                  // position in parent space, top-left, before rotation
  y: number
  width: number              // real dimensions, always positive
  height: number
  rotation: number           // radians, clockwise, about the centre

  opacity: number
  locked: boolean
  visible: boolean

  meta: Record<string, unknown>  // yours; never interpreted by the library

  props: Props               // type-specific
}
```

`meta` is the supported place to attach application data — a database row id, a link to your own model. It round-trips through serialisation untouched.

A `locked` shape can still be clicked and selected — you need to be able to reach it to unlock it — but it cannot be dragged, resized, rotated or nudged, a marquee skips it, and a selection containing one is drawn with no handles and a `data-hc-locked` attribute you can style.

## Creating and editing

```ts
const id = editor.createShape({
  type: 'rect',
  x: 40,
  y: 40,
  width: 160,
  height: 110,
  props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 8 },
})

editor.updateShape(id, { rotation: Math.PI / 12 })
editor.deleteShapes([id])
```

Omitted fields fall back to the type's defaults. `props` is merged with the defaults, so partial props are fine.

`updateShape` replaces `props` wholesale when you pass it, so read before you write:

```ts
const shape = editor.getShape(id)
if (shape?.type === 'rect') {
  editor.updateShape(id, { props: { ...shape.props, cornerRadius: 16 } })
}
```

## Built-in types

All seven are registered through the same `ShapeUtil` interface available to your own types — nothing about them is privileged.

### `rect`

```ts
{ fill: Fill, stroke: Stroke | null, shadow?: Shadow | null, cornerRadius: number }
```

### `ellipse`

```ts
{ fill: Fill, stroke: Stroke | null, shadow?: Shadow | null }
```

### `line`

```ts
{ start: Vec, end: Vec, stroke: Stroke, shadow?: Shadow | null }
```

`start` and `end` are **ratios of the shape box** (0–1), not absolute points, so resizing the box moves the endpoints with it.

### `path`

```ts
{
  d: string                    // M, L, H, V, C, Q, Z — absolute and relative
  fillRule?: 'nonzero' | 'evenodd'
  viewBox?: { width: number; height: number }
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
}
```

Freehand strokes are this type — the [draw tool](/guide/tools#drawing-freehand) produces a `path`, which is why they select, resize and export like anything else.

`viewBox` is the coordinate box the path data was authored in; the path is scaled from it to the shape box. Arc commands (`A`) are not supported in v1.0.

### `text`

```ts
{
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number       // multiple of fontSize
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  wrap: boolean            // wrap at the shape width
  fill: Fill
  stroke?: Stroke | null
}
```

A **single-style block**. Mixed styles inside one block and vertical writing are out of scope for v1.0, and the type says so rather than leaving it to a footnote. It is editable — see [Editing text](#editing-text) below.

### `image`

```ts
{
  src: string
  crossOrigin?: 'anonymous' | 'use-credentials' | null   // defaults to 'anonymous'
  naturalSize?: { width: number; height: number } | null // filled in on load
  crop?: { x: number; y: number; width: number; height: number } | null
}
```

The document holds the URL and the real size; the decoded bitmap lives in a cache outside the state tree. A load completing is not a user action, so it triggers a repaint but no history entry.

`crossOrigin` defaults to `'anonymous'` because the alternative silently breaks PNG export — see [Documents and export](/guide/documents#cors-and-tainted-canvases).

### `group`

```ts
{}
```

A container. Its `width`/`height` follow its children.

## Fills and strokes

```ts
type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'linear'; stops: GradientStop[]; angle: number }   // radians, clockwise from +X
  | { type: 'radial'; stops: GradientStop[] }
  | { type: 'pattern'; src: string; repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' }

interface Stroke {
  color: string
  width: number
  dash?: number[] | null
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
  align?: 'center' | 'inside' | 'outside'
}

interface Shadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}
```

Colours are any CSS colour string. Gradient stop offsets are 0–1.

Canvas can only stroke centred on the outline, so `align: 'inside'` and `'outside'` are emulated by stroking at double width through a clip. SVG export reproduces the same trick, so the two agree.

Every shape carrying `fill`/`stroke` also accepts a blend mode:

```ts
blendMode?: GlobalCompositeOperation   // 'multiply', 'screen', 'overlay', …
```

It becomes `globalCompositeOperation` on the canvas. SVG export keeps the values CSS also has as `mix-blend-mode`; the compositing operations with no CSS equivalent (`source-in`, `copy`, …) are dropped rather than approximated.

A custom shape can apply exactly these semantics rather than approximating them: `resolveFill`, `applyStrokeStyle`, `applyShadow` and `paintPath` are exported for that purpose. See [Custom shapes](/guide/custom-shapes).

## Selection

```ts
editor.selection.ids                 // readonly ShapeId[]
editor.selection.set([a, b])
editor.selection.add([c])
editor.selection.remove([a])
editor.selection.clear()
editor.selection.selectAll()
editor.selection.getBounds()         // OrientedBounds | null
```

A single selection reports the shape's own **rotated** box. A multi-selection reports an axis-aligned one — the alternative is choosing an arbitrary shape's rotation to inherit, which is worse than admitting the box has none.

## Hierarchy

```ts
editor.group([a, b, c])              // returns the new group's id
editor.ungroup(groupId)              // returns the freed children

editor.setParent([id], groupId)      // world appearance preserved
editor.getChildren(parentId)         // paint order; null for the root
editor.getAncestors(id)              // nearest first
```

Neither grouping nor ungrouping bakes the group transform into the children: a rotated group's contents look identical before and after being freed.

## Z-order

```ts
editor.reorder([id], 'front')        // 'front' | 'back' | 'forward' | 'backward'
editor.moveTo([id], { before: otherId })
editor.moveTo([id], { after: otherId })
editor.moveTo([id], { position: 'first' })
```

Order is a fractional index, so inserting between two neighbours rewrites one field. `before`/`after` anchors are what a drag-to-reorder layers panel needs.

## Editing text

Text is edited through an **editing session**: double-click a text shape, or select one and press <kbd>Enter</kbd> or <kbd>F2</kbd>.

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)   // the stock dialog
```

The stock surface is a modal dialog rather than a field overlaid on the shape. Overlaying is the obvious approach and it does not work: canvas text metrics and the browser's own text layout are different implementations, so the field's line breaks drift from the rendered ones and the caret ends up in the wrong place. A dialog admits the separation instead of hiding it badly. In-place editing remains a v1.x question.

The session itself lives in the core, so the dialog is replaceable — see [Editing text](/guide/text-editing).

<Demo id="basics" title="The built-in shapes" />
