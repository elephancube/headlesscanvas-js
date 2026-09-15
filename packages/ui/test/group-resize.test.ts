// @vitest-environment jsdom

import type { Editor, ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls } from '../src/index'
import { createEditor, firePointer } from './harness'

/**
 * Resizing a group resizes what is inside it.
 *
 * The model carries no scale — a shape's transform is a translation and a
 * rotation, and nothing else (spec §5.3.3). That is what makes grouping and
 * ungrouping exact, and it also means a group cannot resize its children by
 * growing its own box: there is nowhere for the factor to live. The resize has
 * to be distributed to the descendants explicitly, and these tests are what say
 * so — without them the handles move, the selection box follows, and the
 * drawing sits perfectly still.
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

/** Two rectangles side by side, grouped. The group's box is 0,0 200x100. */
function twoInAGroup(): { group: ShapeId; left: ShapeId; right: ShapeId } {
  const left = editor.createShape({ type: 'rect', x: 0, y: 0, width: 100, height: 100 })
  const right = editor.createShape({ type: 'rect', x: 100, y: 0, width: 100, height: 100 })
  const group = editor.group([left, right])
  if (group === null) throw new Error('expected a group')
  return { group, left, right }
}

/** Drag a handle from where it currently is to a world point. */
function dragHandle(handle: 'se' | 'e', to: { x: number; y: number }): void {
  const bounds = editor.selection.getBounds()
  if (!bounds) throw new Error('nothing selected')
  const corner = {
    x: bounds.x + bounds.width,
    y: handle === 'se' ? bounds.y + bounds.height : bounds.y + bounds.height / 2,
  }
  const from = editor.viewport.worldToScreen(corner)
  const target = editor.viewport.worldToScreen(to)

  editor.beginHandleInteraction(handle, {
    clientX: from.x,
    clientY: from.y,
    button: 0,
    pointerId: 1,
  } as PointerEvent)
  firePointer(window, 'pointermove', { x: target.x, y: target.y })
  firePointer(window, 'pointerup', { x: target.x, y: target.y })
}

describe('resizing a group', () => {
  it('scales the children with it', () => {
    const { group, left, right } = twoInAGroup()
    editor.selection.set([group])

    // 200x100 -> 400x200.
    dragHandle('se', { x: 400, y: 200 })

    expect(editor.getShape(group)!.width).toBeCloseTo(400, 3)
    expect(editor.getShape(group)!.height).toBeCloseTo(200, 3)

    const a = editor.getShape(left)!
    expect(a.x).toBeCloseTo(0, 3)
    expect(a.width).toBeCloseTo(200, 3)
    expect(a.height).toBeCloseTo(200, 3)

    // The second child has to move as well as grow, or the two overlap.
    const b = editor.getShape(right)!
    expect(b.x).toBeCloseTo(200, 3)
    expect(b.width).toBeCloseTo(200, 3)
  })

  it('keeps the children inside the box on one axis', () => {
    const { group, right } = twoInAGroup()
    editor.selection.set([group])

    dragHandle('e', { x: 100, y: 50 })

    const box = editor.getShape(group)!
    expect(box.width).toBeCloseTo(100, 3)
    expect(box.height).toBeCloseTo(100, 3)

    const b = editor.getShape(right)!
    expect(b.x).toBeCloseTo(50, 3)
    expect(b.width).toBeCloseTo(50, 3)
    // Untouched axis stays untouched.
    expect(b.height).toBeCloseTo(100, 3)
  })

  it('reaches a group inside a group', () => {
    const inner = twoInAGroup()
    const loose = editor.createShape({ type: 'rect', x: 0, y: 100, width: 200, height: 100 })
    const outer = editor.group([inner.group, loose])
    if (outer === null) throw new Error('expected a group')

    editor.selection.set([outer])
    // 200x200 -> 400x400.
    dragHandle('se', { x: 400, y: 400 })

    expect(editor.getShape(inner.group)!.width).toBeCloseTo(400, 3)
    expect(editor.getShape(inner.right)!.x).toBeCloseTo(200, 3)
    expect(editor.getShape(inner.right)!.width).toBeCloseTo(200, 3)
  })

  it('is one entry in the history', () => {
    const { group, left } = twoInAGroup()
    editor.selection.set([group])

    dragHandle('se', { x: 400, y: 200 })
    expect(editor.getShape(left)!.width).toBeCloseTo(200, 3)

    editor.history.undo()
    expect(editor.getShape(left)!.width).toBeCloseTo(100, 3)
    expect(editor.getShape(group)!.width).toBeCloseTo(200, 3)
  })
})
