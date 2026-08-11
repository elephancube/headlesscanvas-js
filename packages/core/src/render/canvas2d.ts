import { visibleBounds } from '../editor/viewport'
import { type Bounds, boundsIntersect } from '../math/bounds'
import { applyToPoint, type Matrix } from '../math/matrix'
import type { ShapeUtilRegistry } from '../shape/shape-util'
import type { AnyShape } from '../shape/types'
import type { Renderer, RenderItem, RenderScene } from './renderer'

/** Axis-aligned world bounds of a shape under an arbitrary transform. */
export function worldAabb(shape: AnyShape, transform: Matrix): Bounds {
  const corners = [
    applyToPoint(transform, { x: 0, y: 0 }),
    applyToPoint(transform, { x: shape.width, y: 0 }),
    applyToPoint(transform, { x: shape.width, y: shape.height }),
    applyToPoint(transform, { x: 0, y: shape.height }),
  ]
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of corners) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export interface Canvas2dRendererOptions {
  canvas: HTMLCanvasElement
  registry: ShapeUtilRegistry
}

/**
 * Canvas 2D back end.
 *
 * Two details carry their weight here:
 *
 * - The backing store is sized by `devicePixelRatio`, without which everything
 *   is soft on a high-DPI display.
 * - Shapes outside the viewport are skipped. Culling is not an optimisation to
 *   defer: at the target of 5,000 shapes there is no way to hold 60fps while
 *   zoomed in without it (spec §9.2).
 */
export class Canvas2dRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly registry: ShapeUtilRegistry
  private dpr = 1
  private culledLastFrame = 0
  private drawnLastFrame = 0

  constructor(options: Canvas2dRendererOptions) {
    this.canvas = options.canvas
    this.registry = options.registry
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('[headless-canvas] 2D canvas context unavailable')
    this.ctx = ctx
  }

  /** Shapes skipped by culling on the last frame. Used by the benchmarks. */
  get lastCulledCount(): number {
    return this.culledLastFrame
  }

  get lastDrawnCount(): number {
    return this.drawnLastFrame
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.dpr = devicePixelRatio
    this.canvas.width = Math.max(1, Math.round(width * devicePixelRatio))
    this.canvas.height = Math.max(1, Math.round(height * devicePixelRatio))
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
  }

  render(scene: RenderScene): void {
    const { ctx } = this
    const { camera } = scene

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (scene.background) {
      ctx.fillStyle = scene.background
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }

    const view = visibleBounds(camera, scene.width, scene.height)
    const zoom = camera.z
    const info = {
      zoom,
      isExporting: scene.isExporting ?? false,
      getImage: scene.getImage,
    }

    let culled = 0
    let drawn = 0

    for (const item of scene.items) {
      if (!this.shouldDraw(item, view, scene)) {
        culled++
        continue
      }

      const util = this.registry.get(item.shape.type)
      // Unregistered types stay in the document but are not drawn, so removing
      // a plugin never destroys data (spec §5.4.3).
      if (!util) continue

      const m = item.worldTransform
      ctx.save()
      ctx.setTransform(
        this.dpr * zoom,
        0,
        0,
        this.dpr * zoom,
        this.dpr * -camera.x * zoom,
        this.dpr * -camera.y * zoom,
      )
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
      ctx.globalAlpha = item.opacity
      const blend = (item.shape.props as { blendMode?: GlobalCompositeOperation }).blendMode
      if (blend) ctx.globalCompositeOperation = blend
      util.render(item.shape, ctx, info)
      ctx.restore()
      drawn++
    }

    this.culledLastFrame = culled
    this.drawnLastFrame = drawn
  }

  private shouldDraw(item: RenderItem, view: Bounds, scene: RenderScene): boolean {
    if (!item.shape.visible || item.opacity === 0) return false
    // A shape mid-interaction is drawn unconditionally: culling it against its
    // committed position would make it vanish while being dragged into view
    // (spec §5.2.4).
    if (scene.isInteracting?.(item.shape)) return true
    return boundsIntersect(worldAabb(item.shape, item.worldTransform), view)
  }

  dispose(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
