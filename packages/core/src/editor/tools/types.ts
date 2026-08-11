import type { Bounds, Vec } from '../../math'
import type { ShapeId } from '../../shape/types'
import type { HandleId } from '../controls'

/**
 * The interaction states a tool can report.
 *
 * These surface as `data-hc-state` on the container, so a stylesheet can react
 * to them without any JavaScript (spec §7.3).
 */
export type ToolState =
  | 'idle'
  | 'pointing'
  | 'dragging'
  | 'brushing'
  | 'resizing'
  | 'rotating'
  | 'panning'
  /** A shape's text is being edited. Set by the editor, not by a tool. */
  | 'editing'

/** A pointer event with the coordinate conversions already done. */
export interface HcPointerEvent {
  /** Relative to the container's top-left. */
  screen: Vec
  world: Vec
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  button: number
  pointerType: string
  /** Topmost shape under the pointer, or null. */
  target: ShapeId | null
  /** A `MouseEvent` for `onDoubleClick`, a `PointerEvent` everywhere else. */
  original: PointerEvent | MouseEvent
}

/**
 * A tool interprets pointer and keyboard input.
 *
 * Selecting, moving, resizing, rotating, marquee selection and drawing all
 * compete for the same events, and resolving that with conditionals produces
 * code nobody can safely change. Modelling each mode as a tool with its own
 * state keeps the interactions separable — and makes the extension point for
 * application-specific tools fall out for free (spec §5.8.2).
 *
 * Returning `true` from a keyboard or wheel handler marks the event consumed,
 * so the editor's own defaults do not also run.
 */
export interface Tool {
  readonly id: string

  onEnter?(): void
  onExit?(): void

  onPointerDown?(event: HcPointerEvent): void
  onPointerMove?(event: HcPointerEvent): void
  onPointerUp?(event: HcPointerEvent): void
  /** Conventionally "enter" the shape under the pointer — text editing, say. */
  onDoubleClick?(event: HcPointerEvent): void

  onKeyDown?(event: KeyboardEvent): boolean | void
  onKeyUp?(event: KeyboardEvent): boolean | void
  onWheel?(event: WheelEvent): boolean | void

  /** Escape, focus loss, or a cancelled pointer. Must leave no partial state. */
  onCancel?(): void

  /** A control handle was pressed. Implemented by tools that transform shapes. */
  onHandlePointerDown?(handle: HandleId, event: HcPointerEvent): void
  /** Keyboard equivalent of dragging a handle. */
  onHandleNudge?(handle: HandleId, delta: Vec): void

  /** The marquee rectangle in world space, when one is active. */
  getBrush?(): Bounds | null
}
