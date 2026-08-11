import {
  defaultShapeUtils,
  Editor,
  HcTaintedCanvasError,
  type ShapeBase,
  type ShapeUtil,
  type Vec,
} from '@headless-canvas/core'
import {
  createClipboardBinding,
  createDefaultControls,
  createTextEditor,
} from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { createCustomControls } from './custom-controls'

/**
 * A shape type the library knows nothing about, defined entirely here.
 *
 * The point of the example is that this goes through the same registration path
 * as the built-in shapes — there is no privileged set.
 */
interface StarShape extends ShapeBase<'star', { points: number; fill: string }> {}

declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}

function starPoints(shape: StarShape): Vec[] {
  const { points } = shape.props
  const cx = shape.width / 2
  const cy = shape.height / 2
  const outer = Math.min(cx, cy)
  const inner = outer * 0.45
  const result: Vec[] = []
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (Math.PI * i) / points - Math.PI / 2
    result.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })
  }
  return result
}

const starPath = (shape: StarShape): string =>
  `${starPoints(shape)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join('')}Z`

/** Shared by the canvas and the SVG so the two cannot drift apart. */
const STAR_PAINT = { stroke: '#b45309', 'stroke-width': 2 }

const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 1,
  getDefaultProps: () => ({ points: 5, fill: '#f59e0b' }),

  render(shape, ctx) {
    const points = starPoints(shape)
    ctx.beginPath()
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.closePath()
    ctx.fillStyle = shape.props.fill
    ctx.fill()
    ctx.strokeStyle = STAR_PAINT.stroke
    ctx.lineWidth = STAR_PAINT['stroke-width']
    ctx.stroke()
  },

  /**
   * SVG export. A shape whose props are the standard fill/stroke pair only has
   * to return its outline from `getPath` — this one paints its own way, so it
   * writes its own element instead.
   */
  toSvg(shape) {
    return { tag: 'path', attrs: { d: starPath(shape), fill: shape.props.fill, ...STAR_PAINT } }
  },

  hitTest(shape, point) {
    const points = starPoints(shape)
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!
      const b = points[j]!
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside
      }
    }
    return inside
  },

  getAccessibleLabel: (shape) => `${shape.props.points}-pointed star`,
}

const stage = document.querySelector<HTMLDivElement>('#stage')!
const editor = new Editor({
  container: stage,
  shapeUtils: [...defaultShapeUtils, starShapeUtil],
})
// Level 1 by default; the toolbar swaps in hand-written controls to show that
// Level 3 works without a framework.
let controls: { dispose(): void } = createDefaultControls(editor)
let usingCustom = false

// Copy, cut, paste and image drop. Not in the core, because reading the
// clipboard can raise a permission prompt an application should control.
createClipboardBinding(editor)

// Double-click, Enter or F2 on a text shape opens this. The core decides when
// a session is open; the dialog is only what that session looks like.
createTextEditor(editor)

editor.subscribeNotifications((notification) => {
  // eslint-disable-next-line no-console
  console[notification.level === 'error' ? 'error' : 'warn'](notification.message)
})

const palette = ['#4f7cff', '#22c55e', '#ef4444', '#a855f7', '#14b8a6']
const pick = () => palette[Math.floor(Math.random() * palette.length)]!
const centre = () => {
  const view = editor.viewport.getVisibleBounds()
  return { x: view.x + view.width / 2, y: view.y + view.height / 2 }
}

const on = (selector: string, handler: () => void) =>
  document.querySelector(selector)!.addEventListener('click', handler)

on('#add-rect', () => {
  const { x, y } = centre()
  editor.createShape({
    type: 'rect',
    x: x - 70 + Math.random() * 80,
    y: y - 45,
    width: 140,
    height: 90,
    props: { fill: { type: 'solid', color: pick() }, cornerRadius: 8 },
  })
})

on('#add-ellipse', () => {
  const { x, y } = centre()
  editor.createShape({
    type: 'ellipse',
    x: x - 60,
    y: y - 60,
    width: 120,
    height: 120,
    props: {
      fill: {
        type: 'radial',
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 1, color: pick() },
        ],
      },
    },
  })
})

on('#add-text', () => {
  const { x, y } = centre()
  editor.createShape({
    type: 'text',
    x: x - 120,
    y: y - 30,
    width: 240,
    height: 60,
    props: { text: 'Double-click to edit', fontSize: 28, align: 'center' },
  })
})

on('#add-path', () => {
  const { x, y } = centre()
  editor.createShape({
    type: 'path',
    x: x - 60,
    y: y - 60,
    width: 120,
    height: 120,
    props: {
      d: 'M 50 5 C 90 5 95 45 50 95 C 5 45 10 5 50 5 Z',
      viewBox: { width: 100, height: 100 },
      fill: {
        type: 'linear',
        angle: Math.PI / 2,
        stops: [
          { offset: 0, color: '#f472b6' },
          { offset: 1, color: '#7c3aed' },
        ],
      },
      stroke: { color: '#4c1d95', width: 2 },
    },
  })
})

on('#add-star', () => {
  const { x, y } = centre()
  editor.createShape({
    type: 'star',
    x: x - 60,
    y: y - 60,
    width: 120,
    height: 120,
    props: { points: 5 + Math.floor(Math.random() * 4) },
  })
})

on('#group', () => {
  const ids = [...editor.selection.ids]
  if (ids.length > 1) editor.group(ids)
  else for (const id of ids) if (editor.getShape(id)?.type === 'group') editor.ungroup(id)
})

/**
 * Stress test for risk R-1: the invariants claim panning and zooming cost the
 * same regardless of shape count, because the overlay only ever holds control
 * DOM for the selection and receives one transform per frame.
 */
