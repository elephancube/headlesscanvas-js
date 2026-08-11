// @vitest-environment jsdom

import type { Editor, PathShape, ShapeId, Vec } from '@headless-canvas/core'
import { DrawTool, polylineToPath, simplifyPolyline, strokeFromPoints } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEditor, firePointer } from './harness'

/**
 * Freehand drawing.
 *
 * A stroke is a `path` shape, which is the whole point: it inherits hit
 * testing, resizing, serialisation and SVG export from a shape that already
 * works, rather than starting a second one that has to be taught all of it.
 */

let editor: Editor
let container: HTMLDivElement

beforeEach(() => {
  ;({ editor, container } = createEditor())
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

/** A press, a run of moves and a release, as the editor would see them. */
function stroke(points: readonly Vec[]): void {
  const first = points[0] as Vec
  firePointer(container, 'pointerdown', { x: first.x, y: first.y })
  for (const point of points.slice(1)) {
    firePointer(window, 'pointermove', { x: point.x, y: point.y })
  }
  const last = points[points.length - 1] as Vec
  firePointer(window, 'pointerup', { x: last.x, y: last.y })
}

const only = (): PathShape => {
  const ids = editor.getChildren(null)
  expect(ids).toHaveLength(1)
  return editor.getShape<'path'>(ids[0] as ShapeId) as PathShape
}

describe('simplification', () => {
  it('drops the points that carry no shape', () => {
    // Eleven collinear samples describe exactly what two describe.
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }))

    expect(simplifyPolyline(line, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
  })

  it('keeps a corner the user actually drew', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]

    expect(simplifyPolyline(corner, 1)).toEqual(corner)
  })

  it('keeps everything at zero tolerance', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.2 },
      { x: 2, y: 0 },
    ]

    expect(simplifyPolyline(points, 0)).toEqual(points)
  })

  it('survives a stroke long enough to overflow a recursive implementation', () => {
    // Worst case for the split: every point is a new extreme, so the recursion
    // would be one frame deep per point.
    const spiral = Array.from({ length: 10_000 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 0 : i }))

    expect(() => simplifyPolyline(spiral, 0.5)).not.toThrow()
  })
})

describe('smoothing', () => {
  it('passes through every point it is given', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
    ]

    const commands = polylineToPath(points)

    // One move plus one cubic per segment, each ending on its own point.
    expect(commands).toHaveLength(4)
    expect(commands[0]).toEqual({ type: 'M', x: 0, y: 0 })
    for (let i = 1; i < commands.length; i++) {
      const command = commands[i] as { x: number; y: number }
      expect({ x: command.x, y: command.y }).toEqual(points[i])
    }
  })

  it('stays straight at zero smoothing', () => {
    const commands = polylineToPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      0,
    )

    expect(commands.every((command) => command.type === 'M' || command.type === 'L')).toBe(true)
  })

  it('emits a zero-length segment for a tap, which is what a round cap paints', () => {
    expect(polylineToPath([{ x: 5, y: 5 }])).toEqual([
      { type: 'M', x: 5, y: 5 },
      { type: 'L', x: 5, y: 5 },
    ])
  })
})

describe('strokes from elsewhere', () => {
  /**
   * The tool is not the only way a run of points arrives — a signature pad or
   * a replay of recorded input produces the same thing and wants the same
   * shape out of it.
   */
  it('fits points collected outside the tool', () => {
    const geometry = strokeFromPoints(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      { color: '#123456', width: 10, tolerance: 1 },
    )
    const id = editor.createShape({ type: 'path', ...geometry })

    // The collinear middle sample is dropped, and the box is padded by half the
    // stroke width in every direction.
    expect(geometry.props.d).toBe('M5,5L105,5')
    expect(geometry.width).toBe(110)
    expect(geometry.height).toBe(10)
    expect(editor.getShape<'path'>(id)?.props.stroke).toMatchObject({
      color: '#123456',
      width: 10,
    })
  })
})

