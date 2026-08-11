import type { Bounds, Matrix, Vec } from '../math'
import { multiply, scaleMatrix, translate } from '../math'

export interface Camera {
  /** World coordinate shown at the top-left of the viewport. */
  x: number
  y: number
  /** Zoom factor; 1 means one world unit per CSS pixel. */
  z: number
}

/**
 * Zoom limits.
 *
 * The upper bound is not arbitrary: the overlay counter-scales handle sizes
 * through a CSS variable, and past a certain zoom the resulting sub-pixel
 * border widths stop rendering reliably (spec §12.4).
 */
export const DEFAULT_ZOOM_RANGE: readonly [number, number] = [0.02, 64]

export const worldToScreenPoint = (camera: Camera, p: Vec): Vec => ({
  x: (p.x - camera.x) * camera.z,
  y: (p.y - camera.y) * camera.z,
})

export const screenToWorldPoint = (camera: Camera, p: Vec): Vec => ({
  x: p.x / camera.z + camera.x,
  y: p.y / camera.z + camera.y,
})

/**
 * The single transform applied to the overlay container.
 *
 * Everything inside the overlay is positioned in world coordinates, so panning
 * and zooming rewrite exactly one `transform` regardless of how many elements
 * are in there (invariant 3).
 */
export const cameraMatrix = (camera: Camera): Matrix =>
  multiply(scaleMatrix(camera.z), translate(-camera.x, -camera.y))

export function visibleBounds(camera: Camera, width: number, height: number): Bounds {
  return {
    x: camera.x,
    y: camera.y,
    width: width / camera.z,
    height: height / camera.z,
  }
}

export const clampZoom = (z: number, range: readonly [number, number]): number =>
  Math.min(range[1], Math.max(range[0], z))
