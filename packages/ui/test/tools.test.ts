// @vitest-environment jsdom
import type { Editor, HcPointerEvent, Tool } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRects, createEditor, drag, fireKey, firePointer } from './harness'

/**
 * The tool layer is where the interaction modes are kept apart from one
 * another. These cover both halves of that: that the built-in select tool still
 * behaves correctly through real events, and that an application-defined tool
 * is wired up the same way the built-ins are (spec §5.8.2).
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

describe('tool registry', () => {
  it('starts on the select tool', () => {
    expect(editor.tools.current).toBe('select')
    expect(container.getAttribute('data-hc-tool')).toBe('select')
  })

  it('switches tools and reflects it on the container', () => {
    editor.tools.setCurrent('hand')

    expect(editor.tools.current).toBe('hand')
    expect(container.getAttribute('data-hc-tool')).toBe('hand')
  })

  it('refuses an unregistered tool rather than silently doing nothing', () => {
    expect(() => editor.tools.setCurrent('nope')).toThrow(/no tool registered/)
  })

  it('switches with the keyboard', () => {
    fireKey(container, 'h')
    expect(editor.tools.current).toBe('hand')

    fireKey(container, 'v')
    expect(editor.tools.current).toBe('select')
  })

  it('lets an application register its own tool', () => {
    const seen: HcPointerEvent[] = []

    class PlaceTool implements Tool {
      readonly id = 'place'
      constructor(private readonly host: Editor) {}
      onPointerDown(event: HcPointerEvent) {
        seen.push(event)
        this.host.createShape({ type: 'rect', x: event.world.x, y: event.world.y })
        this.host.tools.setState('pointing')
      }
      onPointerUp() {
        this.host.tools.setState('idle')
      }
    }

    editor.tools.register('place', (host) => new PlaceTool(host))
    editor.tools.setCurrent('place')

    firePointer(container, 'pointerdown', { x: 120, y: 90 })

    expect(seen).toHaveLength(1)
    // Coordinates arrive already converted, which is most of why a tool is easy
    // to write.
    expect(seen[0]!.world).toEqual({ x: 120, y: 90 })
    expect(container.getAttribute('data-hc-state')).toBe('pointing')
    expect(editor.getSnapshot().shapes.size).toBe(1)
  })

  it('tells a tool when it is replaced', () => {
    const onExit = vi.fn()
    editor.tools.register('probe', () => ({ id: 'probe', onExit }))
    editor.tools.setCurrent('probe')
    editor.tools.setCurrent('select')

    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

describe('select tool', () => {
  it('selects a shape that is clicked', () => {
    const ids = addRects(editor, 3)

    firePointer(container, 'pointerdown', { x: 10, y: 10 })
    firePointer(window, 'pointerup', { x: 10, y: 10 })

    expect(editor.selection.ids).toEqual([ids[0]])
  })

  it('clears the selection when the background is clicked', () => {
    const ids = addRects(editor, 2)
    editor.selection.set(ids)

    firePointer(container, 'pointerdown', { x: 700, y: 500 })
    firePointer(window, 'pointerup', { x: 700, y: 500 })

    expect(editor.selection.ids).toEqual([])
  })

  it('extends the selection with shift', () => {
    const ids = addRects(editor, 3)
    editor.selection.set([ids[0]!])

    firePointer(container, 'pointerdown', { x: 70, y: 10, shiftKey: true })
    firePointer(window, 'pointerup', { x: 70, y: 10, shiftKey: true })

    expect([...editor.selection.ids].sort()).toEqual([ids[0]!, ids[1]!].sort())
  })

  it('moves a shape by dragging, committing once at the end', () => {
    const ids = addRects(editor, 1)
    const versionBefore = editor.getSnapshot().version

    drag(container, { x: 10, y: 10 }, { x: 110, y: 60 })

    expect(editor.getShape(ids[0]!)!.x).toBeCloseTo(100)
    expect(editor.getShape(ids[0]!)!.y).toBeCloseTo(50)
    // A whole drag is one history entry, not one per frame (spec §5.2.4).
    expect(editor.getSnapshot().version).toBe(versionBefore + 2) // selection, then move
  })

  it('selects an area by dragging the background', () => {
    const ids = addRects(editor, 3)

    firePointer(container, 'pointerdown', { x: 700, y: 400 })
    firePointer(window, 'pointermove', { x: 0, y: 0 })

    expect([...editor.selection.ids].sort()).toEqual([...ids].sort())

    firePointer(window, 'pointerup', { x: 0, y: 0 })
  })

  it('exposes the marquee rectangle while it is being dragged', () => {
    addRects(editor, 1)

    firePointer(container, 'pointerdown', { x: 300, y: 300 })
    firePointer(window, 'pointermove', { x: 400, y: 380 })

    expect(editor.getBrush()).toEqual({ x: 300, y: 300, width: 100, height: 80 })

    firePointer(window, 'pointerup', { x: 400, y: 380 })
    expect(editor.getBrush()).toBeNull()
  })

  it('abandons a drag on Escape without committing it', () => {
    const ids = addRects(editor, 1)

    firePointer(container, 'pointerdown', { x: 10, y: 10 })
    firePointer(window, 'pointermove', { x: 200, y: 200 })
    fireKey(container, 'Escape')

    expect(editor.getShape(ids[0]!)!.x).toBe(0)
    expect(container.getAttribute('data-hc-state')).toBe('idle')
  })

  it('does not move a locked shape', () => {
    const ids = addRects(editor, 1)
    editor.updateShape(ids[0]!, { locked: true })

    drag(container, { x: 10, y: 10 }, { x: 200, y: 200 })

    expect(editor.getShape(ids[0]!)!.x).toBe(0)
  })

  it('reports its state through the whole gesture', () => {
    addRects(editor, 1)
    const states: string[] = []
    const record = () => states.push(container.getAttribute('data-hc-state') ?? '')

    firePointer(container, 'pointerdown', { x: 10, y: 10 })
    record()
    firePointer(window, 'pointermove', { x: 60, y: 40 })
    record()
    firePointer(window, 'pointerup', { x: 60, y: 40 })
    record()

    expect(states).toEqual(['pointing', 'dragging', 'idle'])
  })

  it('deletes the selection with the keyboard', () => {
    const ids = addRects(editor, 2)
    editor.selection.set([ids[0]!])

    fireKey(container, 'Delete')

    expect(editor.getSnapshot().shapes.size).toBe(1)
  })

  it('nudges with the arrow keys', () => {
    const ids = addRects(editor, 1)
    editor.selection.set([ids[0]!])

    fireKey(container, 'ArrowRight')
    fireKey(container, 'ArrowRight', { shiftKey: true })

    expect(editor.getShape(ids[0]!)!.x).toBe(11)
  })

  it('groups and ungroups from the keyboard', () => {
    const ids = addRects(editor, 2)
    editor.selection.set(ids)

    fireKey(container, 'g', { ctrlKey: true })
    expect(editor.getChildren(null)).toHaveLength(1)

    fireKey(container, 'G', { ctrlKey: true, shiftKey: true })
    expect(editor.getChildren(null)).toHaveLength(2)
  })
})

describe('hand tool', () => {
  it('pans the viewport instead of selecting', () => {
    const ids = addRects(editor, 1)
    editor.tools.setCurrent('hand')

    drag(container, { x: 200, y: 200 }, { x: 260, y: 240 })

    expect(editor.viewport.camera.x).toBeCloseTo(-60)
    expect(editor.viewport.camera.y).toBeCloseTo(-40)
    expect(editor.selection.ids).toEqual([])
    expect(editor.getShape(ids[0]!)!.x).toBe(0)
  })
})

describe('middle-button panning', () => {
  it('works whatever the active tool is', () => {
    addRects(editor, 1)

    firePointer(container, 'pointerdown', { x: 100, y: 100, button: 1 })
    expect(container.getAttribute('data-hc-state')).toBe('panning')

    firePointer(window, 'pointermove', { x: 150, y: 130, button: 1 })
    expect(editor.viewport.camera.x).toBeCloseTo(-50)

    firePointer(window, 'pointerup', { x: 150, y: 130, button: 1 })
    expect(container.getAttribute('data-hc-state')).toBe('idle')
  })
})
