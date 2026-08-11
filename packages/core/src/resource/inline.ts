/**
 * Turning a decoded image back into bytes.
 *
 * Shared by SVG export and document embedding, because both meet the same wall:
 * a cross-origin image without permissive CORS headers taints the canvas, and
 * its pixels then cannot be read back at all. This is a browser rule with no
 * workaround from JavaScript (spec §12.1), so both callers report the failure
 * and carry on with a URL reference rather than pretending it worked.
 */

export function imageSize(image: CanvasImageSource): { width: number; height: number } | null {
  const source = image as {
    naturalWidth?: number
    naturalHeight?: number
    width?: unknown
    height?: unknown
  }
  const width = source.naturalWidth ?? (typeof source.width === 'number' ? source.width : 0)
  const height = source.naturalHeight ?? (typeof source.height === 'number' ? source.height : 0)
  return width > 0 && height > 0 ? { width, height } : null
}

/** A PNG data URI, or null when the pixels cannot be read. */
export function encodeImage(image: CanvasImageSource): string | null {
  const size = imageSize(image)
  if (!size || typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0)
    const url = canvas.toDataURL('image/png')
    return typeof url === 'string' && url.startsWith('data:') ? url : null
  } catch {
    // The tainting SecurityError, which is the expected failure here.
    return null
  }
}
