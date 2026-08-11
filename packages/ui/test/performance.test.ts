// @vitest-environment jsdom

import type { Editor, ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRects, createEditor, nextFrame } from './harness'

/**
 * Performance regression guards.
 *
 * These do not measure frame time — jsdom has no compositor, and a wall-clock
 * assertion in CI would be flaky anyway. What they check is the *shape* of the
 * work: that the broad phase narrows candidates, that culling drops off-screen
 * shapes, and that dragging does not touch committed state. Those are the
 * properties the 60fps target rests on, and they are the ones that regress
 * silently. Real frame timing is measured in the browser example (risk R-1).
 */

const COUNT = 5000

let editor: Editor
let container: HTMLElement
let ids: ShapeId[]

beforeEach(() => {
  ;({ editor, container } = createEditor())
  ids = addRects(editor, COUNT, 40, 60)
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

describe('spatial index', () => {
  it('indexes the whole document', async () => {
    await nextFrame()
    editor.hitTest({ x: 10, y: 10 })
    expect(editor.getRenderStats().indexed).toBe(COUNT)
  })

  it('answers a hit test far faster than a linear scan would', () => {
    // Warm the index.
    editor.hitTest({ x: 0, y: 0 })

    const start = performance.now()
    for (let i = 0; i < 500; i++) {
      editor.hitTest({ x: (i % 700) + 5, y: ((i * 7) % 500) + 5 })
    }
    const perQuery = (performance.now() - start) / 500

    // The browser target is 1ms at this document size; jsdom is much slower, so
    // the ceiling here is deliberately loose and exists to catch an accidental
    // return to a full scan rather than to certify the target.
    expect(perQuery).toBeLessThan(5)
  })

  it('finds the topmost shape under a point', () => {
    const found = editor.hitTest(editor.viewport.worldToScreen({ x: 10, y: 10 }))
    expect(found).toBe(ids[0])
  })
})

describe('culling', () => {
  it('draws only what is on screen', async () => {
    editor.viewport.setCamera({ x: 0, y: 0, z: 1 })
    await nextFrame()

    const stats = editor.getRenderStats()
    expect(stats.drawn + stats.culled).toBe(COUNT)
    // An 800×600 viewport at 1:1 cannot possibly show 5,000 shapes on a
    // 60px grid; without culling every one of them would be drawn (spec §9.2).
    expect(stats.drawn).toBeLessThan(COUNT / 10)
    expect(stats.culled).toBeGreaterThan(0)
  })

  it('draws everything once zoomed out far enough', async () => {
    editor.viewport.zoomToFit()
    await nextFrame()

    expect(editor.getRenderStats().drawn).toBe(COUNT)
  })

  it('never culls a shape that is being dragged', async () => {
    // Park the camera away from the shape's committed position, then move it
    // into view ephemerally — the committed position is stale by definition.
    editor.viewport.setCamera({ x: 5000, y: 5000, z: 1 })
    await nextFrame()
    const beforeDrawn = editor.getRenderStats().drawn

    editor.setEphemeral(new Map([[ids[0]!, { x: 5100, y: 5100 }]]))
    await nextFrame()

    expect(editor.getRenderStats().drawn).toBe(beforeDrawn + 1)
  })
})

describe('interactive changes', () => {
  it('does not touch committed state while dragging', () => {
    const versionBefore = editor.getSnapshot().version
    const moving = ids.slice(0, 100)

    for (let frame = 0; frame < 60; frame++) {
      const changes = new Map(moving.map((id) => [id, { x: frame * 2, y: frame }]))
      editor.setEphemeral(changes)
    }

    // Sixty frames of dragging 100 shapes: still one committed version, and one
    // history entry once it lands (spec §5.2.4).
    expect(editor.getSnapshot().version).toBe(versionBefore)

    editor.commitEphemeral()
    expect(editor.getSnapshot().version).toBe(versionBefore + 1)
  })

  it('keeps a 100-shape drag frame cheap', () => {
    const moving = ids.slice(0, 100)
    const start = performance.now()
    for (let frame = 0; frame < 60; frame++) {
      editor.setEphemeral(new Map(moving.map((id) => [id, { x: frame, y: frame }])))
    }
    const perFrame = (performance.now() - start) / 60

    // Generous ceiling: the point is to catch a change that starts rebuilding
    // the document tree per frame, which would be orders of magnitude slower.
    expect(perFrame).toBeLessThan(5)
  })
})

describe('bulk operations', () => {
  it('creates thousands of shapes in one transaction', () => {
    const versionBefore = editor.getSnapshot().version
    editor.transact(() => addRects(editor, 500))
    expect(editor.getSnapshot().version).toBe(versionBefore + 1)
  })

  it('assigns a distinct, ordered z-index to every shape', () => {
    const order = editor.getChildren(null)
    expect(order).toHaveLength(COUNT)
    expect(new Set(order).size).toBe(COUNT)

    const indexes = order.map((id) => editor.getShape(id)!.index)
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i - 1]! < indexes[i]!).toBe(true)
    }
  })

  it('clears the document without a quadratic walk', () => {
    const start = performance.now()
    editor.deleteShapes(editor.getChildren(null))
    const elapsed = performance.now() - start

    expect(editor.getSnapshot().shapes.size).toBe(0)
    expect(elapsed).toBeLessThan(2000)
  })
})
