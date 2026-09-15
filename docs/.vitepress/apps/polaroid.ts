import type { Editor as EditorInstance, HcPointerEvent, ShapeId, Vec } from '@headless-canvas/core'
import { Editor, SelectTool } from '@headless-canvas/core'
import { createDefaultControls, createTextEditor } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button } from '../demos/ui'
import { appScaffold, download } from './chrome'

/**
 * A photo collage.
 *
 * Drop pictures on it and each one lands as a print: a white card, the photo
 * cropped to fit it, and a caption underneath, grouped so the three move as one
 * and tilted a little so the pile looks like a pile.
 *
 * The part worth reading the source for is saving. `toJSON({ embedImages: true })`
 * writes the pictures into the document's `resources` table rather than into
 * the shapes, so one `.hcanvas` file opens anywhere — and the shapes still
 * record where each picture came from, which they would not if the URL had been
 * overwritten (spec §11).
 */

const CARD_W = 208
const CARD_H = 244
const PAD = 12
const PHOTO_W = CARD_W - PAD * 2
const PHOTO_H = 172
const CAPTION_Y = 196
const CAPTION_H = 34

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'

interface Sample {
  src: string
  natural: { width: number; height: number }
  caption: [string, string]
  at: Vec
  rotation: number
}

const SAMPLES: readonly Sample[] = [
  {
    src: `${BASE}sample/photo-1.jpg`,
    natural: { width: 640, height: 480 },
    caption: ['dusk, from the pier', '夕暮れ、桟橋から'],
    at: { x: 40, y: 44 },
    rotation: -0.055,
  },
  {
    src: `${BASE}sample/photo-2.jpg`,
    natural: { width: 640, height: 480 },
    caption: ['the shallows', '浅瀬'],
    at: { x: 268, y: 74 },
    rotation: 0.042,
  },
  {
    src: `${BASE}sample/photo-3.jpg`,
    natural: { width: 640, height: 480 },
    caption: ['late summer', '夏のおわり'],
    at: { x: 496, y: 40 },
    rotation: -0.028,
  },
]

/**
 * The crop that fills the frame without squashing the picture.
 *
 * `image` takes its crop as ratios of the natural size, so this is the same
 * arithmetic `object-fit: cover` does — and it lives in the document, so a
 * saved collage reopens framed exactly as it was left.
 */
function cover(natural: { width: number; height: number }): {
  x: number
  y: number
  width: number
  height: number
} {
  const target = PHOTO_W / PHOTO_H
  const source = natural.width / natural.height
  if (source > target) {
    const width = target / source
    return { x: (1 - width) / 2, y: 0, width, height: 1 }
  }
  const height = source / target
  return { x: 0, y: (1 - height) / 2, width: 1, height }
}

/** The caption inside a card, or null when the shape is not one. */
function captionOf(editor: EditorInstance, id: ShapeId): ShapeId | null {
  const shape = editor.getShape(id)
  if (shape?.type === 'text') return id
  if (shape?.type !== 'group') return null
  for (const child of editor.getChildren(id)) {
    if (editor.getShape(child)?.type === 'text') return child
  }
  return null
}

/**
 * The stock tool, with one change: a double-click anywhere on a card edits its
 * caption rather than trying to edit the card.
 *
 * Subclassed rather than rewritten — moving, resizing, rotating and marquee
 * selection are all wanted exactly as they are.
 */
class CardTool extends SelectTool {
  constructor(private readonly host: EditorInstance) {
    super(host)
  }

  override onDoubleClick(event: HcPointerEvent): void {
    if (event.target === null) return
    const caption = captionOf(this.host, event.target)
    if (caption === null) {
      super.onDoubleClick(event)
      return
    }
    this.host.editing.begin(caption)
  }
}

/** Natural size of an image, or null when it will not load. */
function measure(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = src
  })
}

