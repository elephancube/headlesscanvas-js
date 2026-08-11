// @vitest-environment jsdom

import type { Editor, ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRects, createEditor } from './harness'

/**
 * Grouping is where transform models usually go wrong: bake the transform into
 * the children and rotation drifts, forget to compose it and ungrouping moves
 * everything. The property that matters is simply that nothing changes
 * position when the hierarchy does (spec §5.3.4).
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

const boundsOf = (ids: readonly ShapeId[]) =>
  ids.map((id) => {
    const b = editor.getShapeBounds(id)!
    return {
      x: Math.round(b.x * 1000) / 1000,
      y: Math.round(b.y * 1000) / 1000,
      width: Math.round(b.width * 1000) / 1000,
      height: Math.round(b.height * 1000) / 1000,
      rotation: Math.round(b.rotation * 1000) / 1000,
    }
  })

describe('grouping', () => {
  it('leaves children exactly where they were', () => {
    const ids = addRects(editor, 3)
    editor.updateShape(ids[1]!, { rotation: 0.4 })
    const before = boundsOf(ids)

    editor.group(ids)

    expect(boundsOf(ids)).toEqual(before)
  })

  it('leaves children exactly where they were after ungrouping', () => {
    const ids = addRects(editor, 3)
    editor.updateShape(ids[0]!, { rotation: -0.9 })
    const before = boundsOf(ids)

    const groupId = editor.group(ids)!
    editor.ungroup(groupId)

    expect(boundsOf(ids)).toEqual(before)
    expect(editor.getShape(groupId)).toBeUndefined()
  })

  it('survives a rotated group being dissolved', () => {
    const ids = addRects(editor, 2)
    const groupId = editor.group(ids)!
    editor.updateShape(groupId, { rotation: 0.7 })
    const before = boundsOf(ids)

    editor.ungroup(groupId)

    expect(boundsOf(ids)).toEqual(before)
  })

  it('encloses its children', () => {
    const ids = addRects(editor, 4)
    const groupId = editor.group(ids)!
    const group = editor.getShapeBounds(groupId)!

    for (const id of ids) {
      const child = editor.getShapeBounds(id)!
      expect(child.x).toBeGreaterThanOrEqual(group.x - 0.001)
      expect(child.y).toBeGreaterThanOrEqual(group.y - 0.001)
    }
  })

  it('reports children and ancestors', () => {
    const ids = addRects(editor, 3)
    const groupId = editor.group(ids)!

    expect(editor.getChildren(groupId).sort()).toEqual([...ids].sort())
    expect(editor.getAncestors(ids[0]!)).toEqual([groupId])
    expect(editor.getChildren(null)).toEqual([groupId])
  })

  it('deletes descendants along with the group', () => {
    const ids = addRects(editor, 3)
    const groupId = editor.group(ids)!

    editor.deleteShapes([groupId])

    expect(editor.getSnapshot().shapes.size).toBe(0)
  })
})

describe('reparenting', () => {
  it('preserves world placement when moving into a group', () => {
    const ids = addRects(editor, 3)
    const groupId = editor.group([ids[0]!, ids[1]!])!
    const before = boundsOf([ids[2]!])

    editor.setParent([ids[2]!], groupId)

    expect(editor.getShape(ids[2]!)!.parentId).toBe(groupId)
    expect(boundsOf([ids[2]!])).toEqual(before)
  })

  it('refuses to make a shape its own descendant', () => {
    const ids = addRects(editor, 2)
    const groupId = editor.group(ids)!

    editor.setParent([groupId], ids[0]!)

    expect(editor.getShape(groupId)!.parentId).toBeNull()
  })
})

describe('ordering', () => {
  it('moves a shape between two others', () => {
    const ids = addRects(editor, 3)
    expect(editor.getChildren(null)).toEqual(ids)

    editor.moveTo([ids[2]!], { before: ids[0]! })

    expect(editor.getChildren(null)).toEqual([ids[2]!, ids[0]!, ids[1]!])
  })

  it('brings to front and sends to back', () => {
    const ids = addRects(editor, 3)

    editor.reorder([ids[0]!], 'front')
    expect(editor.getChildren(null)).toEqual([ids[1]!, ids[2]!, ids[0]!])

    editor.reorder([ids[0]!], 'back')
    expect(editor.getChildren(null)).toEqual([ids[0]!, ids[1]!, ids[2]!])
  })

  it('steps one position at a time', () => {
    const ids = addRects(editor, 3)

    editor.reorder([ids[0]!], 'forward')
    expect(editor.getChildren(null)).toEqual([ids[1]!, ids[0]!, ids[2]!])

    editor.reorder([ids[0]!], 'backward')
    expect(editor.getChildren(null)).toEqual([ids[0]!, ids[1]!, ids[2]!])
  })

  it('changes only the shape that moved', () => {
    const ids = addRects(editor, 5)
    const indexesBefore = ids.map((id) => editor.getShape(id)!.index)

    editor.moveTo([ids[4]!], { after: ids[0]! })

    const indexesAfter = ids.map((id) => editor.getShape(id)!.index)
    const changed = indexesBefore.filter((index, i) => index !== indexesAfter[i])
    // The whole point of a fractional index: reordering is a single-shape edit
    // rather than a rewrite of everything after it (spec §5.3.2).
    expect(changed).toHaveLength(1)
  })
})

describe('documents', () => {
  it('round-trips through JSON', () => {
    const ids = addRects(editor, 3)
    editor.updateShape(ids[1]!, { rotation: 0.5, opacity: 0.4 })
    const before = boundsOf(ids)

    const document = editor.toJSON()
    editor.loadDocument(document)

    const restored = editor.getChildren(null)
    expect(restored).toHaveLength(3)
    expect(boundsOf(restored)).toEqual(before)
  })

  it('inserts a copied selection with fresh ids', () => {
    const ids = addRects(editor, 2)
    editor.selection.set([ids[0]!])
    const clipboard = editor.getSelectionAsDocument()

    const created = editor.insertDocument(clipboard, { x: 500, y: 500 })

    expect(created).toHaveLength(1)
    expect(created[0]).not.toBe(ids[0])
    expect(editor.getSnapshot().shapes.size).toBe(3)
    expect(editor.getShapeBounds(created[0]!)!.x).toBeCloseTo(500)
  })

  it('copies a group together with its children', () => {
    const ids = addRects(editor, 2)
    const groupId = editor.group(ids)!
    editor.selection.set([groupId])

    const created = editor.insertDocument(editor.getSelectionAsDocument())

    expect(created).toHaveLength(3)
    const newGroup = created.find((id) => editor.getShape(id)!.type === 'group')!
    expect(editor.getChildren(newGroup)).toHaveLength(2)
  })
})
