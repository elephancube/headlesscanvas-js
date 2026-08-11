import {
  applyToPoint,
  type Bounds,
  invert,
  type Matrix,
  type OrientedBounds,
  type Vec,
} from '../../math'
import type { AnyShape, ShapeId } from '../../shape/types'
import type { HandleId } from '../controls'
import type { Editor } from '../editor'
import type { HcPointerEvent, Tool } from './types'

const MIN_SIZE = 1

interface TransformStart {
  id: ShapeId
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type State =
  | { kind: 'idle' }
  | { kind: 'pointing'; startWorld: Vec }
  | {
      kind: 'dragging'
      startWorld: Vec
      origins: Map<ShapeId, Vec>
      /** Selection box at drag start; snapping aligns this, not each shape. */
      startBounds: Bounds | null
    }
  | { kind: 'brushing'; startWorld: Vec; currentWorld: Vec; base: ShapeId[]; additive: boolean }
  | {
      kind: 'resizing'
      handle: HandleId
      starts: TransformStart[]
      startBounds: OrientedBounds
      startInverse: Matrix | null
      startTransform: Matrix | null
    }
  | { kind: 'rotating'; starts: TransformStart[]; centre: Vec; pointerOffset: number }

/**
 * The default tool: select, move, resize, rotate and marquee-select.
 *
 * Everything it changes goes through the ephemeral layer until the pointer is
 * released, so a whole gesture lands as one undoable step and no frame of it
 * rebuilds the document (spec §5.2.4).
 */
export class SelectTool implements Tool {
  readonly id = 'select'

  private state: State = { kind: 'idle' }

  constructor(private readonly editor: Editor) {}

  onExit(): void {
    this.cancel()
  }

  getBrush(): Bounds | null {
    if (this.state.kind !== 'brushing') return null
    const { startWorld, currentWorld } = this.state
    return {
      x: Math.min(startWorld.x, currentWorld.x),
      y: Math.min(startWorld.y, currentWorld.y),
      width: Math.abs(currentWorld.x - startWorld.x),
      height: Math.abs(currentWorld.y - startWorld.y),
    }
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    const { editor } = this
    const additive = event.shiftKey

    if (event.target === null) {
      editor.selection.set(additive ? editor.selection.ids : [])
      this.transition({
        kind: 'brushing',
        startWorld: event.world,
        currentWorld: event.world,
        base: [...editor.selection.ids],
        additive,
      })
      return
    }

    if (editor.getShape(event.target)?.locked) {
      editor.selection.set([event.target])
      this.transition({ kind: 'idle' })
      return
    }

    if (additive) editor.selection.add([event.target])
    else if (!editor.selection.ids.includes(event.target)) editor.selection.set([event.target])

    this.transition({ kind: 'pointing', startWorld: event.world })
  }

  /**
   * Double-clicking a shape enters it. For anything with editable text that
   * means opening an editing session; the editor decides what, if anything,
   * puts an editing surface on screen.
   */
  onDoubleClick(event: HcPointerEvent): void {
    if (event.target === null) return
    this.cancel()
    this.editor.editing.begin(event.target)
  }

  onPointerMove(event: HcPointerEvent): void {
    switch (this.state.kind) {
      case 'pointing': {
        // Promote to a drag only once the pointer actually moves, so a click
        // that happens to jitter does not create a history entry.
        const origins = new Map<ShapeId, Vec>()
        for (const id of this.editor.selection.ids) {
          const shape = this.editor.getShape(id)
          if (shape && !shape.locked) origins.set(id, { x: shape.x, y: shape.y })
        }
        const selectionBounds = this.editor.selection.getBounds()
        this.transition({
          kind: 'dragging',
          startWorld: this.state.startWorld,
          origins,
          startBounds: selectionBounds
            ? {
                x: selectionBounds.x,
                y: selectionBounds.y,
                width: selectionBounds.width,
                height: selectionBounds.height,
              }
            : null,
        })
        this.updateDrag(event.world, event.altKey)
        break
      }
      case 'dragging':
        // Alt suspends snapping, the usual escape hatch for placing something
        // that deliberately does not line up.
        this.updateDrag(event.world, event.altKey)
        break
      case 'brushing':
        this.updateBrush(event.world)
        break
      case 'resizing':
        this.updateResize(event.world, event.shiftKey)
        break
      case 'rotating':
        this.updateRotate(event.world, event.shiftKey)
        break
    }
  }

  onPointerUp(): void {
    if (this.state.kind === 'idle') return
    this.editor.commitEphemeral()
    this.editor.clearSnapGuides()
    this.transition({ kind: 'idle' })
  }

  onCancel(): void {
    this.cancel()
  }

