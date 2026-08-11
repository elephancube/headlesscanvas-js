import { Editor, type HandleId } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { seedScene } from './seed'
import type { Demo, Lang } from './types'
import { t } from './types'
import { scaffold, toggle } from './ui'

/**
 * Level 3: controls written from scratch, with no framework.
 *
 * Nothing here reimplements an interaction. Pointer capture, keyboard nudging
 * and the ARIA attributes all arrive with `editor.controls.bindHandle`, which
 * is the same primitive the stock UI and the React bindings call — there is one
 * copy of that logic, not three (spec §6.2).
 */
function createCustomControls(editor: Editor, lang: Lang): { dispose(): void } {
  const _ = t(lang)
  const doc = editor.overlayElement.ownerDocument

  const box = doc.createElement('div')
  box.className = 'hc-demo-l3-box'
  box.hidden = true

  const readout = doc.createElement('div')
  readout.className = 'hc-demo-l3-readout'
  box.append(readout)

  // A toolbar pinned to the selection. This is the usual reason to reach for
  // Level 3, and it is only possible because the controls are DOM: a canvas
  // cannot hold a button.
  const toolbar = doc.createElement('div')
  toolbar.className = 'hc-demo-l3-toolbar'

  const makeAction = (label: string, onClick: () => void) => {
    const el = doc.createElement('button')
    el.type = 'button'
    el.textContent = label
    el.style.pointerEvents = 'auto'
    el.addEventListener('pointerdown', (event) => event.stopPropagation())
    el.addEventListener('click', onClick)
    toolbar.append(el)
  }

  makeAction(_(['Duplicate', '複製']), () => {
    const document_ = editor.getSelectionAsDocument()
    const ids = editor.insertDocument(document_, { x: 24, y: 24 })
    editor.selection.set(ids)
  })
  makeAction(_(['Delete', '削除']), () => editor.deleteShapes(editor.selection.ids))

  box.append(toolbar)
  editor.overlayElement.append(box)

  const handles = new Map<HandleId, HTMLElement>()
  const unbind: Array<() => void> = []

  const stop = editor.onFrame(() => {
    const descriptor = editor.controls.getSelectionBox()
    if (!descriptor) {
      box.hidden = true
      return
    }

    const { bounds } = descriptor
    box.hidden = false
    box.style.width = `${bounds.width}px`
    box.style.height = `${bounds.height}px`
    box.style.transform = `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`
    readout.textContent = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`

    const wanted = new Set(descriptor.handles.map((handle) => handle.id))
    for (const handle of descriptor.handles) {
      let element = handles.get(handle.id)
      if (!element) {
        const created = doc.createElement('button')
        created.type = 'button'
        created.className = 'hc-demo-l3-handle'
        created.dataset.handle = handle.id
        created.style.cursor = handle.cursor
        // Everything that makes it work comes from here.
        unbind.push(editor.controls.bindHandle(created, handle.id))
        handles.set(handle.id, created)
        box.append(created)
        element = created
      }
      element.hidden = false
      element.style.left = `${handle.position.x * 100}%`
      element.style.top = `${handle.position.y * 100}%`
    }
    for (const [id, element] of handles) {
      if (!wanted.has(id)) element.hidden = true
    }
  })

  return {
    dispose() {
      stop()
      for (const off of unbind) off()
      box.remove()
      handles.clear()
    },
  }
}

export const customControls: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({ container: stage })
  let controls: { dispose(): void } = createCustomControls(editor, lang)

  toggle(
    bar,
    (on) =>
      on
        ? _(['Showing: default controls', '表示中: 既定のコントロール'])
        : _(['Showing: hand-written controls', '表示中: 自作のコントロール']),
    false,
    (on) => {
      controls.dispose()
      controls = on ? createDefaultControls(editor) : createCustomControls(editor, lang)
    },
  )

  setStatus(
    _([
      'Both sets of controls are driven by editor.controls — only the markup differs.',
      'どちらのコントロールも editor.controls が動かしています。違うのはマークアップだけです。',
    ]),
  )

  seedScene(editor, lang)
  editor.selection.set(editor.getChildren(null).slice(0, 1))

  return {
    dispose() {
      controls.dispose()
      editor.dispose()
    },
  }
}
