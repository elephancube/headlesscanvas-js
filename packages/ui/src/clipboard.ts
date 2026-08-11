import type { Editor, HcDocument } from '@headless-canvas/core'

/** Custom MIME type carrying a full document, so a paste keeps every property. */
const MIME = 'application/x-headless-canvas+json'

export interface ClipboardBindingOptions {
  /** Accept dropped image files. Defaults to true. */
  acceptImageDrop?: boolean
}

export interface ClipboardBinding {
  dispose(): void
}

/**
 * Copy, cut, paste and image drop.
 *
 * Deliberately not in the core. The core exposes the primitives —
 * `getSelectionAsDocument` and `insertDocument` — and stops there, because
 * reading the clipboard can trigger a permission prompt and an application
 * needs to decide when that happens (spec §8.3).
 *
 * The document travels in a custom MIME type, with a plain-text fallback so the
 * data is at least inspectable when pasted elsewhere.
 */
export function createClipboardBinding(
  editor: Editor,
  options: ClipboardBindingOptions = {},
): ClipboardBinding {
  const acceptImageDrop = options.acceptImageDrop !== false
  const container = editor.container

  const centreOfView = () => {
    const view = editor.viewport.getVisibleBounds()
    return { x: view.x + view.width / 4, y: view.y + view.height / 4 }
  }

  const write = (event: ClipboardEvent): boolean => {
    if (editor.selection.ids.length === 0) return false
    const document = editor.getSelectionAsDocument()
    const json = JSON.stringify(document)
    event.clipboardData?.setData(MIME, json)
    event.clipboardData?.setData('text/plain', json)
    event.preventDefault()
    return true
  }

  const onCopy = (event: ClipboardEvent) => {
    write(event)
  }

  const onCut = (event: ClipboardEvent) => {
    if (!write(event)) return
    editor.deleteShapes([...editor.selection.ids])
  }

  const onPaste = (event: ClipboardEvent) => {
    const data = event.clipboardData
    if (!data) return

    const raw = data.getData(MIME) || data.getData('text/plain')
    if (raw) {
      const document = parseDocument(raw)
      if (document) {
        event.preventDefault()
        editor.insertDocument(document, centreOfView())
        return
      }
    }

    if (!acceptImageDrop) return
    const files = [...(data.files ?? [])].filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      event.preventDefault()
      void insertImages(editor, files, centreOfView())
    }
  }

  const onDragOver = (event: DragEvent) => {
    if (!acceptImageDrop) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: DragEvent) => {
    if (!acceptImageDrop || !event.dataTransfer) return
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()

    const rect = container.getBoundingClientRect()
    const at = editor.viewport.screenToWorld({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    void insertImages(editor, files, at)
  }

  container.addEventListener('copy', onCopy as EventListener)
  container.addEventListener('cut', onCut as EventListener)
  container.addEventListener('paste', onPaste as EventListener)
  container.addEventListener('dragover', onDragOver)
  container.addEventListener('drop', onDrop)

  return {
    dispose() {
      container.removeEventListener('copy', onCopy as EventListener)
      container.removeEventListener('cut', onCut as EventListener)
      container.removeEventListener('paste', onPaste as EventListener)
      container.removeEventListener('dragover', onDragOver)
      container.removeEventListener('drop', onDrop)
    },
  }
}

function parseDocument(raw: string): HcDocument | null {
  try {
    const parsed = JSON.parse(raw) as HcDocument
    // Anything can end up on the clipboard; only take what looks like ours.
    return typeof parsed?.schemaVersion === 'number' && Array.isArray(parsed.shapes) ? parsed : null
  } catch {
    return null
  }
}

async function insertImages(
  editor: Editor,
  files: readonly File[],
  at: { x: number; y: number },
): Promise<void> {
  let offset = 0
  for (const file of files) {
    const src = await readAsDataUrl(file)
    if (!src) continue
    const size = await measureImage(src)
    editor.createShape({
      type: 'image',
      x: at.x + offset,
      y: at.y + offset,
      width: size.width,
      height: size.height,
      // A data URL is same-origin, so pasted images never taint the canvas
      // and export keeps working (spec §12.1).
      props: { src, naturalSize: size, crossOrigin: null },
    })
    offset += 24
  }
}

function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => resolve(null))
    reader.readAsDataURL(file)
  })
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight }),
    )
    image.addEventListener('error', () => resolve({ width: 200, height: 200 }))
    image.src = src
  })
}