  onKeyDown(event: KeyboardEvent): boolean | void {
    const { editor } = this
    const selected = [...editor.selection.ids]

    if (event.key === 'Escape') {
      if (this.state.kind !== 'idle') this.cancel()
      else editor.selection.clear()
      return true
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
      editor.deleteShapes(selected)
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      editor.selection.selectAll()
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      if (event.shiftKey) {
        for (const id of selected) {
          if (editor.getShape(id)?.type === 'group') editor.ungroup(id)
        }
      } else if (selected.length > 1) {
        editor.group(selected)
      }
      return true
    }

    // The keyboard route into editing. F2 is the platform convention for
    // "rename"; Enter is what people try first.
    if ((event.key === 'Enter' || event.key === 'F2') && selected.length === 1) {
      if (editor.editing.begin(selected[0]!)) return true
    }

    const delta = arrowDelta(event.key)
    if (delta && selected.length > 0) {
      const step = event.shiftKey ? 10 : 1
      editor.nudgeSelection({ x: delta.x * step, y: delta.y * step })
      return true
    }
  }

  onHandlePointerDown(handle: HandleId, event: HcPointerEvent): void {
    const { editor } = this
    const ids = editor.selection.ids.filter((id) => !editor.getShape(id)?.locked)
    const bounds = editor.selection.getBounds()
    if (ids.length === 0 || !bounds) return

    const starts: TransformStart[] = []
    for (const id of ids) {
      const shape = editor.getShape(id)
      if (shape) {
        starts.push({
          id,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          rotation: shape.rotation,
        })
      }
    }
    if (starts.length === 0) return

    if (handle === 'rotate') {
      const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      this.transition({
        kind: 'rotating',
        starts,
        centre,
        pointerOffset: Math.atan2(event.world.y - centre.y, event.world.x - centre.x),
      })
      return
    }

    // A single shape resizes in its own rotated frame; a multi-selection
    // resizes against its axis-aligned box.
    const startTransform = starts.length === 1 ? editor.getWorldTransform(starts[0]!.id) : null
    this.transition({
      kind: 'resizing',
      handle,
      starts,
      startBounds: bounds,
      startInverse: startTransform ? invert(startTransform) : null,
      startTransform,
    })
  }

  onHandleNudge(handle: HandleId, delta: Vec): void {
    const { editor } = this
    const ids = editor.selection.ids.filter((id) => !editor.getShape(id)?.locked)
    if (ids.length !== 1) return
    const id = ids[0]!
    const shape = editor.getShape(id)
    if (!shape) return

    if (handle === 'rotate') {
      editor.updateShape(id, { rotation: shape.rotation + delta.x * 0.05 })
      return
    }
    editor.transact(() => editor.updateShape(id, resizeRect(shape, handle, delta)), {
      mergeKey: `resize:${handle}`,
    })
  }

  // --- internals -----------------------------------------------------------

  private transition(next: State): void {
    this.state = next
    this.editor.tools.setState(next.kind)
  }

  private cancel(): void {
    if (this.state.kind === 'idle') return
    this.editor.clearEphemeral()
    this.editor.clearSnapGuides()
    this.transition({ kind: 'idle' })
  }

  private updateDrag(world: Vec, disableSnapping = false): void {
    if (this.state.kind !== 'dragging') return
    const { startWorld, origins, startBounds } = this.state
    let dx = world.x - startWorld.x
    let dy = world.y - startWorld.y

    if (!disableSnapping && startBounds) {
      // Snap the selection's box as a whole rather than each shape, so a
      // multi-selection keeps its internal spacing (spec §8.6).
      const proposed = {
        x: startBounds.x + dx,
        y: startBounds.y + dy,
        width: startBounds.width,
        height: startBounds.height,
      }
      const snap = this.editor.computeSnap(proposed, new Set(origins.keys()))
      dx += snap.dx
      dy += snap.dy
    } else {
      this.editor.clearSnapGuides()
    }

    const changes = new Map<ShapeId, Partial<AnyShape>>()
    for (const [id, origin] of origins) {
      changes.set(id, { x: origin.x + dx, y: origin.y + dy })
    }
    this.editor.setEphemeral(changes)
  }

  private updateBrush(world: Vec): void {
    if (this.state.kind !== 'brushing') return
    this.state = { ...this.state, currentWorld: world }
    const brush = this.getBrush()!
    const topLeft = this.editor.viewport.worldToScreen({ x: brush.x, y: brush.y })
    const zoom = this.editor.viewport.camera.z
    const inside = this.editor.hitTestArea({
      x: topLeft.x,
      y: topLeft.y,
      width: brush.width * zoom,
      height: brush.height * zoom,
    })
    const base = this.state.additive ? this.state.base : []
    this.editor.selection.set([...new Set([...base, ...inside])])
  }

