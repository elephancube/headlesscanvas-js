import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { seedScene } from './seed'
import type { Demo } from './types'
import { t } from './types'
import { button, pickColor, scaffold, toggle } from './ui'

/**
 * Level 1: the stock controls, unmodified.
 *
 * The status line reports how many DOM nodes the overlay is carrying. It stays
 * in the low tens no matter how much is on the canvas, because control UI is
 * only ever created for the selection (invariant 2).
 */
export const basics: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  const centre = () => {
    const view = editor.viewport.getVisibleBounds()
    return { x: view.x + view.width / 2, y: view.y + view.height / 2 }
  }

  button(bar, _(['Rectangle', '長方形']), () => {
    const { x, y } = centre()
    editor.createShape({
      type: 'rect',
      x: x - 70 + (Math.random() - 0.5) * 60,
      y: y - 45 + (Math.random() - 0.5) * 60,
      width: 140,
      height: 90,
      props: { fill: { type: 'solid', color: pickColor() }, cornerRadius: 8 },
    })
  })

  button(bar, _(['Ellipse', '楕円']), () => {
    const { x, y } = centre()
    editor.createShape({
      type: 'ellipse',
      x: x - 55 + (Math.random() - 0.5) * 60,
      y: y - 55 + (Math.random() - 0.5) * 60,
      width: 110,
      height: 110,
      props: { fill: { type: 'solid', color: pickColor() } },
    })
  })

  button(bar, _(['Group / ungroup', 'グループ化 / 解除']), () => {
    const ids = [...editor.selection.ids]
    if (ids.length > 1) editor.group(ids)
    else for (const id of ids) if (editor.getShape(id)?.type === 'group') editor.ungroup(id)
  })

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())

  toggle(
    bar,
    (on) => (on ? _(['Tool: hand', 'ツール: ハンド']) : _(['Tool: select', 'ツール: 選択'])),
    false,
    (on) => editor.tools.setCurrent(on ? 'hand' : 'select'),
  )

  button(bar, _(['Zoom to fit', '全体表示']), () => editor.viewport.zoomToFit())
  button(bar, _(['Clear', 'クリア']), () => editor.deleteShapes(editor.getChildren(null)))

  const stop = editor.onFrame(() => {
    const snapshot = editor.getSnapshot()
    const overlayNodes = editor.overlayElement.querySelectorAll('*').length
    setStatus(
      _([
        `${snapshot.shapes.size} shapes · ${snapshot.selectedIds.length} selected · ` +
          `zoom ${Math.round(editor.viewport.camera.z * 100)}% · ${overlayNodes} overlay DOM nodes`,
        `${snapshot.shapes.size} 個 · ${snapshot.selectedIds.length} 個選択中 · ` +
          `ズーム ${Math.round(editor.viewport.camera.z * 100)}% · オーバーレイの DOM ノード ${overlayNodes} 個`,
      ]),
    )
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
