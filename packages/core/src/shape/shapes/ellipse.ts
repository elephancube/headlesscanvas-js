import { formatNumber as n } from '../../util/format'
import { paintPath } from '../paint'
import type { ShapeUtil } from '../shape-util'
import type { EllipseShape } from '../types'

export const ellipseShapeUtil: ShapeUtil<EllipseShape> = {
  type: 'ellipse',
  propsVersion: 1,

  getDefaultProps: () => ({
    fill: { type: 'solid', color: '#22c55e' },
    stroke: { color: '#15803d', width: 2 },
    shadow: null,
  }),

  render(shape, ctx, info) {
    const rx = shape.width / 2
    const ry = shape.height / 2
    paintPath(ctx, {
      buildPath: (target) => target.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2),
      fill: shape.props.fill,
      stroke: shape.props.stroke,
      shadow: shape.props.shadow,
      width: shape.width,
      height: shape.height,
      info,
    })
  },

  // Two half-arcs: a single arc command cannot describe a closed ellipse,
  // because its start and end points would coincide.
  getPath(shape) {
    const rx = shape.width / 2
    const ry = shape.height / 2
    const arc = `A${n(rx)},${n(ry)} 0 1 0 `
    return `M0,${n(ry)}${arc}${n(shape.width)},${n(ry)}${arc}0,${n(ry)}Z`
  },

  hitTest(shape, point, tolerance) {
    const rx = shape.width / 2 + tolerance
    const ry = shape.height / 2 + tolerance
    if (rx <= 0 || ry <= 0) return false
    const dx = (point.x - shape.width / 2) / rx
    const dy = (point.y - shape.height / 2) / ry
    return dx * dx + dy * dy <= 1
  },

  getResources(shape) {
    return shape.props.fill.type === 'pattern'
      ? [{ kind: 'image' as const, src: shape.props.fill.src }]
      : []
  },

  getAccessibleLabel: (shape) =>
    Math.abs(shape.width - shape.height) < 0.5
      ? `Circle ${Math.round(shape.width)}`
      : `Ellipse ${Math.round(shape.width)}×${Math.round(shape.height)}`,
}
