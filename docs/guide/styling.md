# Styling the controls

This is Level 2 of three: keep the default controls, change how they look. No JavaScript involved.

<Demo id="styling" title="Every control below is a line of CSS" />

## The contract

The class names, the `data-hc-*` attributes and the documented CSS variables are **public API**. Changing any of them is a breaking change under semver, exactly like renaming a method would be. You can build on them without worrying that a patch release will move them.

That cuts both ways: undocumented internals are not part of the contract. If a selector is not on this page or in the [CSS reference](/api/css), do not target it.

## Variables

Set these anywhere they will cascade — `:root`, the container, or a theme class.

| Variable | Default | Meaning |
|---|---|---|
| `--hc-accent` | `#3b82f6` | Selection border and handle border colour |
| `--hc-handle-size` | `10px` | Handle edge length **on screen**, at any zoom |
| `--hc-handle-border-width` | `1.5px` | Handle border |
| `--hc-selection-border-width` | `1.5px` | Selection box border |
| `--hc-rotate-distance` | `26px` | Gap between the box and the rotate handle |
| `--hc-guide-color` | `#f43f5e` | Alignment guides shown while snapping |

```css
.hc-container {
  --hc-accent: rebeccapurple;
  --hc-handle-size: 12px;
}
```

There is one more, and it goes the other way:

| Variable | Written by | Meaning |
|---|---|---|
| `--hc-zoom` | The library, every frame | Current zoom factor |

**Read it, never set it.** It is how sizes stay constant on screen while the whole overlay is scaled — see [Counter-scaling](#counter-scaling) below.

## Elements and state

| Selector | Element |
|---|---|
| `.hc-container` | The element you passed as `container` |
| `.hc-canvas` | The canvas. `aria-hidden`; everything meaningful is in the overlay |
| `.hc-overlay` | The single element carrying the viewport transform |
| `.hc-selection` | The selection box |
| `.hc-handle` | A resize or rotate handle — a real `<button>` |
| `.hc-brush` | The marquee rectangle |
| `.hc-guide` | An alignment guide during a snap |
| `.hc-a11y-list`, `.hc-a11y-live` | Visually hidden; see [Accessibility](/guide/accessibility) |

State is expressed as **data attributes rather than class names**, so you can write conditional CSS without any JavaScript to keep classes in sync:

| Attribute | On | Values |
|---|---|---|
| `data-hc-tool` | `.hc-container` | The active tool id — `select`, `hand`, `draw`, or yours |
| `data-hc-state` | `.hc-container` | `idle`, `pointing`, `dragging`, `brushing`, `resizing`, `rotating`, `panning` |
| `data-hc-selection` | `.hc-selection` | `single`, `multiple` |
| `data-hc-locked` | `.hc-selection` | Present when the selection contains a locked shape |
| `data-hc-handle` | `.hc-handle` | `nw` `n` `ne` `e` `se` `s` `sw` `w` `rotate` |
| `data-hc-guide` | `.hc-guide` | `x`, `y` |

```css
/* Round handles, with the rotate one filled */
.hc-handle {
  border-radius: 50%;
}
.hc-handle[data-hc-handle='rotate'] {
  background: var(--hc-accent);
  border-color: #fff;
}

/* Grab cursor for the hand tool, closed while panning */
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }

/* Dim the box while it is being dragged */
.hc-container[data-hc-state='dragging'] .hc-selection { opacity: 0.6; }

/* A locked selection reads differently */
.hc-selection[data-hc-locked] {
  border-style: dotted;
  border-color: #9ca3af;
}
```

## Counter-scaling

The overlay is scaled as a whole — that is invariant 3, and it is why panning costs one style write no matter how many controls are visible. The consequence is that anything inside it would scale with the zoom, including a 10px handle.

The fix is arithmetic in CSS:

```css
.hc-handle {
  width: calc(var(--hc-handle-size) / var(--hc-zoom));
  height: calc(var(--hc-handle-size) / var(--hc-zoom));
  border-width: calc(1.5px / var(--hc-zoom));
}
```

**Any length you write for an element inside the overlay needs the same division** — borders, padding, font sizes, offsets. If you skip it, the element will look right at 100% and wrong everywhere else.

The alternative — writing a corrected pixel size onto every handle from JavaScript each frame — is exactly what invariant 4 forbids, because it reintroduces the per-element work that invariant 3 removed.

## Dark mode

Nothing in the stylesheet assumes a light background. Use whatever mechanism the rest of your application uses:

```css
@media (prefers-color-scheme: dark) {
  .hc-container {
    --hc-accent: #60a5fa;
  }
  .hc-handle {
    background: #1f2937;
  }
}
```

The canvas itself is transparent, so the container's background is the document surface.

## Reduced motion

The stylesheet disables transitions on the selection box and handles under `prefers-reduced-motion: reduce`. If you add transitions of your own, honour it as well.

## When CSS is not enough

If you need different markup — a toolbar attached to the selection, labelled handles, an edge midpoint that adds a point — CSS will not get you there. That is [Level 3](/guide/custom-controls), and it does not mean giving up the interaction behaviour.
