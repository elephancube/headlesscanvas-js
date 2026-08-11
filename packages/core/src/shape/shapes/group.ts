import type { ShapeUtil } from '../shape-util'
import type { GroupShape } from '../types'

/**
 * A group draws nothing of its own — its children are painted separately, in
 * document order.
 *
 * It is still a real shape: it has bounds, it can be selected, and its
 * transform composes with its children's. Grouping and ungrouping never bake
 * the transform into the children, and ungrouping leaves them looking
 * identical (spec §5.3.4).
 */
export const groupShapeUtil: ShapeUtil<GroupShape> = {
  type: 'group',
  propsVersion: 1,

  getDefaultProps: () => ({}),

  render() {
    // Intentionally empty.
  },

  // Empty, not unrepresentable: the SVG exporter reports the difference.
  toSvg: () => [],

  hitTest(shape, point, tolerance) {
    // Hitting anywhere in the group's bounds selects it; the editor decides
    // whether to descend into the children.
    return (
      point.x >= -tolerance &&
      point.y >= -tolerance &&
      point.x <= shape.width + tolerance &&
      point.y <= shape.height + tolerance
    )
  },

  getAccessibleLabel: () => 'Group',
}
