# CSS contract

The class names, `data-hc-*` attributes and CSS variables on this page are **public API**. Changing one is a breaking change under semver, exactly as renaming a method would be.

Anything not listed here is internal, whatever it looks like in the stylesheet.

```ts
import '@headless-canvas/ui/styles.css'
```

The stylesheet is a separate file rather than injected at runtime. Runtime injection produces a flash of unstyled controls during SSR hydration, breaks under a strict CSP, and leaves dead CSS in the bundle for anyone replacing the default UI outright.

## Variables you set

| Variable | Default | Applies to |
|---|---|---|
| `--hc-accent` | `#3b82f6` | Selection border, handle border, focus ring |
| `--hc-handle-size` | `10px` | Handle edge length on screen |
| `--hc-handle-border-width` | `1.5px` | Handle border |
| `--hc-selection-border-width` | `1.5px` | Selection box border |
| `--hc-rotate-distance` | `26px` | Offset of the rotate handle above the box |
| `--hc-guide-color` | `#f43f5e` | Alignment guides |

Declared on `.hc-container`, so setting them anywhere that cascades to it works.

## Variables the library writes

| Variable | Value |
|---|---|
| `--hc-zoom` | The current zoom factor |

**Read-only.** Written to `.hc-overlay` on every frame the camera changes, so it is available to the overlay and everything inside it — which is exactly the scope that needs it. Divide by it for any length there; see [Counter-scaling](/guide/styling#counter-scaling).

## Classes

| Class | Element |
|---|---|
| `.hc-container` | The element passed as `container`. `role="application"`, focusable |
| `.hc-canvas` | The canvas. `aria-hidden="true"` |
| `.hc-overlay` | The single element carrying the viewport transform. `pointer-events: none` |
| `.hc-selection` | The selection box |
| `.hc-handle` | A resize or rotate handle. A `<button>` with `role="button"` |
| `.hc-brush` | The marquee rectangle |
| `.hc-guide` | An alignment guide during a snap |
| `.hc-a11y-list` | The visually hidden shape list |
| `.hc-a11y-live` | The `aria-live` region |
| `.hc-text-dialog` | The text editing `<dialog>`. Style `::backdrop` here |
| `.hc-text-form` | The form inside it |
| `.hc-text-label` | Label wrapping the field |
| `.hc-text-input` | The `<textarea>` |
| `.hc-text-actions` | The button row |
| `.hc-text-button` | A dialog button |

## Data attributes

State is expressed as data attributes rather than class names, so conditional styling needs no JavaScript to keep classes in sync. Attributes that would always be present are deliberately absent — a redundant attribute is noise in every selector that has to skip it.

| Attribute | On | Values |
|---|---|---|
| `data-hc-tool` | `.hc-container` | The active tool id: `select`, `hand`, `draw`, or your own |
| `data-hc-state` | `.hc-container` | `idle` `pointing` `dragging` `brushing` `resizing` `rotating` `panning` `editing` |
| `data-hc-selection` | `.hc-selection` | `single` `multiple` |
| `data-hc-locked` | `.hc-selection` | Present when the selection contains a locked shape |
| `data-hc-handle` | `.hc-handle` | `nw` `n` `ne` `e` `se` `s` `sw` `w` `rotate` |
| `data-hc-guide` | `.hc-guide` | `x` `y` |
| `data-hc-text-action` | `.hc-text-button` | `save` `cancel` |

## Recipes

```css
/* Circular handles with a filled rotate handle */
.hc-handle { border-radius: 50%; }
.hc-handle[data-hc-handle='rotate'] {
  background: var(--hc-accent);
  border-color: #fff;
}

/* Cursors driven entirely by the tool state */
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }

/* Fade the controls while dragging so they do not obscure the shape */
.hc-container[data-hc-state='dragging'] .hc-selection { opacity: 0.5; }

/* A locked selection reads differently */
.hc-selection[data-hc-locked] {
  border-style: dotted;
  border-color: #9ca3af;
}

/* Larger hit area than the visible handle, without changing how it looks */
.hc-handle::before {
  content: '';
  position: absolute;
  inset: calc(-6px / var(--hc-zoom));
}

/* The editing dialog. It is not inside the overlay, so no counter-scaling. */
.hc-text-dialog::backdrop { background: rgb(0 0 0 / 60%); }
.hc-text-button[data-hc-text-action='save'] { background: rebeccapurple; }
.hc-container[data-hc-state='editing'] .hc-selection { opacity: 0.4; }

/* Dark theme */
@media (prefers-color-scheme: dark) {
  .hc-container { --hc-accent: #60a5fa; }
  .hc-handle { background: #1f2937; }
}
```

## What the stylesheet already handles

- **Counter-scaling.** Every length in it is divided by `--hc-zoom`
- **Focus rings.** `:focus-visible` on the container and on each handle
- **Reduced motion.** Transitions on the selection box and handles are disabled under `prefers-reduced-motion: reduce`
- **Screen-reader visibility.** The hidden list's buttons become visible when focused, because a focused control nobody can see is its own failure

If you replace the stylesheet outright, all four are yours to reproduce.
