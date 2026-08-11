import { formatNumber as n } from '../../util/format'
import { distanceToSegment } from '../geometry'
import { applyShadow, applyStrokeStyle } from '../paint'
import type { ShapeUtil } from '../shape-util'
import type { LineShape } from '../types'

/**
 * Endpoints are stored as ratios of the shape box rather than absolute
 * coordinates, so the generic resize machinery moves them correctly without the
 * line needing a special case.
 */
export const lineShapeUtil: ShapeUtil<LineShape> = {
  type: 'line',
  propsVersion: 1,
  canRotate: true,

  getDefaultProps: () => ({
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    stroke: { color: '#111827', width: 2, cap: 'round' },
    shadow: null,
  }),

  render(shape, ctx, _info) {
    const { start, end, stroke, shadow } = shape.props
    applyShadow(ctx, shadow)
    applyStrokeStyle(ctx, stroke)
    ctx.beginPath()
    ctx.moveTo(start.x * shape.width, start.y * shape.height)
    ctx.lineTo(end.x * shape.width, end.y * shape.height)
    ctx.stroke()
    applyShadow(ctx, null)
  },

  // No fill in the props, so the exporter paints this stroke-only by itself.
  getPath(shape) {
    const { start, end } = shape.props
    return `M${n(start.x * shape.width)},${n(start.y * shape.height)}L${n(
      end.x * shape.width,
    )},${n(end.y * shape.height)}`
  },

  hitTest(shape, point, tolerance) {
    const { start, end, stroke } = shape.props
    const a = { x: start.x * shape.width, y: start.y * shape.height }
    const b = { x: end.x * shape.width, y: end.y * shape.height }
    // A hairline is impossible to hit exactly, so the stroke's own width counts
    // towards the tolerance as well (spec §5.8.4).
    return distanceToSegment(point, a, b) <= tolerance + stroke.width / 2
  },

  getAccessibleLabel: () => 'Line',
}
