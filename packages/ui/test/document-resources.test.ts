// @vitest-environment jsdom

import type { Editor, HcDocument, Notification, ShapeId } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from './harness'

/**
 * Images carried inside a document.
 *
 * The property under test is that a document can be made to stand alone without
 * the shapes changing: they keep referencing the URL the image came from, and
 * the bytes travel beside them. Anything else would mean every shape type
 * knowing where its own URLs live.
 */

const PIXEL = 'data:image/png;base64,iVBORw0KGgo='
const REMOTE = 'https://example.test/photo.png'

let editor: Editor
let container: HTMLDivElement

/**
 * jsdom neither fetches images nor fires their load events, so `new Image()` is
 * replaced with one that resolves the moment a src is assigned. What is under
 * test is the cache's bookkeeping, not the browser's loader.
 */
class InstantImage {
  crossOrigin: string | null = null
  naturalWidth = 4
  naturalHeight = 4
  loaded: string | null = null
  private readonly handlers = new Map<string, Array<() => void>>()

  addEventListener(type: string, handler: () => void): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler)
    this.handlers.set(type, list)
  }

  set src(value: string) {
    this.loaded = value
    for (const handler of this.handlers.get('load') ?? []) handler()
  }

  get src(): string {
    return this.loaded ?? ''
  }
}

let created: InstantImage[] = []

beforeEach(() => {
  created = []
  vi.stubGlobal(
    'Image',
    class extends InstantImage {
      constructor() {
        super()
        created.push(this)
      }
    },
  )
  // The stub canvas returns undefined from every method it does not define.
  HTMLCanvasElement.prototype.toDataURL = (() => PIXEL) as never
  ;({ editor, container } = createEditor())
})

afterEach(() => {
  editor.dispose()
  container.remove()
  vi.unstubAllGlobals()
})

const addImage = (src: string): ShapeId =>
  editor.createShape({ type: 'image', x: 0, y: 0, width: 40, height: 40, props: { src } })

describe('embedding on save', () => {
  it('writes the bytes beside the shapes, which still name the original URL', () => {
    addImage(REMOTE)

    const doc = editor.toJSON(undefined, { embedImages: true })

    expect(doc.resources).toEqual({ [REMOTE]: PIXEL })
    expect((doc.shapes[0]?.props as { src?: string })?.src).toBe(REMOTE)
  })

  it('leaves them out unless asked', () => {
    addImage(REMOTE)

    expect(editor.toJSON().resources).toBeUndefined()
  })

  it('does not re-encode an image that is already a data URI', () => {
    addImage(PIXEL)

    expect(editor.toJSON(undefined, { embedImages: true }).resources).toBeUndefined()
  })

  /**
   * A cross-origin image without CORS headers cannot be read back at all. The
   * document is still written — losing the drawing over one unreadable bitmap
   * would be the worse failure — but the caller is told.
   */
  it('reports an image it cannot read, and still writes the document', () => {
    HTMLCanvasElement.prototype.toDataURL = (() => {
      throw new Error('SecurityError')
    }) as never
    addImage(REMOTE)
    const seen: Notification[] = []
    editor.subscribeNotifications((notification) => seen.push(notification))

    const doc = editor.toJSON(undefined, { embedImages: true })

    expect(doc.shapes).toHaveLength(1)
    expect(doc.resources).toBeUndefined()
    expect(seen).toHaveLength(1)
    expect(seen[0]?.code).toBe('export-failed')
    expect(seen[0]?.detail).toEqual({ sources: [REMOTE] })
  })
})

describe('loading a document that carries images', () => {
  const documentWith = (src: string): HcDocument => {
    const scoped = createEditor()
    try {
      scoped.editor.createShape({
        type: 'image',
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        props: { src },
      })
      return scoped.editor.toJSON(undefined, { embedImages: true })
    } finally {
      scoped.editor.dispose()
      scoped.container.remove()
    }
  }

  it('serves the image from the document rather than the network', () => {
    const doc = documentWith(REMOTE)

    created = []
    editor.loadDocument(doc)

    // The shape asked for the remote URL; what was actually loaded is the copy
    // the document brought with it.
    expect(created).toHaveLength(1)
    expect(created[0]?.src).toBe(PIXEL)
    // A data URI is same-origin, so it also cannot taint the canvas.
    expect(created[0]?.crossOrigin).toBeNull()
  })

  /**
   * Re-saving without `embedImages` must not quietly drop what the file
   * arrived with — the same reasoning that keeps unregistered shape types.
   */
  it('writes them back out on a plain save', () => {
    editor.loadDocument(documentWith(REMOTE))

    expect(editor.toJSON().resources).toEqual({ [REMOTE]: PIXEL })
  })

  it('drops the ones no shape references any more', () => {
    editor.loadDocument(documentWith(REMOTE))
    editor.deleteShapes(editor.getChildren(null))

    expect(editor.toJSON().resources).toBeUndefined()
  })

  it('replaces the previous document’s copies rather than accumulating them', () => {
    editor.loadDocument(documentWith(REMOTE))
    editor.loadDocument({ schemaVersion: 1, shapes: [] })

    created = []
    addImage(REMOTE)

    // A second document that references the same URL but embeds nothing must
    // get the real image, not the bytes the first one happened to carry.
    expect(created[0]?.src).toBe(REMOTE)
    expect(editor.toJSON().resources).toBeUndefined()
  })

  it('carries them through a copy so a paste elsewhere still has the image', () => {
    editor.loadDocument(documentWith(REMOTE))
    editor.selection.set(editor.getChildren(null))

    expect(editor.getSelectionAsDocument().resources).toEqual({ [REMOTE]: PIXEL })
  })
})
