import type { Vec } from '../math/vec'
import { formatNumber } from '../util/format'

/** Geometry helpers shared by the built-in shapes' hit tests. */

export function pointInPolygon(polygon: readonly Vec[], point: Vec): boolean {
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

export function distanceToSegment(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

export function distanceToPolyline(points: readonly Vec[], point: Vec): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(point, points[i - 1]!, points[i]!))
  }
  return best
}

// --- SVG path subset -------------------------------------------------------

export type PathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' }

const NUMBER_PATTERN = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

/**
 * Parse the subset of SVG path syntax the library supports: M, L, H, V, C, Q, Z
 * in both absolute and relative form.
 *
 * Arcs are deliberately absent. Supporting them means implementing the
 * endpoint-to-centre conversion and its degenerate cases, and full SVG import
 * is a Phase 5 concern in any case (spec §8.4) — unsupported commands are
 * skipped rather than throwing, so a partially-supported path still draws.
 */
export function parsePath(d: string): PathCommand[] {
  const commands: PathCommand[] = []
  const tokens = d.match(/[a-df-z][^a-df-z]*/gi) ?? []

  let current: Vec = { x: 0, y: 0 }
  let subpathStart: Vec = { x: 0, y: 0 }
  let previousControl: Vec | null = null

  for (const token of tokens) {
    const letter = token[0]!
    const relative = letter === letter.toLowerCase()
    const command = letter.toUpperCase()
    const numbers = (token.slice(1).match(NUMBER_PATTERN) ?? []).map(Number)

    const rx = (value: number) => (relative ? current.x + value : value)
    const ry = (value: number) => (relative ? current.y + value : value)

    switch (command) {
      case 'M': {
        for (let i = 0; i + 1 < numbers.length; i += 2) {
          const x = rx(numbers[i]!)
          const y = ry(numbers[i + 1]!)
          // Only the first pair is a move; the rest are implicit line-tos.
          commands.push(i === 0 ? { type: 'M', x, y } : { type: 'L', x, y })
          current = { x, y }
          if (i === 0) subpathStart = current
        }
        previousControl = null
        break
      }
      case 'L': {
        for (let i = 0; i + 1 < numbers.length; i += 2) {
          const x = rx(numbers[i]!)
          const y = ry(numbers[i + 1]!)
          commands.push({ type: 'L', x, y })
          current = { x, y }
        }
        previousControl = null
        break
      }
      case 'H': {
        for (const value of numbers) {
          const x = relative ? current.x + value : value
          commands.push({ type: 'L', x, y: current.y })
          current = { x, y: current.y }
        }
        previousControl = null
        break
      }
      case 'V': {
        for (const value of numbers) {
          const y = relative ? current.y + value : value
          commands.push({ type: 'L', x: current.x, y })
          current = { x: current.x, y }
        }
        previousControl = null
        break
      }
      case 'C': {
        for (let i = 0; i + 5 < numbers.length; i += 6) {
          const c = {
            type: 'C' as const,
            x1: rx(numbers[i]!),
            y1: ry(numbers[i + 1]!),
            x2: rx(numbers[i + 2]!),
            y2: ry(numbers[i + 3]!),
            x: rx(numbers[i + 4]!),
            y: ry(numbers[i + 5]!),
          }
          commands.push(c)
          current = { x: c.x, y: c.y }
          previousControl = { x: c.x2, y: c.y2 }
        }
        break
      }
      case 'S': {
        for (let i = 0; i + 3 < numbers.length; i += 4) {
          const reflected: Vec = previousControl
            ? { x: 2 * current.x - previousControl.x, y: 2 * current.y - previousControl.y }
            : current
          const c: PathCommand & { type: 'C' } = {
            type: 'C' as const,
            x1: reflected.x,
            y1: reflected.y,
            x2: rx(numbers[i]!),
            y2: ry(numbers[i + 1]!),
            x: rx(numbers[i + 2]!),
            y: ry(numbers[i + 3]!),
          }
          commands.push(c)
          current = { x: c.x, y: c.y }
          previousControl = { x: c.x2, y: c.y2 }
        }
        break
      }
      case 'Q': {
        for (let i = 0; i + 3 < numbers.length; i += 4) {
          const q = {
            type: 'Q' as const,
            x1: rx(numbers[i]!),
            y1: ry(numbers[i + 1]!),
            x: rx(numbers[i + 2]!),
            y: ry(numbers[i + 3]!),
          }
          commands.push(q)
          current = { x: q.x, y: q.y }
          previousControl = { x: q.x1, y: q.y1 }
        }
        break
      }
      case 'Z': {
        commands.push({ type: 'Z' })
        current = subpathStart
        previousControl = null
        break
      }
      default:
        // Unsupported command (arcs); skip it and keep going.
        break
    }
  }

  return commands
}

