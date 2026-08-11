// @vitest-environment jsdom

import type { Editor, Notification, ShapeUtil } from '@headless-canvas/core'
import { defaultShapeUtils } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEditor } from './harness'

/**
 * SVG export.
 *
 * The point under test throughout is that no part of the exporter knows what a
 * rectangle is. Shapes describe themselves through `getPath` or `toSvg`, and an
 * application-defined shape has to come out of it on exactly the same terms as
 * a built-in one — otherwise the extension model is only half true.
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

describe('the document', () => {
  it('sizes the viewBox to the content and the attributes to the scale', () => {
    editor.createShape({ type: 'rect', x: 10, y: 20, width: 100, height: 50 })

    const svg = editor.exportSvg({ scale: 2 })

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="10 20 100 50"')
    // The viewBox is untouched by scale: this is vector output, so the scale
    // only sets the size it displays at.
    expect(svg).toContain('width="200"')
    expect(svg).toContain('height="100"')
  })

  it('grows the region by the padding and paints the background behind it', () => {
    editor.createShape({ type: 'rect', x: 0, y: 0, width: 100, height: 100 })

    const svg = editor.exportSvg({ padding: 10, background: '#fff' })

    expect(svg).toContain('viewBox="-10 -10 120 120"')
    expect(svg).toContain('<rect x="-10" y="-10" width="120" height="120" fill="#fff"/>')
  })

  it('refuses an empty document rather than emitting an empty canvas', () => {
    expect(() => editor.exportSvg()).toThrow(/nothing to export/)
  })

  it('honours an explicit region', () => {
    editor.createShape({ type: 'rect', x: 0, y: 0, width: 500, height: 500 })

    const svg = editor.exportSvg({ bounds: { x: 0, y: 0, width: 50, height: 50 } })

    expect(svg).toContain('viewBox="0 0 50 50"')
  })
})

describe('well-formedness', () => {
  /**
   * The exporter builds a string, so nothing about its shape is enforced by the
   * type system. A document with one unescaped character is not slightly wrong,
   * it fails to open — so it is parsed back here rather than only matched.
   */
  it('parses as XML, with every shape type in the document', () => {
    editor.transact(() => {
      editor.createShape({ type: 'rect', x: 0, y: 0, width: 60, height: 40 })
      editor.createShape({ type: 'ellipse', x: 70, y: 0, width: 60, height: 40 })
      editor.createShape({ type: 'line', x: 0, y: 50, width: 130, height: 20 })
      editor.createShape({ type: 'path', x: 0, y: 80, width: 60, height: 60 })
      editor.createShape({
        type: 'text',
        x: 70,
        y: 80,
        width: 200,
        height: 60,
        props: { text: 'quotes " and & ampersands' },
      })
      editor.createShape({
        type: 'image',
        x: 0,
        y: 150,
        width: 60,
        height: 60,
        props: { src: 'https://example.test/a.png?a=1&b=2' },
      })
    })

    const svg = editor.exportSvg({ background: '#fff', padding: 8 })
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')

    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.documentElement.tagName).toBe('svg')
    expect(parsed.querySelectorAll('path')).toHaveLength(4)
    expect(parsed.querySelectorAll('text')).toHaveLength(1)
    expect(parsed.querySelectorAll('image')).toHaveLength(1)
    // Escaping survives the round trip rather than merely appearing escaped.
    expect(parsed.querySelector('text')?.textContent).toBe('quotes " and & ampersands')
    expect(parsed.querySelector('image')?.getAttribute('href')).toBe(
      'https://example.test/a.png?a=1&b=2',
    )
  })
})

describe('built-in shapes', () => {
  it('writes a rectangle as a path carrying its fill and stroke', () => {
    editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      props: {
        cornerRadius: 0,
        fill: { type: 'solid', color: '#4f7cff' },
        stroke: { color: '#1b3fa0', width: 3 },
      },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('d="M0,0H100V60H0Z"')
    expect(svg).toContain('fill="#4f7cff"')
    expect(svg).toContain('stroke="#1b3fa0"')
    expect(svg).toContain('stroke-width="3"')
  })

  it('rounds a rectangle with arcs, clamped to half the shorter side', () => {
    editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      props: { cornerRadius: 999 },
    })

    // 999 would be nonsense; the drawn radius is 20 and the export agrees.
    expect(editor.exportSvg()).toContain('A20,20 0 0 1')
  })

  it('writes a line as a stroke with no fill', () => {
    editor.createShape({
      type: 'line',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0.5 },
        stroke: { color: '#000', width: 2, cap: 'round' },
      },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('d="M0,0L100,50"')
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke-linecap="round"')
  })

  it('rescales path data from its viewBox into the shape box', () => {
    editor.createShape({
      type: 'path',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      props: { d: 'M 0 0 L 50 0 Z', viewBox: { width: 100, height: 100 } },
    })

    expect(editor.exportSvg()).toContain('d="M0,0L100,0Z"')
  })

  it('writes text as text, one element per line, escaped', () => {
    editor.createShape({
      type: 'text',
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      props: { text: 'a < b & c\nsecond', fontSize: 20, align: 'center', wrap: false },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('>a &lt; b &amp; c</text>')
    expect(svg).toContain('>second</text>')
    // Anchored rather than positioned, so a viewer without the font still
    // centres each line correctly.
    expect(svg).toContain('text-anchor="middle"')
    expect(svg).toContain('x="150"')
    expect(svg).toContain('font-size="20"')
  })

  it('references an image and stretches it to the shape box', () => {
    editor.createShape({
      type: 'image',
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      props: { src: 'https://example.test/a.png' },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('<image')
    expect(svg).toContain('href="https://example.test/a.png"')
    expect(svg).toContain('preserveAspectRatio="none"')
  })

  it('puts a gradient in defs and references it', () => {
    editor.createShape({
      type: 'ellipse',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: {
        fill: {
          type: 'linear',
          angle: 0,
          stops: [
            { offset: 0, color: '#fff' },
            { offset: 1, color: '#000' },
          ],
        },
        stroke: null,
      },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('<defs>')
    expect(svg).toContain('<linearGradient')
    expect(svg).toContain('gradientUnits="userSpaceOnUse"')
    expect(svg).toContain('<stop offset="0" stop-color="#fff"/>')
    expect(svg).toMatch(/fill="url\(#hc-\d+\)"/)
  })

  it('turns a shadow into a drop-shadow filter', () => {
    editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      props: { shadow: { color: '#000', blur: 8, offsetX: 2, offsetY: 4 }, stroke: null },
    })

    const svg = editor.exportSvg()

    // Canvas blur is a Gaussian of sigma = blur / 2.
    expect(svg).toContain('<feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000"/>')
    expect(svg).toMatch(/filter="url\(#hc-\d+\)"/)
  })

  it('clips an inside stroke instead of pretending SVG can align one', () => {
    editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      props: { stroke: { color: '#000', width: 4, align: 'inside' } },
    })

    const svg = editor.exportSvg()

    expect(svg).toContain('<clipPath')
    expect(svg).toMatch(/clip-path="url\(#hc-\d+\)"/)
    // Half of the doubled width falls outside the clip, leaving 4 visible.
    expect(svg).toContain('stroke-width="8"')
  })
})

