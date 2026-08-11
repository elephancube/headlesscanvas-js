// @vitest-environment jsdom

import { Editor, type ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls } from '../src/index'

/**
 * The library's central claims are structural, not stylistic: control DOM stays
 * bounded no matter how large the document gets, and the viewport transform is
 * written once per frame rather than once per element.
 *
 * Those are exactly the kind of properties that quietly regress, so they are
 * asserted here rather than left to the benchmarks. (Frame timing itself needs
 * a real browser — that part of risk R-1 is measured in the example app.)
 */

const noop = () => {}

function stubCanvas(): void {
  const ctx = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'canvas') return undefined
        return typeof property === 'string' ? noop : undefined
      },
      set: () => true,
    },
  )
  // jsdom has no 2D context; the renderer only needs the calls to be accepted.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
}

class StubResizeObserver {
  observe = noop
  unobserve = noop
  disconnect = noop
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement
let editor: Editor

beforeEach(() => {
  stubCanvas()
  globalThis.ResizeObserver = StubResizeObserver as never
  container = document.createElement('div')
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  })
  document.body.append(container)
  editor = new Editor({ container })
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

function addShapes(count: number): ShapeId[] {
  const ids: ShapeId[] = []
  editor.transact(() => {
    for (let i = 0; i < count; i++) {
      ids.push(
        editor.createShape({
          type: 'rect',
          x: (i % 50) * 60,
          y: Math.floor(i / 50) * 60,
          width: 40,
          height: 40,
        }),
      )
    }
  })
  return ids
}

describe('invariant 1: the canvas draws no UI', () => {
  it('exposes exactly one canvas and keeps it out of the accessibility tree', () => {
    const canvases = container.querySelectorAll('canvas')
    expect(canvases).toHaveLength(1)
    expect(canvases[0]!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('invariant 2: control DOM stays bounded', () => {
  it('creates no overlay nodes while nothing is selected', async () => {
    createDefaultControls(editor)
    addShapes(500)
    await nextFrame()

    const visible = [...editor.overlayElement.querySelectorAll<HTMLElement>('*')].filter(
      (el) => !el.hidden,
    )
    expect(visible).toHaveLength(0)
  })

  it('does not grow the overlay as the document grows', async () => {
    createDefaultControls(editor)
    const few = addShapes(3)
    editor.selection.set([few[0]!])
    await nextFrame()
    const withFewShapes = editor.overlayElement.querySelectorAll('*').length

    addShapes(5000)
    editor.selection.set([few[0]!])
    await nextFrame()
    const withManyShapes = editor.overlayElement.querySelectorAll('*').length

    // 5,000 shapes, same handful of control elements.
    expect(withManyShapes).toBe(withFewShapes)
    expect(withManyShapes).toBeLessThan(20)
  })

  it('draws one box for a multi-selection rather than one per shape', async () => {
    createDefaultControls(editor)
    const ids = addShapes(40)
    editor.selection.set(ids)
    await nextFrame()

    const boxes = editor.overlayElement.querySelectorAll('.hc-selection:not([hidden])')
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.getAttribute('data-hc-selection')).toBe('multiple')
  })
})

describe('invariant 3 and 4: one transform per frame, handles counter-scaled', () => {
  it('writes the camera transform onto the overlay container only', async () => {
    createDefaultControls(editor)
    const ids = addShapes(200)
    editor.selection.set([ids[0]!])
    editor.viewport.setCamera({ x: 120, y: 80, z: 2.5 })
    await nextFrame()

    expect(editor.overlayElement.style.transform).toBe('matrix(2.5, 0, 0, 2.5, -300, -200)')

    // No descendant carries a camera-derived transform of its own; they are
    // positioned in world coordinates and inherit the container's.
    const scaled = [...editor.overlayElement.querySelectorAll<HTMLElement>('*')].filter((el) =>
      el.style.transform.includes('matrix'),
    )
    expect(scaled).toHaveLength(0)
  })

  it('publishes the zoom as a CSS variable for handles to divide by', async () => {
    createDefaultControls(editor)
    editor.viewport.setCamera({ z: 4 })
    await nextFrame()

    expect(editor.overlayElement.style.getPropertyValue('--hc-zoom')).toBe('4')
  })
})

describe('selection and controls', () => {
  it('reports handles for both single and multiple selections', () => {
    const ids = addShapes(3)

    editor.selection.set([ids[0]!])
    const single = editor.controls.getSelectionBox()!
    expect(single.isSingle).toBe(true)
    expect(single.handles.map((h) => h.id)).toContain('rotate')

    editor.selection.set(ids)
    const multiple = editor.controls.getSelectionBox()!
    expect(multiple.isSingle).toBe(false)
    expect(multiple.handles).toHaveLength(single.handles.length)
  })

  it('hides the handles when anything in the selection is locked', () => {
    const ids = addShapes(2)
    editor.updateShape(ids[0]!, { locked: true })
    editor.selection.set(ids)

    expect(editor.controls.getSelectionBox()!.handles).toHaveLength(0)
    expect(editor.controls.getSelectionBox()!.hasLocked).toBe(true)
  })

  it('follows the shape rotation for a single selection', () => {
    const [id] = addShapes(1)
    editor.updateShape(id!, { rotation: 0.5 })
    editor.selection.set([id!])
    expect(editor.controls.getSelectionBox()!.bounds.rotation).toBe(0.5)
  })

  it('falls back to an axis-aligned box for a multi-selection', () => {
    const ids = addShapes(2)
    editor.updateShape(ids[0]!, { rotation: 0.5 })
    editor.selection.set(ids)
    expect(editor.controls.getSelectionBox()!.bounds.rotation).toBe(0)
  })

  it('gives handles an accessible name and keyboard reachability', async () => {
    createDefaultControls(editor)
    const [id] = addShapes(1)
    editor.selection.set([id!])
    await nextFrame()

    const handle = editor.overlayElement.querySelector<HTMLElement>('.hc-handle')!
    expect(handle.getAttribute('aria-label')).toBeTruthy()
    expect(handle.getAttribute('tabindex')).toBe('0')
    expect(handle.getAttribute('role')).toBe('button')
  })
})

describe('accessible shape list', () => {
  it('is virtualised to the viewport instead of listing every shape', async () => {
    createDefaultControls(editor)
    addShapes(5000)
    await nextFrame()

    const items = container.querySelectorAll('.hc-a11y-list li')
    const summary = editor.controls.getA11ySummary()

    expect(summary.total).toBe(5000)
    expect(summary.visible).toBeLessThan(summary.total)
    // One entry per visible shape, plus the "N more outside the view" line.
    expect(items.length).toBe(summary.visible + 1)
  })
})

describe('interactive changes', () => {
  it('keeps committed state untouched until the interaction ends', () => {
    const [id] = addShapes(1)
    const before = editor.getShape(id!)!.x

    editor.setEphemeral(new Map([[id!, { x: before + 200 }]]))

    // What the user sees has moved; the document has not.
    expect(editor.getResolvedShape(id!)!.x).toBe(before + 200)
    expect(editor.getShape(id!)!.x).toBe(before)

    editor.commitEphemeral()
    expect(editor.getShape(id!)!.x).toBe(before + 200)
  })

  it('discards pending changes when the interaction is cancelled', () => {
    const [id] = addShapes(1)
    const before = editor.getShape(id!)!.x

    editor.setEphemeral(new Map([[id!, { x: before + 200 }]]))
    editor.clearEphemeral()

    expect(editor.getResolvedShape(id!)!.x).toBe(before)
  })
})