/**
 * Anything path commands can be issued against.
 *
 * `CanvasRenderingContext2D` and `Path2D` both satisfy it structurally, and so
 * does the string collector `pathData` uses — which is how the SVG exporter
 * shares one emitter with the canvas renderer instead of walking the commands
 * a second time and drifting.
 */
export interface PathSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void
  closePath(): void
}

/** Issue the parsed commands against a 2D context, a Path2D, or any sink. */
export function emitPath(
  ctx: PathSink,
  commands: readonly PathCommand[],
  scaleX = 1,
  scaleY = 1,
): void {
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        ctx.moveTo(command.x * scaleX, command.y * scaleY)
        break
      case 'L':
        ctx.lineTo(command.x * scaleX, command.y * scaleY)
        break
      case 'C':
        ctx.bezierCurveTo(
          command.x1 * scaleX,
          command.y1 * scaleY,
          command.x2 * scaleX,
          command.y2 * scaleY,
          command.x * scaleX,
          command.y * scaleY,
        )
        break
      case 'Q':
        ctx.quadraticCurveTo(
          command.x1 * scaleX,
          command.y1 * scaleY,
          command.x * scaleX,
          command.y * scaleY,
        )
        break
      case 'Z':
        ctx.closePath()
        break
    }
  }
}

/** The same commands as an SVG `d` attribute. */
export function pathData(
  commands: readonly PathCommand[],
  scaleX = 1,
  scaleY = 1,
  digits = 3,
): string {
  const parts: string[] = []
  const n = (value: number) => formatNumber(value, digits)
  emitPath(
    {
      moveTo: (x, y) => parts.push(`M${n(x)},${n(y)}`),
      lineTo: (x, y) => parts.push(`L${n(x)},${n(y)}`),
      bezierCurveTo: (x1, y1, x2, y2, x, y) =>
        parts.push(`C${n(x1)},${n(y1)} ${n(x2)},${n(y2)} ${n(x)},${n(y)}`),
      quadraticCurveTo: (x1, y1, x, y) => parts.push(`Q${n(x1)},${n(y1)} ${n(x)},${n(y)}`),
      closePath: () => parts.push('Z'),
    },
    commands,
    scaleX,
    scaleY,
  )
  return parts.join('')
}

/**
 * Flatten to polylines for hit testing and bounds.
 *
 * `segments` controls how finely curves are subdivided; 16 is well past the
 * point where the error is visible at reasonable zoom levels.
 */