describe('placement', () => {
  it('carries the world transform on a group element', () => {
    editor.createShape({
      type: 'rect',
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      props: { stroke: null },
    })

    expect(editor.exportSvg()).toContain('<g transform="matrix(1 0 0 1 10 20)">')
  })

  it('applies a rotation about the shape centre', () => {
    editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: Math.PI / 2,
      props: { stroke: null },
    })

    // A quarter turn about (50, 50) maps the local origin to (100, 0).
    expect(editor.exportSvg()).toContain('matrix(0 1 -1 0 100 0)')
  })

  it('multiplies opacity down the ancestor chain', () => {
    const child = editor.createShape({
      type: 'rect',
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      opacity: 0.5,
    })
    const group = editor.group([child])!
    editor.updateShape(group, { opacity: 0.5 })

    expect(editor.exportSvg()).toContain('opacity="0.25"')
  })

  it('leaves out hidden and fully transparent shapes', () => {
    editor.createShape({ type: 'rect', x: 0, y: 0, width: 40, height: 40, visible: false })
    editor.createShape({ type: 'rect', x: 0, y: 0, width: 40, height: 40, opacity: 0 })
    editor.createShape({ type: 'ellipse', x: 0, y: 0, width: 40, height: 40 })

    const svg = editor.exportSvg()

    // Only the ellipse is left, and it is the only element in the document.
    expect(svg.match(/<g[ >]/g)).toHaveLength(1)
    expect(svg).toContain('A20,20')
  })

  it('emits nothing for a group itself, and everything for its children', () => {
    const a = editor.createShape({ type: 'rect', x: 0, y: 0, width: 40, height: 40 })
    const b = editor.createShape({ type: 'rect', x: 60, y: 0, width: 40, height: 40 })
    editor.group([a, b])

    const svg = editor.exportSvg()

    // Three shapes in the document, two of them drawn.
    expect(svg.match(/<g[ >]/g)).toHaveLength(2)
  })
})

describe('shapes the library does not know', () => {
  const badgeUtil = {
    type: 'badge',
    getDefaultProps: () => ({ fill: { type: 'solid', color: '#f59e0b' }, stroke: null }),
    render: () => {},
    hitTest: () => true,
    getPath: (shape: { width: number; height: number }) =>
      `M0,0L${shape.width},0L${shape.width / 2},${shape.height}Z`,
  } as unknown as ShapeUtil<never>

  const opaqueUtil = {
    type: 'opaque',
    getDefaultProps: () => ({}),
    render: () => {},
    hitTest: () => true,
  } as unknown as ShapeUtil<never>

  it('exports one that implements getPath, on the same terms as a built-in', () => {
    const scoped = createEditor({ shapeUtils: [...defaultShapeUtils, badgeUtil] })
    try {
      scoped.editor.createShape({ type: 'badge', x: 0, y: 0, width: 100, height: 80 } as never)

      const svg = scoped.editor.exportSvg()

      expect(svg).toContain('d="M0,0L100,0L50,80Z"')
      expect(svg).toContain('fill="#f59e0b"')
    } finally {
      scoped.editor.dispose()
      scoped.container.remove()
    }
  })

  /**
   * A shape with no vector form cannot be invented for. What matters is that it
   * costs the caller a warning rather than the rest of the document.
   */
  it('reports one that implements neither, and exports the rest', () => {
    const scoped = createEditor({ shapeUtils: [...defaultShapeUtils, opaqueUtil] })
    const seen: Notification[] = []
    scoped.editor.subscribeNotifications((notification) => seen.push(notification))

    try {
      scoped.editor.createShape({ type: 'opaque', x: 0, y: 0, width: 50, height: 50 } as never)
      scoped.editor.createShape({ type: 'rect', x: 60, y: 0, width: 50, height: 50 })

      const svg = scoped.editor.exportSvg()

      expect(svg).toContain('<path')
      expect(seen).toHaveLength(1)
      expect(seen[0]?.code).toBe('export-failed')
      expect(seen[0]?.level).toBe('warning')
      expect(seen[0]?.message).toContain('opaque')
    } finally {
      scoped.editor.dispose()
      scoped.container.remove()
    }
  })
})
