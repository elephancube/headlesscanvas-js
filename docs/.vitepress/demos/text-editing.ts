import { Editor } from '@headless-canvas/core'
import { createDefaultControls, createTextEditor } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo, Lang } from './types'
import { t } from './types'
import { button, scaffold, toggle } from './ui'

/**
 * A second editing surface, written for this page.
 *
 * It exists to make the split visible: the core decides *when* a shape is being
 * edited, and this is one of several things that could be on screen while it
 * is. Neither surface knows about the other, and both end the session through
 * the same two calls.
 */
function createPanelSurface(editor: Editor, root: HTMLElement, lang: Lang): { dispose(): void } {
  const _ = t(lang)
  const panel = document.createElement('div')
  panel.className = 'hc-demo-editor-panel'
  panel.hidden = true

  const input = document.createElement('textarea')
  input.rows = 2
  input.setAttribute('aria-label', _(['Edit text', 'テキストを編集']))

  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'hc-demo-button'
  save.textContent = _(['Save', '保存'])

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'hc-demo-button'
  cancel.textContent = _(['Cancel', 'キャンセル'])

  panel.append(input, save, cancel)
  root.append(panel)

  save.addEventListener('click', () => editor.editing.commit(input.value))
  cancel.addEventListener('click', () => editor.editing.cancel())

  const stop = editor.editing.subscribe(() => {
    const open = editor.editing.id !== null
    panel.hidden = !open
    if (!open) return
    input.value = editor.editing.initialText ?? ''
    input.focus()
    input.select()
  })

  return {
    dispose() {
      stop()
      panel.remove()
    },
  }
}

export const textEditing: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)
  let surface: { dispose(): void } = createTextEditor(editor)

  button(bar, _(['Add text', 'テキストを追加']), () => {
    const view = editor.viewport.getVisibleBounds()
    const id = editor.createShape({
      type: 'text',
      x: view.x + 40,
      y: view.y + 40 + Math.random() * 120,
      width: 280,
      height: 44,
      props: { text: _(['New text', '新しいテキスト']), fontSize: 20 },
    })
    editor.selection.set([id])
  })

  button(bar, _(['Edit selected', '選択中を編集']), () => {
    const [id] = editor.selection.ids
    if (id) editor.editing.begin(id)
  })

  toggle(
    bar,
    (on) =>
      on
        ? _(['Surface: inline panel', '編集 UI: パネル'])
        : _(['Surface: modal dialog', '編集 UI: ダイアログ']),
    false,
    (on) => {
      editor.editing.cancel()
      surface.dispose()
      surface = on ? createPanelSurface(editor, root, lang) : createTextEditor(editor)
    },
  )

  const stop = editor.editing.subscribe(() =>
    setStatus(
      editor.editing.id === null
        ? _([
            'Double-click a text shape, or press Enter or F2 with one selected.',
            'テキストをダブルクリック、または選択して Enter か F2 を押してください。',
          ])
        : _(['Editing — the session is open.', '編集中 — セッションが開いています。']),
    ),
  )

  setStatus(
    _([
      'Double-click a text shape, or press Enter or F2 with one selected.',
      'テキストをダブルクリック、または選択して Enter か F2 を押してください。',
    ]),
  )

  editor.transact(() => {
    editor.createShape({
      type: 'text',
      x: 60,
      y: 60,
      width: 300,
      height: 60,
      props: {
        text: _(['Double-click to edit me', 'ダブルクリックで編集']),
        fontSize: 24,
      },
    })
    editor.createShape({
      type: 'rect',
      x: 60,
      y: 160,
      width: 180,
      height: 90,
      props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 8 },
    })
    editor.createShape({
      type: 'text',
      x: 280,
      y: 180,
      width: 240,
      height: 60,
      props: {
        text: _([
          'A rectangle has no text,\nso it will not open.',
          '長方形にはテキストがないので\n開きません。',
        ]),
        fontSize: 15,
        fill: { type: 'solid', color: '#6b7280' },
      },
    })
  })

  return {
    dispose() {
      stop()
      surface.dispose()
      controls.dispose()
      editor.dispose()
    },
  }
}
