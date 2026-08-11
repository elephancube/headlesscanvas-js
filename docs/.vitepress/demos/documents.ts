import { Editor, HcTaintedCanvasError } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { seedScene } from './seed'
import type { Demo } from './types'
import { t } from './types'
import { button, scaffold } from './ui'

/**
 * Serialisation and export.
 *
 * The JSON pane updates as the scene changes, so the schema version and the
 * shape records are visible rather than described. Loading the text back is the
 * round trip an application would perform against its own storage.
 */
export const documents: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, status } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  const json = document.createElement('pre')
  json.className = 'hc-demo-code hc-demo-code-tall'
  status.replaceWith(json)

  const message = document.createElement('p')
  message.className = 'hc-demo-hint'
  json.after(message)

  button(bar, _(['Export PNG @2x', 'PNG を 2 倍で書き出し']), () => {
    editor
      .export({ format: 'png', scale: 2, background: '#ffffff', padding: 24 })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'headlesscanvas.png'
        link.click()
        URL.revokeObjectURL(url)
      })
      .catch((error: unknown) => {
        // Tainting is a browser rule with no workaround, so the error names the
        // sources responsible rather than failing anonymously (spec §12.1).
        message.textContent =
          error instanceof HcTaintedCanvasError
            ? _([
                `Export blocked by CORS: ${error.sources.join(', ')}`,
                `CORS により書き出しが失敗しました: ${error.sources.join(', ')}`,
              ])
            : String(error)
      })
  })

  // Vectors rather than pixels. Every shape here contributes its own outline
  // through its ShapeUtil, so nothing in the exporter knows what a star is.
  button(bar, _(['Export SVG', 'SVG を書き出し']), () => {
    const svg = editor.exportSvg({ background: '#ffffff', padding: 24 })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'headlesscanvas.svg'
    link.click()
    URL.revokeObjectURL(url)
    message.textContent = _([
      `Wrote ${svg.length.toLocaleString()} characters of SVG.`,
      `${svg.length.toLocaleString()} 文字の SVG を書き出しました。`,
    ])
  })

  /**
   * The same document, as a file. `embedImages` inlines the referenced bitmaps
   * so it opens anywhere; the shapes still record where each one came from.
   */
  button(bar, _(['Save file', 'ファイルに保存']), () => {
    const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'drawing.hcanvas'
    link.click()
    URL.revokeObjectURL(url)
  })

  const picker = document.createElement('input')
  picker.type = 'file'
  picker.accept = '.hcanvas,application/json'
  picker.hidden = true
  bar.append(picker)

  picker.addEventListener('change', () => {
    const file = picker.files?.[0]
    // Cleared either way, so the same file can be chosen twice.
    picker.value = ''
    if (!file) return
    file
      .text()
      .then((text) => {
        editor.loadDocument(JSON.parse(text))
        message.textContent = _(['Opened.', '開きました。'])
      })
      .catch((error: unknown) => {
        message.textContent = String(error)
      })
  })

  button(bar, _(['Open file', 'ファイルを開く']), () => picker.click())

  button(bar, _(['Reload from JSON', 'JSON から読み込み']), () => {
    try {
      editor.loadDocument(JSON.parse(json.textContent ?? ''))
      message.textContent = _(['Loaded.', '読み込みました。'])
    } catch (error) {
      message.textContent = String(error)
    }
  })

  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  let lastVersion = -1
  const stop = editor.onFrame(() => {
    const version = editor.getRenderVersion()
    if (version === lastVersion) return
    lastVersion = version
    json.textContent = JSON.stringify(editor.toJSON(), null, 2)
  })

  seedScene(editor, lang)

  return {
    dispose() {
      stop()
      controls.dispose()
      editor.dispose()
    },
  }
}
