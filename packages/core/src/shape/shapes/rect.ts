import { formatNumber as n } from '../../util/format'
import { paintPath } from '../paint'
import type { ShapeUtil } from '../shape-util'
import type { RectShape } from '../types'

const cornerRadiusOf = (shape: RectShape): number =>
  Math.max(0, Math.min(shape.props.cornerRadius, shape.width / 2, shape.height / 2))

/**
 * The built-in rectangle.
 *
 * Registered exactly like an application-defined shape — there is no privileged
 * path for built-ins, which is the only way to be sure the extension mechanism
 * is actually sufficient.
 */
export const rectShapeUtil: ShapeUtil<RectShape> = {
  type: 'rect',
  propsVersion: 1,

  getDefaultProps: () => ({
    fill: { type: 'solid', color: '#4f7cff' },
    stroke: { color: '#1b3fa0', width: 2 },
    shadow: null,
    cornerRadius: 4,
  }),

  render(shape, ctx, info) {
    const { width, height } = shape
    const radius = cornerRadiusOf(shape)

    paintPath(ctx, {
      buildPath: (target) => {
        if (radius > 0) target.roundRect(0, 0, width, height, radius)
        else target.rect(0, 0, width, height)
      },
      fill: shape.props.fill,
      stroke: shape.props.stroke,
      shadow: shape.props.shadow,
      width,
      height,
      info,
    })
  },

  // The arcs are the same quarter-ellipses `roundRect` draws, so the exported
  // outline is the drawn one rather than a second description of it.
  getPath(shape) {
    const { width: w, height: h } = shape
    const r = cornerRadiusOf(shape)
    if (r <= 0) return `M0,0H${n(w)}V${n(h)}H0Z`
    const arc = `A${n(r)},${n(r)} 0 0 1 `
    return (
      `M${n(r)},0H${n(w - r)}${arc}${n(w)},${n(r)}` +
      `V${n(h - r)}${arc}${n(w - r)},${n(h)}` +
      `H${n(r)}${arc}0,${n(h - r)}` +
      `V${n(r)}${arc}${n(r)},0Z`
    )
  },

  hitTest(shape, point, tolerance) {
    return (
      point.x >= -tolerance &&
      point.y >= -tolerance &&
      point.x <= shape.width + tolerance &&
      point.y <= shape.height + tolerance
    )
  },

  onResize(shape, next) {
    // Keep the radius from exceeding half the shorter side after a resize.
    const max = Math.min(next.width, next.height) / 2
    return shape.props.cornerRadius > max ? { cornerRadius: max } : {}
  },

  getResources(shape) {
    return shape.props.fill.type === 'pattern'
      ? [{ kind: 'image' as const, src: shape.props.fill.src }]
      : []
  },

  getAccessibleLabel: (shape) => `Rectangle ${Math.round(shape.width)}×${Math.round(shape.height)}`,
}
