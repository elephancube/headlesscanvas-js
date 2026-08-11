import type { Bounds } from '../math/bounds'
import type { ShapeUtilRegistry } from '../shape/shape-util'
import { Canvas2dRenderer } from './canvas2d'
import type { RenderItem } from './renderer'

export interface ExportOptions {
  format?: 'png' | 'jpeg'
  /** 0..1, for JPEG. */
  quality?: number
  /** Output multiplier. Print and hand-off workflows routinely ask for 2–4. */
  scale?: number
  /** World-space region. Defaults to the bounds of everything drawn. */
  bounds?: Bounds
  background?: string | null
  padding?: number
}

/**
 * Raised when the canvas has been tainted by a cross-origin image.
 *
 * This is a browser rule with no workaround: once an image without permissive
 * CORS headers has been drawn, the pixels cannot be read back. Since an editor
 * that exports images will hit it, the error names the responsible sources
 * rather than surfacing an opaque SecurityError (spec §12.1).
 */
export class HcTaintedCanvasError extends Error {
  override readonly name = 'HcTaintedCanvasError'
  readonly sources: string[]

  constructor(sources: string[]) {
    super(
      'Cannot export: the canvas is tainted by cross-origin images. ' +
        'Serve them with CORS headers, or set crossOrigin to null and export on the server. ' +
        `Sources: ${sources.join(', ') || '(unknown)'}`,
    )
    this.sources = sources
  }
}

/** Browsers cap canvas dimensions; beyond it the result is silently blank. */
const MAX_CANVAS_DIMENSION = 8192

export interface ExportParams {
  items: readonly RenderItem[]
  registry: ShapeUtilRegistry
  bounds: Bounds
  options: ExportOptions
  getImage?(src: string): CanvasImageSource | null
  /** Consulted only when the export fails, to name the offending sources. */
  crossOriginSources?(): string[]
}

export async function exportToBlob(params: ExportParams): Promise<Blob> {
  const { items, registry, bounds, options, getImage, crossOriginSources } = params
  const scale = options.scale ?? 1
  const padding = options.padding ?? 0

  const worldWidth = bounds.width + padding * 2
  const worldHeight = bounds.height + padding * 2
  const pixelWidth = Math.ceil(worldWidth * scale)
  const pixelHeight = Math.ceil(worldHeight * scale)

  if (pixelWidth > MAX_CANVAS_DIMENSION || pixelHeight > MAX_CANVAS_DIMENSION) {
    throw new Error(
      `[headless-canvas] export of ${pixelWidth}×${pixelHeight} exceeds the maximum ` +
        `canvas dimension of ${MAX_CANVAS_DIMENSION}. Lower the scale or narrow the bounds.`,
    )
  }
  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error('[headless-canvas] nothing to export: the requested bounds are empty')
  }

  const canvas = document.createElement('canvas')
  const renderer = new Canvas2dRenderer({ canvas, registry })
  // Reuse the display pipeline at a different scale rather than maintaining a
  // second one, so exported output cannot drift from what is on screen.
  renderer.resize(worldWidth, worldHeight, scale)
  renderer.render({
    items,
    camera: { x: bounds.x - padding, y: bounds.y - padding, z: 1 },
    width: worldWidth,
    height: worldHeight,
    getImage,
    isExporting: true,
    background: options.background ?? null,
  })

  assertNotTainted(canvas, crossOriginSources?.() ?? [])

  const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, options.quality)
  })

  if (!blob) {
    throw new Error('[headless-canvas] the browser declined to encode the exported image')
  }
  return blob
}

/**
 * Probe for tainting before encoding.
 *
 * `toBlob` reports failure inconsistently across browsers — sometimes null,
 * sometimes a thrown SecurityError. Reading a single pixel fails predictably.
 */
function assertNotTainted(canvas: HTMLCanvasElement, sources: string[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    ctx.getImageData(0, 0, 1, 1)
  } catch {
    throw new HcTaintedCanvasError(sources)
  }
}