describe('the tool', () => {
  beforeEach(() => {
    editor.tools.setCurrent('draw')
  })

  it('is registered by default and reachable from the keyboard', () => {
    editor.tools.setCurrent('select')
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))

    expect(editor.tools.current).toBe('draw')
  })

  it('leaves one path behind, stroked and unfilled', () => {
    stroke([
      { x: 20, y: 20 },
      { x: 60, y: 40 },
      { x: 100, y: 20 },
    ])

    const shape = only()
    expect(shape.type).toBe('path')
    expect(shape.props.fill).toEqual({ type: 'none' })
    expect(shape.props.stroke?.cap).toBe('round')
    expect(shape.props.d.startsWith('M')).toBe(true)
  })

  /**
   * The reason the stroke lives in the ephemeral layer while the pointer is
   * down. One drag is one thing the user did, however many samples it took.
   */
  it('costs exactly one undo step, and undo removes the stroke entirely', () => {
    const before = editor.history.getSize().undo

    stroke(Array.from({ length: 30 }, (_, i) => ({ x: 20 + i * 5, y: 40 + (i % 3) * 4 })))

    expect(editor.history.getSize().undo).toBe(before + 1)

    editor.history.undo()
    expect(editor.getChildren(null)).toHaveLength(0)

    editor.history.redo()
    expect(editor.getChildren(null)).toHaveLength(1)
  })

  it('writes nothing to the document until the pointer is released', () => {
    firePointer(container, 'pointerdown', { x: 20, y: 20 })
    firePointer(window, 'pointermove', { x: 60, y: 60 })

    // Visible on screen through the ephemeral layer, absent from the history.
    expect(editor.history.getSize().undo).toBe(0)
    expect(editor.getResolvedShape(editor.getChildren(null)[0] as ShapeId)).toBeDefined()

    firePointer(window, 'pointerup', { x: 60, y: 60 })
    expect(editor.history.getSize().undo).toBe(1)
  })

  it('leaves nothing behind when cancelled mid-stroke', () => {
    firePointer(container, 'pointerdown', { x: 20, y: 20 })
    firePointer(window, 'pointermove', { x: 60, y: 60 })

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(editor.getChildren(null)).toHaveLength(0)
    expect(editor.history.getSize().undo).toBe(0)
    expect(container.getAttribute('data-hc-state')).toBe('idle')
  })

  /**
   * Half a stroke width in every direction, because that is how far the paint
   * reaches past the geometry. Without it a horizontal line would be a shape of
   * zero height: unselectable, and impossible to resize.
   */
  it('pads the box by the stroke width, so a straight line is still grabbable', () => {
    stroke([
      { x: 20, y: 50 },
      { x: 120, y: 50 },
    ])

    const shape = only()
    expect(shape.height).toBeGreaterThan(0)
    expect(shape.y).toBeLessThan(50)
    expect(shape.props.viewBox).toEqual({ width: shape.width, height: shape.height })
  })

  it('records a tap as a dot rather than nothing', () => {
    firePointer(container, 'pointerdown', { x: 40, y: 40 })
    firePointer(window, 'pointerup', { x: 40, y: 40 })

    expect(only().props.d).toBe('M2,2L2,2')
  })

  /**
   * Re-registering is how a tool is reconfigured, so it has to take effect on
   * the tool that is already active — otherwise a colour picker would appear
   * to do nothing until the user switched tools and back.
   */
  it('takes its colour and width from the options it was registered with', () => {
    editor.tools.register(
      'draw',
      (instance) =>
        new DrawTool(instance, {
          color: '#ff0000',
          width: 12,
          tolerance: 1,
          smoothing: 1,
          minDistance: 2,
        }),
    )

    stroke([
      { x: 10, y: 10 },
      { x: 80, y: 30 },
    ])

    expect(only().props.stroke).toMatchObject({ color: '#ff0000', width: 12 })
  })

  it('exports as a vector like any other path', () => {
    stroke([
      { x: 20, y: 20 },
      { x: 60, y: 40 },
      { x: 100, y: 20 },
    ])

    const svg = editor.exportSvg()

    expect(svg).toContain('<path')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('fill="none"')
  })
})
