# Tools

Selecting, moving, resizing, rotating, marquee selection and drawing all want the same pointer events. Resolving that with conditionals produces the kind of code where fixing one interaction breaks another. A tool is the alternative: one object owns the input at a time, and each mode is separable.

<Demo id="custom-tool" title="A rectangle tool, written for this page" />

## Switching tools

```ts
editor.tools.setCurrent('hand')
editor.tools.current      // 'hand'
editor.tools.state        // 'idle' | 'pointing' | 'dragging' | 'brushing' | ...
                          // 'resizing' | 'rotating' | 'panning' | 'editing'
editor.tools.cancel()     // abort whatever is in progress
```

Three tools ship: `select`, `hand` and `draw`, bound to <kbd>v</kbd>, <kbd>h</kbd> and <kbd>d</kbd>. All three are registered through the same public call your own tools use — being built in confers nothing.

The current tool id appears as `data-hc-tool` on the container and the state as `data-hc-state`, so cursors and other affordances are pure CSS:

```css
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }
```

## Drawing freehand

<Demo id="drawing" title="The stock draw tool" />

```ts
editor.tools.setCurrent('draw')
```

A stroke is an ordinary `path` shape. That is the whole design: it selects, resizes, serialises, migrates and exports as a vector because paths already do all of that, and the drawing tool teaches none of it.

To change how it draws, register it again with your own options. Registration is by id, so the second call replaces the first — **including the instance that is already active**, so a colour picker takes effect immediately rather than on the next tool switch:

```ts
import { DrawTool } from '@headless-canvas/core'

editor.tools.register('draw', (editor) => new DrawTool(editor, {
  color: '#2563eb',
  width: 6,
  tolerance: 1,      // simplification, in screen px
  smoothing: 1,      // 0 for straight segments; above ~1.5 the curve overshoots
  minDistance: 2,    // samples closer than this (screen px) are dropped as they arrive
}))
```

### What happens to the points

A pointer reports a sample every few milliseconds, so a two-second stroke arrives as several hundred points that look identical to a few dozen. Keeping them all would cost the document, every hit test and every export, forever. So on release the run is fitted:

1. **Simplified** with Ramer–Douglas–Peucker — a point survives only if dropping it would move the line by more than `tolerance`.
2. **Smoothed** with a Catmull-Rom spline converted exactly to cubics. Catmull-Rom passes *through* every point it is given, which is what a drawn line has to do; an approximating spline would round off the corner you actually drew.

Both run once, on release. Re-fitting the whole run every frame would make a long stroke quadratic, so what you see while the pointer is down is the raw polyline in the ephemeral layer — one stroke costs one history entry no matter how many samples it took.

Points do not have to come from the tool. A signature pad, a pen device you poll yourself, or a replay of recorded input all produce the same list of coordinates, and `strokeFromPoints` turns one into the same shape the tool would have left:

```ts
import { strokeFromPoints } from '@headless-canvas/core'

editor.createShape({ type: 'path', ...strokeFromPoints(points, { color: '#e11d48', width: 5 }) })
```

The two steps are also exposed separately as `simplifyPolyline` and `polylineToPath`.

### What it deliberately does not do

**A stroke has a single width.** Varying it with pressure is not a stroked line at all — it is a filled outline — which needs its own shape type with its own hit test and its own export. That is a v1.x concern; `pointerType` is already on every event when you want to branch on pen versus finger.

## Registering one

```ts
editor.tools.register('draw-rect', (editor) => new DrawRectTool(editor))
editor.tools.setCurrent('draw-rect')
```

A factory rather than an instance: each activation gets a fresh tool, so a half-finished interaction cannot survive a switch away and back.

## The interface

Every member is optional except `id`.

```ts
interface Tool {
  readonly id: string

  onEnter?(): void
  onExit?(): void

  onPointerDown?(event: HcPointerEvent): void
  onPointerMove?(event: HcPointerEvent): void
  onPointerUp?(event: HcPointerEvent): void
  onDoubleClick?(event: HcPointerEvent): void

  onKeyDown?(event: KeyboardEvent): boolean | void
  onKeyUp?(event: KeyboardEvent): boolean | void
  onWheel?(event: WheelEvent): boolean | void

  onCancel?(): void

  onHandlePointerDown?(handle: HandleId, event: HcPointerEvent): void
  onHandleNudge?(handle: HandleId, delta: Vec): void

  getBrush?(): Bounds | null
}
```

Pointer events arrive with the conversions already done:

```ts
interface HcPointerEvent {
  screen: Vec              // relative to the container
  world: Vec
  shiftKey, altKey, ctrlKey, metaKey: boolean
  button: number
  pointerType: string
  target: ShapeId | null   // topmost shape under the pointer
  original: PointerEvent | MouseEvent   // a MouseEvent for onDoubleClick
}
```

