import type { Bounds } from '../math/bounds'

export interface SnapSettings {
  enabled: boolean
  /** Grid pitch in world units, or null for no grid. */
  grid: number | null
  /** Align to other shapes' edges and centres. */
  toObjects: boolean
  /**
   * Catch distance in **screen** pixels.
   *
   * Screen rather than world, because a threshold defined in world units would
   * feel sticky when zoomed in and unreachable when zoomed out (spec §8.6).
   */
  thresholdPx: number
}

export const defaultSnapSettings: SnapSettings = {
  enabled: true,
  grid: null,
  toObjects: true,
  thresholdPx: 5,
}

/** A line to draw while a snap is active. */
export interface SnapGuide {
  axis: 'x' | 'y'
  /** World coordinate of the line. */
  position: number
  /** Extent along the other axis, so the guide spans both shapes involved. */
  start: number
  end: number
}

export interface SnapResult {
  /** Correction to add to the proposed position. */
  dx: number
  dy: number
  guides: SnapGuide[]
}

const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] }

interface Candidate {
  value: number
  /** Extent of the source box along the other axis, for drawing the guide. */
  min: number
  max: number
}

const edgesX = (b: Bounds): Candidate[] => {
  const min = b.y
  const max = b.y + b.height
  return [
    { value: b.x, min, max },
    { value: b.x + b.width / 2, min, max },
    { value: b.x + b.width, min, max },
  ]
}

const edgesY = (b: Bounds): Candidate[] => {
  const min = b.x
  const max = b.x + b.width
  return [
    { value: b.y, min, max },
    { value: b.y + b.height / 2, min, max },
    { value: b.y + b.height, min, max },
  ]
}

interface AxisSnap {
  delta: number
  guides: SnapGuide[]
}

const EPSILON = 1e-9

/**
 * Closest alignment on one axis.
 *
 * Every pair that lands on the winning offset produces a guide, not just the
 * first: when a shape's left, centre and right all line up with a neighbour at
 * once, showing one line would understate what actually happened.
 */
function snapAxis(
  moving: Candidate[],
  targets: Candidate[],
  threshold: number,
  axis: 'x' | 'y',
): AxisSnap {
  let bestDelta = 0
  let bestDistance = threshold
  let found = false

  for (const source of moving) {
    for (const target of targets) {
      const distance = Math.abs(target.value - source.value)
      if (distance >= bestDistance && found) continue
      if (distance > threshold) continue
      bestDistance = distance
      bestDelta = target.value - source.value
      found = true
    }
  }

  if (!found) return { delta: 0, guides: [] }

  const guides: SnapGuide[] = []
  for (const source of moving) {
    for (const target of targets) {
      if (Math.abs(target.value - source.value - bestDelta) > EPSILON) continue
      guides.push({
        axis,
        position: target.value,
        start: Math.min(source.min, target.min),
        end: Math.max(source.max, target.max),
      })
    }
  }

  return { delta: bestDelta, guides }
}

function snapToGrid(value: number, grid: number, threshold: number): number {
  const nearest = Math.round(value / grid) * grid
  return Math.abs(nearest - value) <= threshold ? nearest - value : 0
}

/**
 * Work out how far to nudge `moving` so it lines up with something.
 *
 * Other shapes win over the grid on any given axis: if the user has aligned
 * something by eye, snapping it to a grid line a pixel away would undo their
 * intent.
 */
export function computeSnap(
  moving: Bounds,
  targets: readonly Bounds[],
  settings: SnapSettings,
  zoom: number,
): SnapResult {
  if (!settings.enabled) return NO_SNAP

  const threshold = settings.thresholdPx / zoom
  const guides: SnapGuide[] = []
  let dx = 0
  let dy = 0

  if (settings.toObjects && targets.length > 0) {
    const x = snapAxis(edgesX(moving), targets.flatMap(edgesX), threshold, 'x')
    const y = snapAxis(edgesY(moving), targets.flatMap(edgesY), threshold, 'y')
    dx = x.delta
    dy = y.delta
    guides.push(...x.guides, ...y.guides)
  }

  if (settings.grid !== null && settings.grid > 0) {
    if (dx === 0) dx = snapToGrid(moving.x, settings.grid, threshold)
    if (dy === 0) dy = snapToGrid(moving.y, settings.grid, threshold)
  }

  return { dx, dy, guides }
}
