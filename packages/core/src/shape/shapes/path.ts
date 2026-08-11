import {
  distanceToPolyline,
  emitPath,
  flattenPath,
  type PathCommand,
  parsePath,
  pathData,
} from '../geometry'
import { paintPath } from '../paint'
import type { ShapeUtil } from '../shape-util'
import type { PathShape } from '../types'

/**
 * Parsing the same `d` string on every frame and every hit test would be
 * wasteful, so results are memoised by string. The cache is bounded because a
 * document has a finite number of distinct paths.
 */
const parseCache = new Map<string, PathCommand[]>()
const MAX_CACHE = 512

function commandsFor(d: string): PathCommand[] {
  const cached = parseCache.get(d)
  if (cached) return cached
  const parsed = parsePath(d)
  if (parseCache.size >= MAX_CACHE) parseCache.clear()
  parseCache.set(d, parsed)
  return parsed
}

function scaleFor(shape: PathShape): { sx: number; sy: number } {
  const box = shape.props.viewBox
  if (!box || box.width === 0 || box.height === 0) return { sx: 1, sy: 1 }
  return { sx: shape.width / box.width, sy: shape.height / box.height }
}

export const pathShapeUtil: ShapeUtil<PathShape> = {
  type: 'path',
  propsVersion: 1,

  getDefaultProps: () => ({
    d: 'M 0 0 L 100 0 L 100 100 Z',
    viewBox: { width: 100, height: 100 },
    fill: { type: 'solid', color: '#a855f7' },
    stroke: null,
    shadow: null,
    fillRule: 'nonzero',
  }),

  render(shape, ctx, info) {
    const commands = commandsFor(shape.props.d)
    const { sx, sy } = scaleFor(shape)
    paintPath(ctx, {
      buildPath: (target) => emitPath(target, commands, sx, sy),
      fill: shape.props.fill,
      stroke: shape.props.stroke,
      shadow: shape.props.shadow,
      fillRule: shape.props.fillRule ?? 'nonzero',
      width: shape.width,
      height: shape.height,
      info,
    })
  },

  // Re-emitted rather than passed through: the stored data is in viewBox units
  // and may be relative, while the export needs it in the shape's own space.
  getPath(shape) {
    const { sx, sy } = scaleFor(shape)
    return pathData(commandsFor(shape.props.d), sx, sy)
  },

  hitTest(shape, point, tolerance) {
    const commands = commandsFor(shape.props.d)
    const { sx, sy } = scaleFor(shape)
    const subpaths = flattenPath(commands, sx, sy)

    // A filled path is hit anywhere inside it; an unfilled one only near its
    // outline. Testing the flattened polylines keeps this independent of a 2D
    // context, which the hit tester does not have.
    if (shape.props.fill.type !== 'none') {
      for (const subpath of subpaths) {
        if (windingContains(subpath, point, shape.props.fillRule ?? 'nonzero')) return true
      }
    }

    const strokeWidth = shape.props.stroke?.width ?? 0
    const reach = tolerance + strokeWidth / 2
    for (const subpath of subpaths) {
      if (distanceToPolyline(subpath, point) <= reach) return true
    }
    return false
  },

  getResources(shape) {
    return shape.props.fill.type === 'pattern'
      ? [{ kind: 'image' as const, src: shape.props.fill.src }]
      : []
  },

  getAccessibleLabel: () => 'Path',
}

function windingContains(
  polygon: readonly { x: number; y: number }[],
  point: { x: number; y: number },
  rule: 'nonzero' | 'evenodd',
): boolean {
  if (rule === 'evenodd') {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!
      const b = polygon[j]!
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside
      }
    }
    return inside
  }

  let winding = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y <= point.y) {
      if (b.y > point.y && cross(a, b, point) > 0) winding++
    } else if (b.y <= point.y && cross(a, b, point) < 0) {
      winding--
    }
  }
  return winding !== 0
}

const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): number => (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)
