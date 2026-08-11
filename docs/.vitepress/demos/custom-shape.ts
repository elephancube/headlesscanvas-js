import {
  defaultShapeUtils,
  Editor,
  type ShapeBase,
  type ShapeUtil,
  type Vec,
} from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from './types'
import { t } from './types'
import { button, pickColor, scaffold, slider } from './ui'

interface StarShape extends ShapeBase<'star', { points: number; fill: string; inset: number }> {}

// Declaration merging is what keeps `props` typed. Without it every call to
// createShape would collapse to `any` for this type (spec §5.4.2).
declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}

/** Shared by the canvas and the SVG so the two cannot drift apart. */
const STAR_STROKE = { color: 'rgb(0 0 0 / 25%)', width: 2 }

function starPoints(shape: StarShape): Vec[] {
  const { points, inset } = shape.props
  const cx = shape.width / 2
  const cy = shape.height / 2
  const outer = Math.min(cx, cy)
  const result: Vec[] = []
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : outer * inset
    const angle = (Math.PI * i) / points - Math.PI / 2
    result.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })
  }
  return result
}

/**
 * A shape type the library knows nothing about.
 *
 * It goes through the same registration path as `rect` and `text`; there is no
 * privileged built-in set, which is why the renderer, the hit tester and the
 * serialiser contain no per-type branches (spec §5.4).
 */
export const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 1,
  preserveAspectRatio: true,

  getDefaultProps: () => ({ points: 5, fill: '#f59e0b', inset: 0.45 }),

  render(shape, ctx) {
    const points = starPoints(shape)
    ctx.beginPath()
    points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.fillStyle = shape.props.fill
    ctx.fill()
    ctx.strokeStyle = STAR_STROKE.color
    ctx.lineWidth = STAR_STROKE.width
    ctx.stroke()
  },

  /**
   * SVG export. A shape whose props carry the standard fill/stroke pair only
   * has to return its outline from `getPath`; this one paints its own way, so
   * it writes its own element and keeps full control.
   */
  toSvg(shape) {
    const d = `${starPoints(shape)
      .map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join('')}Z`
    return {
      tag: 'path',
      attrs: {
        d,
        fill: shape.props.fill,
        stroke: STAR_STROKE.color,
        'stroke-width': STAR_STROKE.width,
      },
    }
  },

  // Called only after the spatial index has narrowed the candidates, so it can
  // afford to be exact.
  hitTest(shape, point) {
    const points = starPoints(shape)
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i] as Vec
      const b = points[j] as Vec
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

export const customShape: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({
    container: stage,
    shapeUtils: [...defaultShapeUtils, starShapeUtil],
  })
  const controls = createDefaultControls(editor)

  const addStar = (x: number, y: number, points: number) =>
    editor.createShape({
      type: 'star',
      x,
      y,
      width: 120,
      height: 120,
      props: { points, fill: pickColor(points) },
    })

  button(bar, _(['Add a star', '星を追加']), () => {
    const view = editor.viewport.getVisibleBounds()
    addStar(
      view.x + view.width / 2 - 60 + (Math.random() - 0.5) * 120,
      view.y + view.height / 2 - 60 + (Math.random() - 0.5) * 80,
      3 + Math.floor(Math.random() * 6),
    )
  })

  slider(
    bar,
    _(['Points on selection', '選択中の頂点数']),
    { min: 3, max: 12, step: 1, value: 5 },
    (value) => {
      editor.transact(() => {
        for (const id of editor.selection.ids) {
          const shape = editor.getShape(id)
          if (shape?.type === 'star') {
            editor.updateShape(id, { props: { ...shape.props, points: value } })
          }
        }
      })
    },
  )

  setStatus(
    _([
      'Select a star and drag the slider — props are typed through declaration merging.',
      '星を選択してスライダーを動かしてください。props は declaration merging で型付けされています。',
    ]),
  )

  editor.transact(() => {
    addStar(80, 90, 5)
    addStar(240, 90, 7)
    addStar(400, 90, 3)
  })

  return {
    dispose() {
      controls.dispose()
      editor.dispose()
    },
  }
}