on('#stress', () => {
  editor.transact(() => {
    for (let i = 0; i < 5000; i++) {
      editor.createShape({
        type: 'rect',
        x: (i % 100) * 60,
        y: Math.floor(i / 100) * 60,
        width: 44,
        height: 32,
        props: {
          fill: { type: 'solid', color: palette[i % palette.length]! },
          stroke: null,
          cornerRadius: 3,
        },
      })
    }
  })
  editor.viewport.zoomToFit()
})

on('#level', () => {
  controls.dispose()
  usingCustom = !usingCustom
  controls = usingCustom ? createCustomControls(editor) : createDefaultControls(editor)
  const button = document.querySelector('#level')!
  button.textContent = usingCustom ? 'Level 3: custom controls' : 'Level 1: default controls'
  button.setAttribute('aria-pressed', String(usingCustom))
})

/**
 * Level 2, which is not a mode.
 *
 * Levels 1 and 3 are two implementations of the controls, so they are exclusive
 * and the button above swaps one for the other. Level 2 is a stylesheet layered
 * over whichever is mounted, so it turns on and off independently — this button
 * only removes a class, and the library never learns it happened.
 */
on('#theme', () => {
  const themed = stage.classList.toggle('themed')
  const button = document.querySelector('#theme')!
  button.textContent = themed ? 'Level 2: CSS on' : 'Level 2: CSS off'
  button.setAttribute('aria-pressed', String(themed))
})

// All three ship with the editor, on v / h / d. The cycle is only so the
// example needs one button rather than three.
const TOOLS = ['select', 'draw', 'hand'] as const

on('#tool', () => {
  const index = TOOLS.indexOf(editor.tools.current as (typeof TOOLS)[number])
  const next = TOOLS[(index + 1) % TOOLS.length] as string
  editor.tools.setCurrent(next)
  document.querySelector('#tool')!.textContent = `Tool: ${next}`
})

on('#undo', () => editor.history.undo())
on('#redo', () => editor.history.redo())

on('#grid', () => {
  const grid = editor.snapping.grid === null ? 20 : null
  editor.setSnapping({ grid })
  document.querySelector('#grid')!.setAttribute('aria-pressed', String(grid !== null))
  document.querySelector('#grid')!.textContent = grid === null ? 'Grid: off' : 'Grid: 20'
})

on('#fit', () => editor.viewport.zoomToFit())
on('#clear', () => editor.deleteShapes(editor.getChildren(null)))

on('#export', () => {
  editor
    .export({ format: 'png', scale: 2, background: '#ffffff', padding: 24 })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'headlesscanvas.png'
      link.click()
      URL.revokeObjectURL(url)
    })
    .catch((error: unknown) => {
      if (error instanceof HcTaintedCanvasError) {
        window.alert(`Export blocked by CORS. Offending sources:\n${error.sources.join('\n')}`)
      } else {
        window.alert(String(error))
      }
    })
})

/**
 * The star exports because its util implements `getPath`, not because the
 * exporter knows about stars — the same reason it renders and hit tests.
 */
on('#export-svg', () => {
  const svg = editor.exportSvg({ background: '#ffffff', padding: 24 })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'headlesscanvas.svg'
  link.click()
  URL.revokeObjectURL(url)
})

/**
 * The library's own format, as a file.
 *
 * `embedImages` inlines the referenced bitmaps so the file opens anywhere; the
 * shapes still record where each image came from.
 */
on('#save-file', () => {
  const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'drawing.hcanvas'
  link.click()
  URL.revokeObjectURL(url)
})

const filePicker = document.querySelector<HTMLInputElement>('#file')!

on('#open-file', () => filePicker.click())

filePicker.addEventListener('change', () => {
  const file = filePicker.files?.[0]
  // Cleared either way, so choosing the same file twice still fires `change`.
  filePicker.value = ''
  if (!file) return
  file
    .text()
    .then((text) => editor.loadDocument(JSON.parse(text)))
    .catch((error: unknown) => window.alert(`Could not open that file: ${String(error)}`))
})

on('#save', () => {
  window.localStorage.setItem('headlesscanvas-example', JSON.stringify(editor.toJSON()))
})

on('#load', () => {
  const saved = window.localStorage.getItem('headlesscanvas-example')
  if (saved) editor.loadDocument(JSON.parse(saved))
})

// --- readout ---------------------------------------------------------------

const stat = document.querySelector('#stat')!
let frames = 0
let fps = 0
let lastSample = performance.now()

function sample(now: number): void {
  frames++
  if (now - lastSample >= 500) {
    fps = Math.round((frames * 1000) / (now - lastSample))
    frames = 0
    lastSample = now
  }
  const snapshot = editor.getSnapshot()
  const stats = editor.getRenderStats()
  const overlayNodes = editor.overlayElement.querySelectorAll('*').length
  stat.textContent =
    `${snapshot.shapes.size} shapes · ${stats.drawn} drawn / ${stats.culled} culled · ` +
    `${snapshot.selectedIds.length} selected · zoom ${Math.round(editor.viewport.camera.z * 100)}% · ` +
    `${overlayNodes} overlay nodes · ${fps} fps`
  requestAnimationFrame(sample)
}
requestAnimationFrame(sample)

editor.createShape({ type: 'rect', x: 80, y: 80, width: 160, height: 110 })
editor.createShape({
  type: 'ellipse',
  x: 280,
  y: 100,
  width: 120,
  height: 120,
  props: { fill: { type: 'solid', color: '#22c55e' } },
})
editor.createShape({ type: 'star', x: 440, y: 90, width: 140, height: 140 })
editor.createShape({
  type: 'text',
  x: 80,
  y: 240,
  width: 320,
  height: 60,
  props: { text: 'Double-click me — the handles are DOM.' },
})
