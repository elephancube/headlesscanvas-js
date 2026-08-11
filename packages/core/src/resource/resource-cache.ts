import type { Notification } from '../state/notifications'

/**
 * Decoded images and loaded fonts, kept outside the document.
 *
 * The state tree stores a URL and a size; the pixels live here. Putting a
 * decoded image inside an immutable tree would mean copying a reference to a
 * multi-megabyte object on every structural share, and — more importantly — a
 * load completing is not something the user did, so it must not become an undo
 * step (spec §5.6).
 */

export type ResourceStatus = 'loading' | 'loaded' | 'error'

interface ImageEntry {
  status: ResourceStatus
  image: HTMLImageElement | null
  naturalSize: { width: number; height: number } | null
  /** Cross-origin images without CORS headers taint the canvas (spec §12.1). */
  crossOrigin: boolean
  refs: number
}

export interface ResourceCacheOptions {
  /** Called when something finishes loading and a repaint is needed. */
  onChange(): void
  notify(notification: Notification): void
  /** Called with the natural size once known, so the document can record it. */
  onImageSize?(src: string, size: { width: number; height: number }): void
}

function isCrossOrigin(src: string): boolean {
  try {
    const url = new URL(src, globalThis.location?.href ?? 'http://localhost')
    return url.origin !== (globalThis.location?.origin ?? url.origin)
  } catch {
    return false
  }
}

export class ResourceCache {
  private readonly images = new Map<string, ImageEntry>()
  private readonly fonts = new Set<string>()
  /** Bytes carried inside a document, keyed by the URL its shapes reference. */
  private readonly inlined = new Map<string, string>()
  private disposed = false

  constructor(private readonly options: ResourceCacheOptions) {}

  /**
   * The decoded image, or null while it is still loading or after it failed.
   *
   * Callers request rather than await: a missing image simply is not drawn this
   * frame, and the repaint that follows the load picks it up.
   */
  getImage(src: string, crossOrigin: string | null = 'anonymous'): HTMLImageElement | null {
    const existing = this.images.get(src)
    if (existing) return existing.status === 'loaded' ? existing.image : null
    this.loadImage(src, crossOrigin)
    return null
  }

  getStatus(src: string): ResourceStatus | undefined {
    return this.images.get(src)?.status
  }

  /**
   * Supply the bytes for a URL, so it resolves from the document rather than
   * the network.
   *
   * The shapes keep referencing the original URL. Rewriting them would mean the
   * document no longer says where the image came from, and would need every
   * shape type to know where its own URLs live — which is exactly the per-type
   * knowledge the registry exists to avoid.
   *
   * A side effect worth knowing: an inlined image is a data URI, so it is
   * same-origin and cannot taint the canvas. Embedding images in a document
   * therefore also un-breaks PNG export for them.
   */
  inline(src: string, dataUrl: string): void {
    if (this.inlined.get(src) === dataUrl) return
    this.inlined.set(src, dataUrl)
    // Drop any copy fetched from the network so the next request reloads.
    this.images.delete(src)
    if (!this.disposed) this.options.onChange()
  }

  /** Replace the whole inlined set, as loading a new document does. */
  resetInlined(entries: Iterable<readonly [string, string]> = []): void {
    for (const src of this.inlined.keys()) this.images.delete(src)
    this.inlined.clear()
    for (const [src, dataUrl] of entries) this.inline(src, dataUrl)
  }

  /** The bytes carried for this URL, for writing them back out. */
  getInlined(src: string): string | undefined {
    return this.inlined.get(src)
  }

  /** Sources drawn from another origin — the ones that can taint the canvas. */
  getCrossOriginSources(): string[] {
    const out: string[] = []
    for (const [src, entry] of this.images) {
      if (entry.crossOrigin && entry.status === 'loaded') out.push(src)
    }
    return out
  }

  private loadImage(src: string, crossOrigin: string | null): void {
    if (this.disposed) return
    const inlined = this.inlined.get(src)
    const entry: ImageEntry = {
      status: 'loading',
      image: null,
      naturalSize: null,
      // A data URI is same-origin however remote the URL it stands in for.
      crossOrigin: inlined === undefined && isCrossOrigin(src),
      refs: 1,
    }
    this.images.set(src, entry)

    const image = new Image()
    if (inlined === undefined && crossOrigin !== null) image.crossOrigin = crossOrigin

    image.addEventListener('load', () => {
      if (this.disposed) return
      entry.status = 'loaded'
      entry.image = image
      entry.naturalSize = { width: image.naturalWidth, height: image.naturalHeight }
      this.options.onImageSize?.(src, entry.naturalSize)
      this.options.onChange()
    })

    image.addEventListener('error', () => {
      if (this.disposed) return
      entry.status = 'error'
      this.options.notify({
        level: 'warning',
        code: 'resource-load-failed',
        message: `Failed to load image: ${src}`,
        detail: { src },
      })
      this.options.onChange()
    })

    image.src = inlined ?? src
  }

  /**
   * Wait for a font before the first paint.
   *
   * Measuring text against a fallback face and then repainting with the real
   * one shifts the layout under the user, which is worse than a slightly later
   * first frame (spec §5.6).
   */
  async loadFont(family: string, weight = 400, style = 'normal'): Promise<void> {
    const key = `${family}|${weight}|${style}`
    if (this.fonts.has(key)) return
    this.fonts.add(key)
    const fontSet = (globalThis as { document?: Document }).document?.fonts
    if (!fontSet) return
    try {
      await fontSet.load(`${style} ${weight} 16px ${family}`)
      await fontSet.ready
      if (!this.disposed) this.options.onChange()
    } catch (error) {
      this.options.notify({
        level: 'warning',
        code: 'resource-load-failed',
        message: `Failed to load font: ${family}`,
        detail: error,
      })
    }
  }

  /** Drop anything no longer referenced by the document. */
  retain(usedSources: ReadonlySet<string>): void {
    for (const src of [...this.images.keys()]) {
      if (!usedSources.has(src)) this.images.delete(src)
    }
    for (const src of [...this.inlined.keys()]) {
      if (!usedSources.has(src)) this.inlined.delete(src)
    }
  }

  dispose(): void {
    this.disposed = true
    this.images.clear()
    this.fonts.clear()
    this.inlined.clear()
  }
}
