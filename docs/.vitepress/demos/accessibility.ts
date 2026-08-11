import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { seedScene } from './seed'
import type { Demo } from './types'
import { t } from './types'
import { scaffold } from './ui'

/**
 * What a screen reader is given.
 *
 * The hidden list and the live region are invisible by design, which makes them
 * easy to ship broken. This demo mirrors both on screen: the panel on the right
 * is a plain rendering of `controls.getA11yShapeDescriptors()`, and the log
 * below it echoes the live region as its text changes.
 */
export const accessibility: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, status } = scaffold(root)

  const hint = document.createElement('p')
  hint.className = 'hc-demo-hint'
  hint.textContent = _([
    'Click the canvas, then press Tab. The first stop is a hidden button for each shape in view — activate one to select it. Tab again to reach the resize handles and nudge them with the arrow keys.',
    'キャンバスをクリックしてから Tab キーを押してください。最初に到達するのは表示中の各図形に対応する非表示ボタンで、実行すると選択されます。もう一度 Tab を押すとリサイズハンドルに移り、矢印キーで動かせます。',
  ])
  bar.append(hint)

  const split = document.createElement('div')
  split.className = 'hc-demo-split'
  stage.replaceWith(split)

  const canvas = document.createElement('div')
  canvas.className = 'hc-demo-stage'
  canvas.style.height = '340px'

  const panel = document.createElement('div')
  panel.className = 'hc-demo-panel'

  const listTitle = document.createElement('h4')
  listTitle.textContent = _(['Accessibility tree', 'アクセシビリティツリー'])

  const list = document.createElement('ul')
  const summary = document.createElement('p')
  summary.className = 'hc-demo-summary'

  const logTitle = document.createElement('h4')
  logTitle.textContent = _(['Announcements', '読み上げ内容'])
  const log = document.createElement('ol')
  log.className = 'hc-demo-log'

  panel.append(listTitle, list, summary, logTitle, log)
  split.append(canvas, panel)

  const editor = new Editor({ container: canvas })
  const controls = createDefaultControls(editor)

  // Echo the live region instead of recomputing what it says, so the log cannot
  // drift from what assistive technology actually receives.
  const liveEl = canvas.querySelector('.hc-a11y-live')
  const observer = new MutationObserver(() => {
    const text = liveEl?.textContent?.trim()
    if (!text) return
    const item = document.createElement('li')
    item.textContent = text
    log.prepend(item)
    while (log.children.length > 6) log.lastElementChild?.remove()
  })
  if (liveEl) observer.observe(liveEl, { childList: true, characterData: true, subtree: true })

  let lastKey = ''
  const stop = editor.onFrame(() => {
    const descriptors = editor.controls.getA11yShapeDescriptors()
    const totals = editor.controls.getA11ySummary()
    const key = descriptors.map((d) => `${d.id}${d.selected ? '*' : ''}`).join(',')
    if (key === lastKey) return
    lastKey = key

    list.replaceChildren()
    for (const descriptor of descriptors) {
      const item = document.createElement('li')
      item.textContent = descriptor.label
      if (descriptor.selected) item.dataset.selected = ''
      list.append(item)
    }
    summary.textContent = _([
      `${totals.visible} of ${totals.total} shapes are in view. The rest are not in the DOM at all.`,
      `${totals.total} 個中 ${totals.visible} 個が表示範囲内です。残りは DOM に存在しません。`,
    ])
  })

  status.textContent = _([
    'The list is virtualised to the viewport, so the node count stays bounded however large the document is.',
    'リストは表示範囲に仮想化されているため、文書がどれだけ大きくなってもノード数は有界に保たれます。',
  ])

  seedScene(editor, lang)

  return {
    dispose() {
      stop()
      observer.disconnect()
      controls.dispose()
      editor.dispose()
    },
  }
}