export const polaroid: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint, say } = appScaffold(root, { plain: true, height: 470 })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)
  const textEditor = createTextEditor(editor)

  editor.tools.register('select', (e) => new CardTool(e))

  /** Object URLs this session made, so they can be handed back on dispose. */
  const owned: string[] = []

  const addCard = (
    src: string,
    natural: { width: number; height: number },
    caption: string,
    at: Vec,
    rotation: number,
  ): ShapeId | null =>
    editor.transact(() => {
      const card = editor.createShape({
        type: 'rect',
        x: at.x,
        y: at.y,
        width: CARD_W,
        height: CARD_H,
        props: {
          fill: { type: 'solid', color: '#ffffff' },
          stroke: null,
          cornerRadius: 2,
          shadow: { color: 'rgb(15 23 42 / 28%)', blur: 18, offsetX: 0, offsetY: 8 },
        },
      })
      const photo = editor.createShape({
        type: 'image',
        x: at.x + PAD,
        y: at.y + PAD,
        width: PHOTO_W,
        height: PHOTO_H,
        props: { src, naturalSize: natural, crop: cover(natural) },
      })
      const text = editor.createShape({
        type: 'text',
        x: at.x + PAD,
        y: at.y + CAPTION_Y,
        width: PHOTO_W,
        height: CAPTION_H,
        props: {
          text: caption,
          fontSize: 17,
          align: 'center',
          fill: { type: 'solid', color: '#334155' },
        },
      })

      // Grouped so a card is one thing to drag, and tilted afterwards so the
      // tilt applies to the print rather than to the paper under the photo.
      const group = editor.group([card, photo, text])
      if (group !== null) editor.updateShape(group, { rotation })
      return group
    })

  /**
   * `File[]` rather than the `FileList` it came from.
   *
   * A file input's `files` is live: clearing `value` — which has to happen, or
   * the same picture cannot be chosen twice — empties the list the caller is
   * still holding. Taking a copy at the boundary makes that impossible to get
   * wrong here.
   */
  const drop = (files: readonly File[], at: Vec): void => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return

    images.forEach((file, index) => {
      const src = URL.createObjectURL(file)
      owned.push(src)
      void measure(src).then((natural) => {
        if (!natural) {
          say(_([`Could not read ${file.name}.`, `${file.name} を読み込めませんでした。`]))
          return
        }
        addCard(
          src,
          natural,
          file.name.replace(/\.[^.]+$/, ''),
          { x: at.x - CARD_W / 2 + index * 26, y: at.y - CARD_H / 2 + index * 18 },
          (Math.random() - 0.5) * 0.16,
        )
      })
    })
  }

  // --- dropping -------------------------------------------------------------

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    stage.dataset.dropping = ''
  }
  const onDragLeave = () => {
    delete stage.dataset.dropping
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    delete stage.dataset.dropping
    const rect = stage.getBoundingClientRect()
    drop(
      [...(event.dataTransfer?.files ?? [])],
      editor.viewport.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }),
    )
  }

  stage.addEventListener('dragover', onDragOver)
  stage.addEventListener('dragleave', onDragLeave)
  stage.addEventListener('drop', onDrop)

  const picker = document.createElement('input')
  picker.type = 'file'
  picker.accept = 'image/*'
  picker.multiple = true
  picker.hidden = true
  picker.addEventListener('change', () => {
    // Copied before the input is cleared: `picker.files` is live, and clearing
    // `value` would empty it out from under this handler.
    const files = [...(picker.files ?? [])]
    picker.value = ''
    const view = editor.viewport.getVisibleBounds()
    drop(files, { x: view.x + view.width / 2, y: view.y + view.height / 2 })
  })
  bar.append(picker)

  // --- controls -------------------------------------------------------------

  button(bar, _(['Add photos', '写真を追加']), () => picker.click())

  button(bar, _(['Edit caption', 'キャプションを編集']), () => {
    const [first] = editor.selection.ids
    const caption = first === undefined ? null : captionOf(editor, first)
    if (caption === null) {
      say(_(['Select a print first.', 'まずプリントを選んでください。']))
      return
    }
    editor.editing.begin(caption)
  })

  button(bar, _(['Scatter', '散らす']), () => {
    const cards = editor.getChildren(null)
    if (cards.length === 0) return
    const columns = Math.ceil(Math.sqrt(cards.length))
    editor.transact(() => {
      cards.forEach((id, index) => {
        editor.updateShape(id, {
          x: 40 + (index % columns) * (CARD_W + 24) + (Math.random() - 0.5) * 18,
          y: 40 + Math.floor(index / columns) * (CARD_H + 24) + (Math.random() - 0.5) * 18,
          rotation: (Math.random() - 0.5) * 0.16,
        })
      })
    })
    editor.viewport.zoomToFit(undefined, 40)
  })

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())
  button(bar, _(['Zoom to fit', '全体表示']), () => editor.viewport.zoomToFit(undefined, 40))

  button(bar, _(['Save PNG', 'PNG保存']), () => {
    if (editor.getChildren(null).length === 0) return
    editor
      .export({ format: 'png', scale: 2, background: '#f8fafc', padding: 36 })
      .then((blob) => {
        download('collage.png', blob)
        say(_(['Saved collage.png at 2×.', 'collage.png を 2 倍で保存しました。']))
      })
      .catch((error: unknown) => say(String(error)))
  })

  /**
   * One file, pictures included.
   *
   * `embedImages` puts each picture into the document's `resources` table as a
   * data URI. The shapes keep their original `src`, so the file records where
   * every picture came from as well as what it looked like.
   */
  button(bar, _(['Save .hcanvas', '.hcanvas で保存']), () => {
    const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
    const json = JSON.stringify(doc)
    download('collage.hcanvas', new Blob([json], { type: 'application/json' }))
    say(
      _([
        `Saved — ${Math.round(json.length / 1024)} KB with the pictures inside.`,
        `保存しました。写真ごと ${Math.round(json.length / 1024)} KB です。`,
      ]),
    )
  })

  const opener = document.createElement('input')
  opener.type = 'file'
  opener.accept = '.hcanvas,application/json'
  opener.hidden = true
  opener.addEventListener('change', () => {
    const file = opener.files?.[0]
    opener.value = ''
    if (!file) return
    void file
      .text()
      .then((text) => {
        editor.loadDocument(JSON.parse(text))
        editor.viewport.zoomToFit(undefined, 40)
        say(_(['Opened.', '開きました。']))
      })
      .catch((error: unknown) => say(String(error)))
  })
  bar.append(opener)

  button(bar, _(['Open .hcanvas', '.hcanvas を開く']), () => opener.click())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  hint(
    _([
      'Drag photographs onto the pile. Double-click a print to write on it. Nothing leaves your browser.',
      '写真をドラッグ&ドロップしてください。プリントをダブルクリックすると書き込めます。写真がブラウザの外に出ることはありません。',
    ]),
  )

  const stop = editor.subscribe(() => {
    setStatus(
      _([
        `${editor.getChildren(null).length} print(s) · ${editor.selection.ids.length} selected`,
        `${editor.getChildren(null).length} 枚 · ${editor.selection.ids.length} 枚選択中`,
      ]),
    )
  })

  editor.transact(() => {
    for (const sample of SAMPLES) {
      addCard(sample.src, sample.natural, _(sample.caption), sample.at, sample.rotation)
    }
  })
  editor.viewport.zoomToFit(undefined, 40)

  return {
    dispose() {
      stop()
      stage.removeEventListener('dragover', onDragOver)
      stage.removeEventListener('dragleave', onDragLeave)
      stage.removeEventListener('drop', onDrop)
      for (const url of owned) URL.revokeObjectURL(url)
      owned.length = 0
      textEditor.dispose()
      controls.dispose()
      editor.dispose()
    },
  }
}
