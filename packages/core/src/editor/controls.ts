import type { OrientedBounds, Vec } from '../math'
import type { ShapeId } from '../shape/types'
import type { Editor } from './editor'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'

export const RESIZE_HANDLES: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export interface HandleDescriptor {
  id: HandleId
  /** Position within the selection box, 0..1 on each axis. */
  position: Vec
  cursor: string
  /** Already resolved through the message table. */
  label: string
}

export interface SelectionBoxDescriptor {
  /** World-space box. Follows the shape's rotation when one shape is selected. */
  bounds: OrientedBounds
  isSingle: boolean
  hasLocked: boolean
  handles: readonly HandleDescriptor[]
}

export interface A11yShapeDescriptor {
  id: ShapeId
  label: string
  selected: boolean
  locked: boolean
}

const HANDLE_POSITIONS: Record<HandleId, Vec> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
  rotate: { x: 0.5, y: 0 },
}

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  rotate: 'grab',
}

/**
 * The headless half of the control UI.
 *
 * This exists because the default UI is not React-specific. If the interaction
 * logic lived in the `ui` package, the React adapter and anyone building their
 * own controls would each need their own copy of it; keeping it here means the
 * default UI, the React bindings and hand-written markup all drive the same
 * implementation (spec §6.2).
 *
 * Nothing in here creates or owns DOM. It reports what should be drawn, and
 * `bindHandle` turns an element the caller already has into a working handle.
 */
export class Controls {
  constructor(private readonly editor: Editor) {}

  /**
   * What the selection UI should look like right now, or null when nothing is
   * selected — which is also the reason no control DOM exists in that case
   * (invariant 2).
   */
  getSelectionBox(): SelectionBoxDescriptor | null {
    const ids = this.editor.selection.ids
    if (ids.length === 0) return null

    const bounds = this.editor.selection.getBounds()
    if (!bounds) return null

    const isSingle = ids.length === 1
    let hasLocked = false
    for (const id of ids) {
      if (this.editor.getShape(id)?.locked) hasLocked = true
    }

    const handles: HandleDescriptor[] = []
    if (!hasLocked) {
      for (const id of RESIZE_HANDLES) {
        handles.push(this.describe(id))
      }
      // A shape can opt out of rotation; a multi-selection always allows it.
      const shape = isSingle ? this.editor.getShape(ids[0]!) : undefined
      const util = shape ? this.editor.registry.get(shape.type) : undefined
      if (!isSingle || util?.canRotate !== false) {
        handles.push(this.describe('rotate'))
      }
    }

    return { bounds, isSingle, hasLocked, handles }
  }

  private describe(id: HandleId): HandleDescriptor {
    return {
      id,
      position: HANDLE_POSITIONS[id],
      cursor: HANDLE_CURSORS[id],
      label: this.editor.message(`handle.${id}` as const),
    }
  }

  /**
   * Make `element` behave as the given handle: pointer capture, keyboard
   * nudging, and the ARIA attributes that let it be reached by tab.
   *
   * Returns a function that detaches everything.
   */
  bindHandle(element: HTMLElement, handle: HandleId): () => void {
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', this.editor.message(`handle.${handle}` as const))
    element.setAttribute('data-hc-handle', handle)
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0')
    element.style.pointerEvents = 'auto'
    element.style.touchAction = 'none'

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      // Stop the surface handler from also starting a drag or a selection box.
      event.stopPropagation()
      event.preventDefault()
      element.setPointerCapture(event.pointerId)
      this.editor.beginHandleInteraction(handle, event)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1
      const delta = keyToDelta(event.key)
      if (!delta) return
      event.preventDefault()
      this.editor.nudgeHandle(handle, { x: delta.x * step, y: delta.y * step })
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('keydown', onKeyDown)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('keydown', onKeyDown)
    }
  }

  /**
   * Shapes for the visually hidden list that screen readers walk.
   *
   * Only what is on screen is reported. Emitting all 5,000 shapes would put
   * 5,000 nodes in the DOM and defeat the point of keeping the node count
   * bounded; restricting it to the viewport also happens to match what a
   * sighted user is being told about (spec §10.1).
   */
  getA11yShapeDescriptors(): A11yShapeDescriptor[] {
    const selected = new Set(this.editor.selection.ids)
    const out: A11yShapeDescriptor[] = []
    for (const id of this.editor.getVisibleShapeIds()) {
      const shape = this.editor.getShape(id)
      if (!shape) continue
      const util = this.editor.registry.get(shape.type)
      out.push({
        id,
        label: util?.getAccessibleLabel?.(shape) ?? shape.type,
        selected: selected.has(id),
        locked: shape.locked,
      })
    }
    return out
  }

  getA11ySummary(): { total: number; visible: number } {
    return {
      total: this.editor.getSnapshot().shapes.size,
      visible: this.editor.getVisibleShapeIds().length,
    }
  }
}

function keyToDelta(key: string): Vec | null {
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