## Writing one

```ts
import type { Editor, HcPointerEvent, ShapeId, Tool, Vec } from '@headless-canvas/core'

class DrawRectTool implements Tool {
  readonly id = 'draw-rect'

  private origin: Vec | null = null
  private drawing: ShapeId | null = null

  constructor(private readonly editor: Editor) {}

  onPointerDown(event: HcPointerEvent): void {
    this.origin = event.world
    this.editor.tools.setState('dragging')
    this.drawing = this.editor.createShape({
      type: 'rect',
      x: event.world.x,
      y: event.world.y,
      width: 1,
      height: 1,
    })
  }

  onPointerMove(event: HcPointerEvent): void {
    if (!this.origin || !this.drawing) return
    // Ephemeral: no history entry, no immutable rebuild, once per frame.
    this.editor.setEphemeral(
      new Map([[this.drawing, {
        x: Math.min(this.origin.x, event.world.x),
        y: Math.min(this.origin.y, event.world.y),
        width: Math.max(1, Math.abs(event.world.x - this.origin.x)),
        height: Math.max(1, Math.abs(event.world.y - this.origin.y)),
      }]]),
    )
  }

  onPointerUp(): void {
    if (!this.drawing) return
    this.editor.commitEphemeral()
    this.editor.selection.set([this.drawing])
    this.reset()
  }

  onCancel(): void {
    this.editor.clearEphemeral()
    if (this.drawing) this.editor.deleteShapes([this.drawing])
    this.reset()
  }

  private reset(): void {
    this.origin = null
    this.drawing = null
    this.editor.tools.setState('idle')
  }
}
```

Three rules make the difference between a tool that behaves and one that does not.

**Write ephemeral state during a drag, commit on pointer up.** Writing committed state every frame would put hundreds of entries in the undo stack and rebuild the immutable tree sixty times a second. See [Ephemeral state](/guide/concepts#ephemeral-state).

**`onCancel` must leave nothing behind.** It runs on <kbd>Escape</kbd>, on focus loss, and on a cancelled pointer. Whatever partial shape or state exists has to go.

**Call `tools.setState()` as you change mode.** It drives `data-hc-state`, which is how a stylesheet reacts to what the tool is doing without any JavaScript.

## What the editor keeps for itself

Some behaviour is editor-level, so it works whichever tool is active and no tool has to reimplement it:

| Behaviour | Why it is not a tool's job |
|---|---|
| Middle- and right-drag panning | Every canvas application does this in every mode. Tools never see those buttons |
| <kbd>⌘Z</kbd> / <kbd>Ctrl+Y</kbd> | Undo must work everywhere, and a tool has no business overriding it |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> tool switching | Otherwise the shortcut would stop working inside your tool |
| <kbd>Escape</kbd> | Routed to `onCancel` |
| Wheel pan and <kbd>Ctrl</kbd>+wheel zoom | Runs only if the tool did not consume the event |

Returning `true` from `onKeyDown`, `onKeyUp` or `onWheel` marks the event **consumed** — the editor's own default does not then run. Returning nothing lets it through.

```ts
onKeyDown(event: KeyboardEvent): boolean | void {
  if (event.key !== 'Enter') return       // let the editor handle it
  this.commit()
  return true                             // consumed
}
```

All of this is bound to the **container**, not `window`. An unfocused editor never consumes a key, which is what makes several editors on one page — or one editor next to a text field — behave.

## Handle interactions

Pressing a handle does not bypass the tool. It arrives as `onHandlePointerDown`, and the keyboard equivalent as `onHandleNudge`. A tool that does not implement them simply has handles that do nothing, which is correct for, say, a drawing tool.

```ts
onHandlePointerDown(handle: HandleId, event: HcPointerEvent): void {
  // start a resize or rotation of your own
}
```

## Entering a shape

`onDoubleClick` is the conventional "enter this shape" gesture. The select tool's answer is to open a text editing session, but nothing about the hook says so — yours can do whatever entering means for your tool.

```ts
onDoubleClick(event: HcPointerEvent): void {
  if (event.target) this.editor.editing.begin(event.target)
}
```

The `editing` tool state is set by the editor rather than by a tool, so `data-hc-state='editing'` is available whichever tool is active. See [Editing text](/guide/text-editing).

## Marquee rectangles

If your tool draws a selection rectangle, expose it through `getBrush()` in world coordinates. The control layer renders it — `editor.getBrush()` delegates to the active tool, and the default UI draws `.hc-brush` from it.
