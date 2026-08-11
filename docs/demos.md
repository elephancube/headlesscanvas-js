# Demos

Every demo on this page runs the library from source. They start as they scroll into view, so several live editors can share a page without competing for frames.

## The stock controls

Level 1: construct an editor, mount the default UI, and nothing else. The readout counts the DOM nodes inside the overlay — it stays in the low tens whatever the shape count, because control UI only ever exists for the selection.

<Demo id="basics" />

## Restyling with CSS

Level 2: the class names, data attributes and CSS variables are the public contract. Everything the panel changes is reachable from a stylesheet.

<Demo id="styling" />

[Styling guide →](/guide/styling)

## Controls written by hand

Level 3: the box, the handles and the floating toolbar are all markup written for this page. Pointer capture, keyboard nudging and the ARIA attributes come from `editor.controls.bindHandle` — the same primitive the stock UI uses.

<Demo id="custom-controls" />

[Custom controls guide →](/guide/custom-controls)

## A shape the library has never heard of

Registered through the same `ShapeUtil` interface the built-in shapes use. Select a star and drag the slider.

<Demo id="custom-shape" />

[Custom shapes guide →](/guide/custom-shapes)

## Drawing freehand

A stroke is an ordinary `path` shape, so it selects, resizes, serialises and exports as a vector without the drawing tool teaching anything how. Turn **Simplify** down to zero and draw again to see how many samples a pointer really produces.

<Demo id="drawing" />

[Tools guide →](/guide/tools#drawing-freehand)

## A tool written by hand

Drawing competes with selecting for the same pointer events. Tools are how that is separated, and application tools register through the call the built-in ones use.

<Demo id="custom-tool" />

[Tools guide →](/guide/tools)

## Editing text

The session lives in the core; what is on screen while it is open does not. The toggle swaps the stock dialog for an inline panel written for this page, at runtime.

<Demo id="text-editing" />

[Editing text guide →](/guide/text-editing)

## Snapping

Object edges and centres take priority over the grid. Hold <kbd>Alt</kbd> while dragging to suspend it.

<Demo id="snapping" />

[History and snapping guide →](/guide/editing)

## Documents and export

The JSON pane is the document as it would be stored, updating live. Save and open it as a `.hcanvas` file, or export to PNG at any scale or to SVG — where every shape, including the custom ones, contributes its own outline.

<Demo id="documents" />

[Documents guide →](/guide/documents)

## What a screen reader is given

The hidden shape list and the live region are invisible by design, which makes them easy to ship broken. Here both are mirrored on screen.

<Demo id="accessibility" />

[Accessibility guide →](/guide/accessibility)

## Five thousand shapes

Panning and zooming write one transform to one element per frame regardless of shape count. The overlay node count is the number to watch.

<Demo id="performance" />

[Performance guide →](/guide/performance)