export function flattenPath(
  commands: readonly PathCommand[],
  scaleX = 1,
  scaleY = 1,
  segments = 16,
): Vec[][] {
  const subpaths: Vec[][] = []
  let currentPath: Vec[] = []
  let current: Vec = { x: 0, y: 0 }
  let start: Vec = { x: 0, y: 0 }

  const push = (point: Vec) => {
    currentPath.push({ x: point.x * scaleX, y: point.y * scaleY })
  }

  for (const command of commands) {
    switch (command.type) {
      case 'M':
        if (currentPath.length > 1) subpaths.push(currentPath)
        currentPath = []
        current = { x: command.x, y: command.y }
        start = current
        push(current)
        break
      case 'L':
        current = { x: command.x, y: command.y }
        push(current)
        break
      case 'C': {
        const from = current
        for (let i = 1; i <= segments; i++) {
          const t = i / segments
          const mt = 1 - t
          push({
            x:
              mt ** 3 * from.x +
              3 * mt * mt * t * command.x1 +
              3 * mt * t * t * command.x2 +
              t ** 3 * command.x,
            y:
              mt ** 3 * from.y +
              3 * mt * mt * t * command.y1 +
              3 * mt * t * t * command.y2 +
              t ** 3 * command.y,
          })
        }
        current = { x: command.x, y: command.y }
        break
      }
      case 'Q': {
        const from = current
        for (let i = 1; i <= segments; i++) {
          const t = i / segments
          const mt = 1 - t
          push({
            x: mt * mt * from.x + 2 * mt * t * command.x1 + t * t * command.x,
            y: mt * mt * from.y + 2 * mt * t * command.y1 + t * t * command.y,
          })
        }
        current = { x: command.x, y: command.y }
        break
      }
      case 'Z':
        if (currentPath.length > 0) push(start)
        current = start
        break
    }
  }

  if (currentPath.length > 1) subpaths.push(currentPath)
  return subpaths
}

// --- freehand --------------------------------------------------------------

/**
 * Ramer–Douglas–Peucker.
 *
 * A pointer reports a sample every few milliseconds, so one stroke arrives as
 * hundreds of points that are visually indistinguishable from a few dozen.
 * Keeping them all costs the document, every hit test and every export
 * forever, so the run is reduced to the points that carry the shape: one is
 * kept only if dropping it would move the line by more than `tolerance`.
 */
export function simplifyPolyline(points: readonly Vec[], tolerance: number): Vec[] {
  if (points.length <= 2 || tolerance <= 0) return [...points]

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  // An explicit stack rather than recursion: the worst case for this algorithm
  // is one frame per point, and a long stroke has thousands.
  const pending: Array<[number, number]> = [[0, points.length - 1]]
  while (pending.length > 0) {
    const [first, last] = pending.pop() as [number, number]
    let worst = tolerance
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(
        points[i] as Vec,
        points[first] as Vec,
        points[last] as Vec,
      )
      if (distance > worst) {
        worst = distance
        index = i
      }
    }
    if (index === -1) continue
    keep[index] = 1
    pending.push([first, index], [index, last])
  }

  return points.filter((_, i) => keep[i] === 1)
}

/**
 * A polyline as a smooth path, through Catmull-Rom converted to cubics.
 *
 * Catmull-Rom passes through every point it is given, which is what a drawn
 * line has to do — an approximating spline would round off the corner the user
 * actually drew. The conversion is exact, so nothing is resampled.
 *
 * `smoothing` scales the tangents: 0 gives straight segments, 1 the standard
 * curve. Above roughly 1.5 the curve starts to overshoot its own points.
 */
export function polylineToPath(points: readonly Vec[], smoothing = 1): PathCommand[] {
  if (points.length === 0) return []

  const first = points[0] as Vec
  const commands: PathCommand[] = [{ type: 'M', x: first.x, y: first.y }]

  // A tap. The zero-length segment is deliberate: it is what a round cap needs
  // in order to paint a dot.
  if (points.length === 1) {
    commands.push({ type: 'L', x: first.x, y: first.y })
    return commands
  }

  if (points.length === 2 || smoothing <= 0) {
    for (let i = 1; i < points.length; i++) {
      const point = points[i] as Vec
      commands.push({ type: 'L', x: point.x, y: point.y })
    }
    return commands
  }

  // The endpoints have no neighbour beyond them, so they stand in for one.
  const k = smoothing / 6
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as Vec
    const p1 = points[i] as Vec
    const p2 = points[i + 1] as Vec
    const p3 = points[Math.min(points.length - 1, i + 2)] as Vec
    commands.push({
      type: 'C',
      x1: p1.x + (p2.x - p0.x) * k,
      y1: p1.y + (p2.y - p0.y) * k,
      x2: p2.x - (p3.x - p1.x) * k,
      y2: p2.y - (p3.y - p1.y) * k,
      x: p2.x,
      y: p2.y,
    })
  }
  return commands
}

export function pathBounds(subpaths: readonly Vec[][]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const subpath of subpaths) {
    for (const point of subpath) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
