/**
 * Chrome shared by the sample applications.
 *
 * None of this is library code. HeadlessCanvas ships no toolbars, panels or
 * dialogs at all (spec §3, non-goals), so an application that wants them builds
 * them — and these pages are applications. Keeping the two apart in the source
 * tree is the same boundary the pages describe in prose.
 */

import type { AnyShape, Editor, HcPointerEvent, ShapeId, Tool } from '@headless-canvas/core'
import type { Text } from '../demos/types'

/** Taller than a feature demo: these are applications, not illustrations. */
export const APP_HEIGHT = 440

export interface AppScaffold {
  bar: HTMLDivElement
  stage: HTMLDivElement
  /** Present only when `panel` was requested. */
  panel: HTMLDivElement | null
  status: HTMLDivElement
  setStatus(text: string): void
  /** A line of guidance under the toolbar. */
  hint(text: string): void
  /** Feedback for a one-off action, below the status line. */
  say(text: string): void
}

export interface AppScaffoldOptions {
  height?: number
  /** Add a column beside the stage for application UI. */
  panel?: boolean
  /** Plain white rather than the dotted stage the feature demos use. */
  plain?: boolean
}

export function appScaffold(root: HTMLElement, options: AppScaffoldOptions = {}): AppScaffold {
  const bar = document.createElement('div')
  bar.className = 'hc-demo-bar'

  const stage = document.createElement('div')
  stage.className = options.plain ? 'hc-demo-stage hc-app-plain' : 'hc-demo-stage'
  stage.style.height = `${options.height ?? APP_HEIGHT}px`

  const status = document.createElement('div')
  status.className = 'hc-demo-status'

  const note = document.createElement('p')
  note.className = 'hc-demo-hint hc-app-note'

  let panel: HTMLDivElement | null = null
  if (options.panel) {
    const split = document.createElement('div')
    split.className = 'hc-demo-split'
    panel = document.createElement('div')
    panel.className = 'hc-demo-panel'
    split.append(stage, panel)
    root.append(bar, split, status, note)
  } else {
    root.append(bar, stage, status, note)
  }

  return {
    bar,
    stage,
    panel,
    status,
    setStatus(text) {
      status.textContent = text
    },
    hint(text) {
      const line = document.createElement('p')
      line.className = 'hc-demo-hint'
      line.textContent = text
      bar.append(line)
    },
    say(text) {
      note.textContent = text
    },
  }
}

export interface RadioOption<T extends string> {
  value: T
  label: string
}

/**
 * A set of mutually exclusive buttons.
 *
 * `aria-pressed` inside a labelled group rather than a class, so the current
 * mode is announced rather than only drawn — the same reason the library puts
 * its own state on data attributes instead of class names.
 */
export function radio<T extends string>(
  bar: HTMLElement,
  groupLabel: string,
  options: readonly RadioOption<T>[],
  initial: T,
  onChange: (value: T) => void,
): (value: T) => void {
  const group = document.createElement('div')
  group.className = 'hc-app-group'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', groupLabel)

  const buttons = new Map<T, HTMLButtonElement>()
  let current = initial

  const select = (value: T): void => {
    current = value
    for (const [key, element] of buttons) {
      element.setAttribute('aria-pressed', String(key === value))
    }
  }

  for (const option of options) {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'hc-demo-button'
    element.textContent = option.label
    element.addEventListener('click', () => {
      if (option.value === current) return
      select(option.value)
      onChange(option.value)
    })
    buttons.set(option.value, element)
    group.append(element)
  }

  select(initial)
  bar.append(group)
  return select
}

export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled'

/** What to tell the user after `shareImage`, so every application says it the same way. */
export function shareOutcomeText(_: (text: Text) => string, outcome: ShareOutcome): string {
  switch (outcome) {
    case 'shared':
      return _(['Handed to the share sheet.', '共有シートに渡しました。'])
    case 'copied':
      return _([
        'Copied to the clipboard — paste it into a post.',
        'クリップボードにコピーしました。投稿欄に貼り付けてください。',
      ])
    case 'downloaded':
      return _([
        'Downloaded — this browser offers neither sharing nor image copy.',
        'ダウンロードしました。このブラウザは共有もクリップボードもサポートしていません。',
      ])
    case 'cancelled':
      return _(['Sharing cancelled.', '共有を取り消しました。'])
  }
}

/**
 * Hand an image to whatever the browser can hand it to.
 *
 * There is no upload endpoint behind this page, and no social network accepts
 * an image through a link — the file has to reach the post from the device. So
 * the useful thing is not "post to X" but "get this file into the share sheet",
 * and the three rungs below are what browsers actually offer:
 *
 * 1. `navigator.share` with a file, which opens the OS share sheet. This is the
 *    real answer on phones and tablets, where most drawing happens.
 * 2. The clipboard, where a PNG can be pasted straight into a post. Desktop.
 * 3. A download, which always works.
 *
 * A dismissed share sheet stops here rather than falling through: handing
 * someone a file they just declined to send is not a fallback.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type })

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  if (blob.type === 'image/png' && typeof ClipboardItem === 'function') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      return 'copied'
    } catch {
      // Denied, or unsupported despite the feature test. Fall through.
    }
  }

  download(filename, blob)
  return 'downloaded'
}

/**
 * Delete whatever the pointer is dragged across.
 *
 * The marked shapes are dimmed through the ephemeral layer while the pointer is
 * down and deleted in one transaction on release, so a swipe that clears five
 * strokes is one entry in the history rather than five — which is what the user
 * means by "undo that" (spec §5.2.4).
 */
export class EraseTool implements Tool {
  readonly id = 'erase'

  private readonly marked = new Set<ShapeId>()
  private erasing = false

  constructor(private readonly editor: Editor) {}

  onExit(): void {
    this.reset()
  }

  onCancel(): void {
    this.reset()
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    this.erasing = true
    this.editor.tools.setState('dragging')
    this.mark(event)
  }

  onPointerMove(event: HcPointerEvent): void {
    if (this.erasing) this.mark(event)
  }

  onPointerUp(): void {
    if (!this.erasing) return
    const ids = [...this.marked]
    this.reset()
    if (ids.length > 0) this.editor.deleteShapes(ids)
  }

  private mark(event: HcPointerEvent): void {
    const target = event.target
    if (target === null || this.marked.has(target)) return
    this.marked.add(target)
    const dimmed: Array<[ShapeId, Partial<AnyShape>]> = [...this.marked].map((id) => [
      id,
      { opacity: 0.15 },
    ])
    this.editor.setEphemeral(new Map(dimmed))
  }

  private reset(): void {
    this.marked.clear()
    this.erasing = false
    this.editor.clearEphemeral()
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
  }
}
