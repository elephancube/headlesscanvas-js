// @vitest-environment jsdom
import type { Editor } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls } from '../src/index'
import { addRects, createEditor, drag, fireKey, firePointer, nextFrame } from './harness'

/**
 * Undo/redo and snapping driven through real interactions rather than through
 * their units. Both features only pay off if they line up with the gesture
 * boundaries the user perceives, and that is a property of the wiring.
 */

let editor: Editor
let container: HTMLElement

beforeEach(() => {
  ;({ editor, container } = createEditor())
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

describe('undo through interactions', () => {
  it('treats a whole drag as one step', () => {
    const ids = addRects(editor, 1)

    drag(container, { x: 10, y: 10 }, { x: 210, y: 110 })
    expect(editor.getShape(ids[0]!)!.x).toBeCloseTo(200)

    editor.history.undo()

    // Not one step per frame of the drag (spec §5.2.4).
    expect(editor.getShape(ids[0]!)!.x).toBe(0)
  })

  it('restores a deletion', () => {
    const ids = addRects(editor, 3)
    editor.selection.set([ids[0]!])

    fireKey(container, 'Delete')
    expect(editor.getSnapshot().shapes.size).toBe(2)

    editor.history.undo()
    expect(editor.getSnapshot().shapes.size).toBe(3)
  })

  it('undoes a group and puts the children back where they were', () => {
    const ids = addRects(editor, 3)
    const before = ids.map((id) => editor.getShapeBounds(id)!.x)
    editor.selection.set(ids)

    fireKey(container, 'g', { ctrlKey: true })
    expect(editor.getChildren(null)).toHaveLength(1)

    editor.history.undo()

    expect(editor.getChildren(null)).toHaveLength(3)
    expect(ids.map((id) => editor.getShapeBounds(id)!.x)).toEqual(before)
  })

  it('collapses a run of arrow-key nudges', () => {
    const ids = addRects(editor, 1)
    editor.selection.set([ids[0]!])

    for (let i = 0; i < 5; i++) fireKey(container, 'ArrowRight')
    expect(editor.getShape(ids[0]!)!.x).toBe(5)

    editor.history.undo()
    expect(editor.getShape(ids[0]!)!.x).toBe(0)
  })

  it('responds to the keyboard shortcuts', () => {
    const ids = addRects(editor, 1)
    drag(container, { x: 10, y: 10 }, { x: 110, y: 10 })

    fireKey(container, 'z', { ctrlKey: true })
    expect(editor.getShape(ids[0]!)!.x).toBe(0)

    fireKey(container, 'z', { ctrlKey: true, shiftKey: true })
    expect(editor.getShape(ids[0]!)!.x).toBeCloseTo(100)
  })

  it('works whichever tool is active', () => {
    const ids = addRects(editor, 1)
    drag(container, { x: 10, y: 10 }, { x: 110, y: 10 })

    editor.tools.setCurrent('hand')
    fireKey(container, 'z', { ctrlKey: true })

    expect(editor.getShape(ids[0]!)!.x).toBe(0)
  })

  it('does not record a cancelled drag', () => {
    const ids = addRects(editor, 1)
    const depth = editor.history.getSize().undo

    firePointer(container, 'pointerdown', { x: 10, y: 10 })
    firePointer(window, 'pointermove', { x: 200, y: 200 })
    fireKey(container, 'Escape')

    expect(editor.getShape(ids[0]!)!.x).toBe(0)
    // The selection change counts, but the abandoned move does not.
    expect(editor.history.getSize().undo).toBeLessThanOrEqual(depth + 1)
  })
})

describe('snapping through interactions', () => {
  it('aligns a dragged shape with a stationary one', () => {
    const ids = addRects(editor, 2, 40, 200)
    // Shapes start at (0,0) and (200,0). Drop the second one three units shy of
    // sharing the first one's left edge.
    editor.selection.set([ids[1]!])
    drag(container, { x: 210, y: 10 }, { x: 13, y: 310 })

    expect(editor.getShape(ids[1]!)!.x).toBe(0)
  })

  it('reports guides while the snap is active, and clears them after', () => {
    const ids = addRects(editor, 2, 40, 200)
    editor.selection.set([ids[1]!])

    firePointer(container, 'pointerdown', { x: 210, y: 10 })
    firePointer(window, 'pointermove', { x: 13, y: 310 })
    expect(editor.getSnapGuides().length).toBeGreaterThan(0)

    firePointer(window, 'pointerup', { x: 13, y: 310 })
    expect(editor.getSnapGuides()).toHaveLength(0)
  })

  it('suspends with the Alt key', () => {
    const ids = addRects(editor, 2, 40, 200)
    editor.selection.set([ids[1]!])

    firePointer(container, 'pointerdown', { x: 210, y: 10 })
    const move = new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 13,
      clientY: 310,
      altKey: true,
    }) as MouseEvent & { pointerId: number; pointerType: string }
    move.pointerId = 1
    move.pointerType = 'mouse'
    window.dispatchEvent(move)
    firePointer(window, 'pointerup', { x: 13, y: 310 })

    // Alt is the escape hatch for placing something that should not line up.
    expect(editor.getShape(ids[1]!)!.x).toBeCloseTo(3)
  })

  it('can be switched off', () => {
    editor.setSnapping({ enabled: false })
    const ids = addRects(editor, 2, 40, 200)
    editor.selection.set([ids[1]!])

    drag(container, { x: 210, y: 10 }, { x: 13, y: 310 })

    expect(editor.getShape(ids[1]!)!.x).toBeCloseTo(3)
  })

  it('snaps to a grid when one is configured', () => {
    editor.setSnapping({ grid: 25, toObjects: false, thresholdPx: 8 })
    const ids = addRects(editor, 1)

    drag(container, { x: 10, y: 10 }, { x: 33, y: 10 })

    expect(editor.getShape(ids[0]!)!.x).toBe(25)
  })

  it('draws the guides in the overlay', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 2, 40, 200)
    editor.selection.set([ids[1]!])

    firePointer(container, 'pointerdown', { x: 210, y: 10 })
    firePointer(window, 'pointermove', { x: 13, y: 310 })
    await nextFrame()

    const guides = [...editor.overlayElement.querySelectorAll<HTMLElement>('.hc-guide')].filter(
      (element) => !element.hidden,
    )
    expect(guides.length).toBeGreaterThan(0)

    firePointer(window, 'pointerup', { x: 13, y: 310 })
    await nextFrame()
    const after = [...editor.overlayElement.querySelectorAll<HTMLElement>('.hc-guide')].filter(
      (element) => !element.hidden,
    )
    expect(after).toHaveLength(0)
  })
})
