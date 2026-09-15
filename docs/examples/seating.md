# Seating chart

Select seats by clicking or dragging a box around them — shift adds to the selection — then set a status. A custom `seat` shape does the drawing.

<Demo id="seating" />

## The part that is not on screen

Click the canvas and press <kbd>Tab</kbd>. The first stops are buttons — one per seat in view — each labelled with its number and its status, each of which selects that seat when activated. The panel on the right mirrors the first few so you can see what is there; the real list is visually hidden, because it is not for you.

This is not a feature bolted onto a seating chart. It falls out of where the control layer lives. A library that paints its selection UI into the canvas has nothing in the accessibility tree to walk and cannot be given one: the pixels are not elements. Konva and Fabric draw handles into the canvas; that is the trade.

The list is virtualised to the viewport, so a hall of ten thousand seats still puts a bounded number of nodes in the DOM, and reports the rest as a count. Zoom out and watch the summary under the panel. [Accessibility →](/guide/accessibility)

## A seat is a shape the library has never heard of

`seat` registers through the same `ShapeUtil` interface `rect` and `text` use. There is no privileged built-in set — which is the only way to be sure the extension point is actually sufficient.

```ts
interface SeatShape extends ShapeBase<'seat', { label: string; status: SeatStatus }> {}

declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    seat: SeatShape
  }
}
```

The declaration merge is what keeps `props` typed; without it every `createShape({ type: 'seat', … })` would collapse to `any`.

Two details worth copying:

- **`canRotate: false`.** Seats do not rotate, so the rotate handle is not offered. The shape declares it; nothing in the UI needs to know about seats. This particular application removes every handle (see below), but the declaration still belongs on the shape — it is true wherever a seat is used.
- **`toSvg` rather than `getPath`.** A seat is a box *and* a label, not a painted outline, so it writes its own markup. Export the chart to SVG and the seat numbers come with it, because the exporter has no idea what a seat is and asked it. [Custom shapes →](/guide/custom-shapes)

## Translating a shape's label

`getAccessibleLabel` is the one place a shape produces prose, and the built-in shapes return English without consulting any message table. That is deliberate rather than an oversight: a label depends on the shape's *contents*, and a fixed set of translation keys cannot describe a type nobody has written yet.

The supported way to translate them is to substitute the utils — which is exactly what this application does, since it needs its own labels in two languages anyway:

```ts
const seatShapeUtil = (lang: Lang): ShapeUtil<SeatShape> => {
  const _ = t(lang)
  return {
    type: 'seat',
    // …
    getAccessibleLabel: (shape) =>
      `${_(['Seat', '座席'])} ${shape.props.label}, ${_(STATUS_TEXT[shape.props.status])}`,
  }
}

new Editor({ container, shapeUtils: [...defaultShapeUtils, seatShapeUtil(lang)] })
```

Replacing a built-in works the same way: put your version after `...defaultShapeUtils` and it wins.

## Selection without transformation

Seats are laid out once and thereafter only picked. Moving and resizing them is not a feature here, it is a way to break the chart, so neither is offered — and taking them away needs no fork:

**The tool.** The stock select tool moves and resizes, so the application registers its own under the same id. Replacing a built-in is the same call as adding one.

```ts
class PickTool implements Tool {
  readonly id = 'select'      // same id: this replaces the stock tool
  // click, shift-click, marquee — and nothing else
}

editor.tools.register('select', (e) => new PickTool(e))
```

**The handles.** They are elements, so one CSS rule removes them. `display: none` also takes them out of the tab order, which is what is wanted: there is nothing left to resize, so there should be nothing to tab to.

```css
.hc-app-pick .hc-handle {
  display: none;
}
```

A canvas-drawn handle could not be taken away like this. It would need a flag its author thought to add.

The stage banner takes a third route: `locked: true`. Locked shapes are excluded from marquee hits and report `data-hc-locked` on the selection box, so a stylesheet can react without any JavaScript. [The CSS contract →](/api/css)

## Source

::: details The application
<<< @/.vitepress/apps/seating.ts
:::

[← All sample applications](./)
