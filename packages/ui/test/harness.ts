import { Editor, type EditorOptions, type ShapeId } from '@headless-canvas/core'

/**
 * jsdom harness.
 *
 * jsdom has no 2D context and no ResizeObserver, so both are stubbed. The
 * renderer only needs its calls to be accepted — these tests assert on state
 * and on the DOM overlay, never on pixels.
 */

const noop = () => {}

export function stubCanvas(): void {
  const ctx = new Proxy(
    {
      measureText: () => ({ width: 0 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    },
    {
      get: (target, property) => {
        if (property in target) return (target as Record<string | symbol, unknown>)[property]
        return typeof property === 'string' ? noop : undefined
      },
      set: () => true,
    },
  )
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
}

class StubResizeObserver {
  observe = noop
  unobserve = noop
  disconnect = noop
}

export function installStubs(): void {
  stubCanvas()
  globalThis.ResizeObserver = StubResizeObserver as never
  // jsdom implements neither pointer capture nor PointerEvent.
  HTMLElement.prototype.setPointerCapture = noop as never
  HTMLElement.prototype.releasePointerCapture = noop as never
  HTMLElement.prototype.hasPointerCapture = (() => false) as never
}

export interface PointerInit {
  x: number
  y: number
  button?: number
  shiftKey?: boolean
  ctrlKey?: boolean
}

/** Dispatch a pointer event jsdom can build, with the fields the editor reads. */
export function firePointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: PointerInit,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
  }) as MouseEvent & { pointerId: number; pointerType: string }
  event.pointerId = 1
  event.pointerType = 'mouse'
  target.dispatchEvent(event)
}

/** A press, some movement and a release, as the editor would see them. */
export function drag(container: HTMLElement, from: PointerInit, to: PointerInit): void {
  firePointer(container, 'pointerdown', from)
  firePointer(window, 'pointermove', { ...to, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 })
  firePointer(window, 'pointermove', to)
  firePointer(window, 'pointerup', to)
}

export function fireKey(target: EventTarget, key: string, init: Partial<KeyboardEventInit> = {}) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
}

export function createContainer(width = 800, height = 600): HTMLDivElement {
  const container = document.createElement('div')
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
    }),
  })
  document.body.append(container)
  return container
}

export function createEditor(options: Partial<EditorOptions> = {}): {
  editor: Editor
  container: HTMLDivElement
} {
  installStubs()
  const container = createContainer()
  const editor = new Editor({ container, ...options })
  return { editor, container }
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function addRects(editor: Editor, count: number, size = 40, gap = 60): ShapeId[] {
  const ids: ShapeId[] = []
  editor.transact(() => {
    for (let i = 0; i < count; i++) {
      ids.push(
        editor.createShape({
          type: 'rect',
          x: (i % 50) * gap,
          y: Math.floor(i / 50) * gap,
          width: size,
          height: size,
        }),
      )
    }
  })
  return ids
}
