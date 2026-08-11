import type { Camera } from '../editor/viewport'
import type { Matrix } from '../math/matrix'
import type { AnyShape } from '../shape/types'

/**
 * One shape ready to draw.
 *
 * The world transform is supplied rather than derived, because with groups a
 * shape's placement depends on its whole ancestor chain and the renderer has no
 * view of the document tree.
 */
export interface RenderItem {
  shape: AnyShape
  worldTransform: Matrix
  /** Multiplied down the ancestor chain. */
  opacity: number
}

export interface RenderScene {
  /** Paint order, already resolved against the ephemeral layer. */
  items: readonly RenderItem[]
  camera: Camera
  width: number
  height: number
  /** Never culled: their committed position is stale mid-interaction. */
  isInteracting?(shape: AnyShape): boolean
  getImage?(src: string): CanvasImageSource | null
  isExporting?: boolean
  background?: string | null
}

/**
 * The drawing back end.
 *
 * v1.0 ships one implementation, Canvas 2D. The interface exists so a WebGL
 * back end can be added later without the scene graph knowing about it —
 * committing to a rendering API is a decision that has to be made once and is
 * expensive to revisit (spec §5.5).
 */
export interface Renderer {
  render(scene: RenderScene): void
  resize(width: number, height: number, devicePixelRatio: number): void
  dispose(): void
}
