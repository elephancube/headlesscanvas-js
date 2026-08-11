import type { RenderInfo } from './shape-util'
import type { Fill, Shadow, Stroke } from './types'

/**
 * Fill, stroke and shadow application shared by every built-in shape.
 *
 * Kept in one place so a custom `ShapeUtil` can reuse the exact same styling
 * semantics rather than approximating them.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function gradientFromStops(
  gradient: CanvasGradient,
  stops: ReadonlyArray<{ offset: number; color: string }>,
): CanvasGradient {
  for (const stop of stops) gradient.addColorStop(clamp01(stop.offset), stop.color)
  return gradient
}

/**
 * Resolve a fill into something assignable to `fillStyle`.
 *
 * Returns null when there is nothing to paint — including a pattern whose image
 * has not loaded yet, which simply skips this frame and is picked up by the
 * repaint that follows the load.
 */
export function resolveFill(
  ctx: CanvasRenderingContext2D,
  fill: Fill,
  width: number,
  height: number,
  info: RenderInfo,
): string | CanvasGradient | CanvasPattern | null {
  switch (fill.type) {
    case 'none':
      return null
    case 'solid':
      return fill.color
    case 'linear': {
      // Project the angle onto the shape box so the gradient spans it fully.
      const cx = width / 2
      const cy = height / 2
      const length =
        Math.abs(width * Math.cos(fill.angle)) + Math.abs(height * Math.sin(fill.angle))
      const dx = (Math.cos(fill.angle) * length) / 2
      const dy = (Math.sin(fill.angle) * length) / 2
      return gradientFromStops(
        ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy),
        fill.stops,
      )
    }
    case 'radial': {
      const cx = width / 2
      const cy = height / 2
      const radius = Math.max(width, height) / 2
      return gradientFromStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, radius), fill.stops)
    }
    case 'pattern': {
      const image = info.getImage?.(fill.src)
      return image ? ctx.createPattern(image, fill.repeat) : null
    }
  }
}

export function applyShadow(
  ctx: CanvasRenderingContext2D,
  shadow: Shadow | null | undefined,
): void {
  ctx.shadowColor = shadow ? shadow.color : 'transparent'
  ctx.shadowBlur = shadow ? shadow.blur : 0
  ctx.shadowOffsetX = shadow ? shadow.offsetX : 0
  ctx.shadowOffsetY = shadow ? shadow.offsetY : 0
}

export function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = stroke.cap ?? 'butt'
  ctx.lineJoin = stroke.join ?? 'miter'
  ctx.setLineDash(stroke.dash ?? [])
}

export interface PaintOptions {
  /** Emits the outline. Called more than once, so it must be side-effect free. */
  buildPath(ctx: CanvasRenderingContext2D): void
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
  fillRule?: CanvasFillRule
  /** Shape box, used to size gradients. */
  width: number
  height: number
  info: RenderInfo
}

/**
 * Paint a shape's outline with its fill and stroke.
 *
 * The 2D context can only stroke centred on the path, so inside and outside
 * alignment are emulated by stroking at double width through a clip — which is
 * why the path is passed as a builder rather than left on the context.
 */
export function paintPath(ctx: CanvasRenderingContext2D, options: PaintOptions): void {
  const { buildPath, fill, stroke, shadow, fillRule, width, height, info } = options

  const fillStyle = resolveFill(ctx, fill, width, height, info)
  if (fillStyle !== null) {
    applyShadow(ctx, shadow)
    ctx.beginPath()
    buildPath(ctx)
    ctx.fillStyle = fillStyle
    ctx.fill(fillRule ?? 'nonzero')
    applyShadow(ctx, null)
  }

  if (!stroke || stroke.width <= 0) return

  // Only shadow the fill; shadowing the stroke as well doubles its density.
  if (fillStyle === null) applyShadow(ctx, shadow)
  applyStrokeStyle(ctx, stroke)

  const align = stroke.align ?? 'center'
  if (align === 'center') {
    ctx.beginPath()
    buildPath(ctx)
    ctx.stroke()
    applyShadow(ctx, null)
    return
  }

  ctx.save()
  ctx.beginPath()
  if (align === 'outside') {
    // Clip to everything *except* the interior by combining a large rectangle
    // with the outline under the even-odd rule.
    ctx.rect(-1e6, -1e6, 2e6, 2e6)
    buildPath(ctx)
    ctx.clip('evenodd')
  } else {
    buildPath(ctx)
    ctx.clip(fillRule ?? 'nonzero')
  }
  ctx.beginPath()
  buildPath(ctx)
  ctx.lineWidth = stroke.width * 2
  ctx.stroke()
  ctx.restore()
  applyShadow(ctx, null)
}
