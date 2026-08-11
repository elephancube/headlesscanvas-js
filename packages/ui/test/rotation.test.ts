// @vitest-environment jsdom

import type { Editor, ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls } from '../src/index'
import { createEditor, firePointer, nextFrame } from './harness'

/**
 * Where the selection UI sits once something has been rotated.
 *
 * `OrientedBounds` reports the box *before* rotation, with the rotation applied
 * about its centre. Both consumers depend on that reading: the default UI maps
 * it straight onto a CSS transform whose origin is the element's centre, and
 * the select tool derives the rotation pivot from it. Reporting the already
 * rotated corner instead agrees with the contract at rotation 0 and diverges
 * everywhere else — so nothing looks wrong until the first turn, which is why
 * these assertions exist at a non-zero angle.
 */

let editor: Editor
let container: HTMLDivElement
let controls: { dispose(): void }

beforeEach(() => {
  ;({ editor, container } = createEditor())
  controls = createDefaultControls(editor, { accessibleList: false })
})

afterEach(() => {
  controls.dispose()
  editor.dispose()
  container.remove()
})

const centreOf = (id: ShapeId) => {
  const shape = editor.getResolvedShape(id)!
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
}

function addRect(rotation = 0): ShapeId {
  return editor.createShape({ type: 'rect', x: 100, y: 80, width: 200, height: 120, rotation })
}

describe('bounds of a rotated shape', () => {
  it('keeps the box centred on the shape at any angle', () => {
    const id = addRect()
    const centre = centreOf(id)

    for (const rotation of [0, 0.3, Math.PI / 2, 2.2, -1.1]) {
      editor.updateShape(id, { rotation })
      const bounds = editor.getShapeBounds(id)!

      // The box is reported before rotation, so its centre is the shape's
      // centre whatever the angle — the pivot both the CSS transform and the
      // rotate handle assume.
      expect(bounds.x + bounds.width / 2).toBeCloseTo(centre.x, 6)
      expect(bounds.y + bounds.height / 2).toBeCloseTo(centre.y, 6)
      expect(bounds.rotation).toBeCloseTo(rotation, 6)
    }
  })

  it('reports the same box in screen space', () => {
    const id = addRect(0.6)
    editor.viewport.setCamera({ x: 40, y: 25, z: 2 })

    const world = editor.getShapeBounds(id, 'world')!
    const screen = editor.getShapeBounds(id, 'screen')!
    const expected = editor.viewport.worldToScreen({
      x: world.x + world.width / 2,
      y: world.y + world.height / 2,
    })

    expect(screen.x + screen.width / 2).toBeCloseTo(expected.x, 6)
    expect(screen.y + screen.height / 2).toBeCloseTo(expected.y, 6)
    expect(screen.rotation).toBeCloseTo(world.rotation, 6)
  })

  it('places the selection element over the shape after a rotation', async () => {
    const id = addRect(0.9)
    editor.selection.set([id])
    await nextFrame()

    const element = container.querySelector<HTMLElement>('.hc-selection')!
    const bounds = editor.getShapeBounds(id)!
    const shape = editor.getShape(id)!

    // The default UI writes translate(x, y) with a centre transform-origin, so
    // the untransformed element must land on the shape's own x/y for the
    // rotation to spin it about the right point.
    expect(element.style.transform).toBe(
      `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`,
    )
    expect(bounds.x).toBeCloseTo(shape.x, 6)
    expect(bounds.y).toBeCloseTo(shape.y, 6)
  })
})

describe('rotating with the handle', () => {
  it('turns the shape about its own centre', () => {
    const id = addRect()
    editor.selection.set([id])
    const before = centreOf(id)

    const centreScreen = editor.viewport.worldToScreen(before)
    editor.beginHandleInteraction('rotate', {
      clientX: centreScreen.x,
      clientY: centreScreen.y - 100,
      button: 0,
      pointerId: 1,
    } as PointerEvent)
    firePointer(window, 'pointermove', { x: centreScreen.x + 100, y: centreScreen.y })
    firePointer(window, 'pointerup', { x: centreScreen.x + 100, y: centreScreen.y })

    expect(editor.getShape(id)!.rotation).toBeCloseTo(Math.PI / 2, 3)
    expect(centreOf(id).x).toBeCloseTo(before.x, 3)
    expect(centreOf(id).y).toBeCloseTo(before.y, 3)
  })

  /**
   * The pivot comes from the same bounds, so a second drag starting from a
   * non-zero angle is the case that catches a corner-anchored box: the shape
   * would orbit the wrong point and drift across the canvas.
   */
  it('does not drift when rotated a second time', () => {
    const id = addRect(0.8)
    editor.selection.set([id])
    const before = centreOf(id)

    const centreScreen = editor.viewport.worldToScreen(before)
    editor.beginHandleInteraction('rotate', {
      clientX: centreScreen.x,
      clientY: centreScreen.y - 100,
      button: 0,
      pointerId: 1,
    } as PointerEvent)
    firePointer(window, 'pointermove', { x: centreScreen.x + 80, y: centreScreen.y + 80 })
    firePointer(window, 'pointerup', { x: centreScreen.x + 80, y: centreScreen.y + 80 })

    expect(centreOf(id).x).toBeCloseTo(before.x, 3)
    expect(centreOf(id).y).toBeCloseTo(before.y, 3)
  })

  it('nudges by keyboard about the centre too', () => {
    const id = addRect(0.5)
    editor.selection.set([id])
    const before = centreOf(id)

    editor.nudgeHandle('rotate', { x: 1, y: 0 })

    expect(editor.getShape(id)!.rotation).toBeGreaterThan(0.5)
    expect(centreOf(id).x).toBeCloseTo(before.x, 6)
    expect(centreOf(id).y).toBeCloseTo(before.y, 6)
  })
})