  private updateResize(world: Vec, preserveAspect: boolean): void {
    if (this.state.kind !== 'resizing') return
    const { handle, starts, startBounds, startInverse, startTransform } = this.state

    if (starts.length === 1 && startInverse && startTransform) {
      this.resizeSingle(world, preserveAspect, handle, starts[0]!, startInverse, startTransform)
      return
    }

    // Multi-selection: scale every shape's centre and size about the anchor
    // corner. Rotated children keep their rotation; their axis-aligned
    // contribution to the box therefore shifts slightly, which is the standard
    // behaviour for this operation.
    const anchorX = handle.includes('w') ? startBounds.x + startBounds.width : startBounds.x
    const anchorY = handle.includes('n') ? startBounds.y + startBounds.height : startBounds.y

    let sx = 1
    let sy = 1
    if (handle.includes('e') || handle.includes('w')) {
      sx =
        startBounds.width === 0
          ? 1
          : Math.max(MIN_SIZE, Math.abs(world.x - anchorX)) / startBounds.width
    }
    if (handle.includes('n') || handle.includes('s')) {
      sy =
        startBounds.height === 0
          ? 1
          : Math.max(MIN_SIZE, Math.abs(world.y - anchorY)) / startBounds.height
    }
    if (preserveAspect) {
      const uniform = Math.max(sx, sy)
      sx = handle.includes('e') || handle.includes('w') ? uniform : 1
      sy = handle.includes('n') || handle.includes('s') ? uniform : 1
    }

    const changes = new Map<ShapeId, Partial<AnyShape>>()
    for (const start of starts) {
      const cx = start.x + start.width / 2
      const cy = start.y + start.height / 2
      const width = Math.max(MIN_SIZE, start.width * sx)
      const height = Math.max(MIN_SIZE, start.height * sy)
      changes.set(start.id, {
        x: anchorX + (cx - anchorX) * sx - width / 2,
        y: anchorY + (cy - anchorY) * sy - height / 2,
        width,
        height,
      })
    }
    this.editor.setEphemeral(changes)
  }

  private resizeSingle(
    world: Vec,
    preserveAspect: boolean,
    handle: HandleId,
    start: TransformStart,
    startInverse: Matrix,
    startTransform: Matrix,
  ): void {
    // Work in the shape's own frame so rotation does not have to be special
    // cased, then map the resulting rectangle back out.
    const local = applyToPoint(startInverse, world)
    let left = 0
    let top = 0
    let right = start.width
    let bottom = start.height

    if (handle.includes('w')) left = local.x
    if (handle.includes('e')) right = local.x
    if (handle.includes('n')) top = local.y
    if (handle.includes('s')) bottom = local.y

    let width = Math.max(MIN_SIZE, right - left)
    let height = Math.max(MIN_SIZE, bottom - top)

    const shape = this.editor.getShape(start.id)
    const util = shape ? this.editor.registry.get(shape.type) : undefined
    if (preserveAspect || util?.preserveAspectRatio) {
      const ratio = start.width / start.height
      if (width / height > ratio) width = height * ratio
      else height = width / ratio
      if (handle.includes('w')) left = right - width
      if (handle.includes('n')) top = bottom - height
    }

    const centreWorld = applyToPoint(startTransform, { x: left + width / 2, y: top + height / 2 })
    const changes: Partial<AnyShape> = {
      x: centreWorld.x - width / 2,
      y: centreWorld.y - height / 2,
      width,
      height,
    }

    const propChanges = shape ? util?.onResize?.(shape, { width, height }) : undefined
    if (shape && propChanges && Object.keys(propChanges).length > 0) {
      ;(changes as { props?: unknown }).props = {
        ...(shape.props as object),
        ...(propChanges as object),
      }
    }

    this.editor.setEphemeral(new Map([[start.id, changes]]))
  }

  private updateRotate(world: Vec, snap: boolean): void {
    if (this.state.kind !== 'rotating') return
    const { centre, pointerOffset, starts } = this.state

    let delta = Math.atan2(world.y - centre.y, world.x - centre.x) - pointerOffset
    if (snap) {
      const increment = Math.PI / 12 // 15 degrees
      delta = Math.round(delta / increment) * increment
    }

    const cos = Math.cos(delta)
    const sin = Math.sin(delta)
    const changes = new Map<ShapeId, Partial<AnyShape>>()

    for (const start of starts) {
      // Each shape spins about its own centre, and that centre orbits the
      // selection centre.
      const dx = start.x + start.width / 2 - centre.x
      const dy = start.y + start.height / 2 - centre.y
      changes.set(start.id, {
        rotation: start.rotation + delta,
        x: centre.x + dx * cos - dy * sin - start.width / 2,
        y: centre.y + dx * sin + dy * cos - start.height / 2,
      })
    }
    this.editor.setEphemeral(changes)
  }
}

function arrowDelta(key: string): Vec | null {
  switch (key) {
    case 'ArrowLeft':
      return { x: -1, y: 0 }
    case 'ArrowRight':
      return { x: 1, y: 0 }
    case 'ArrowUp':
      return { x: 0, y: -1 }
    case 'ArrowDown':
      return { x: 0, y: 1 }
    default:
      return null
  }
}

function resizeRect(
  shape: AnyShape,
  handle: HandleId,
  delta: Vec,
): Pick<AnyShape, 'x' | 'y' | 'width' | 'height'> {
  let { x, y, width, height } = shape
  if (handle.includes('e')) width = Math.max(MIN_SIZE, width + delta.x)
  if (handle.includes('s')) height = Math.max(MIN_SIZE, height + delta.y)
  if (handle.includes('w')) {
    const next = Math.max(MIN_SIZE, width - delta.x)
    x += width - next
    width = next
  }
  if (handle.includes('n')) {
    const next = Math.max(MIN_SIZE, height - delta.y)
    y += height - next
    height = next
  }
  return { x, y, width, height }
}
