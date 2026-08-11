import type { Editor, HandleDescriptor, HandleId } from '@headless-canvas/core'

export interface DefaultControlsOptions {
  /** Emit the visually hidden shape list for screen readers. Defaults to true. */
  accessibleList?: boolean
}

export interface DefaultControls {
  dispose(): void
}

/**
 * The stock selection UI.
 *
 * This is plain imperative DOM on purpose. The core is framework-agnostic, so
 * if the only ready-made UI needed React then everyone else would be pushed
 * straight to building their own from scratch (spec §6.3).
 *
 * All the interaction logic lives in `editor.controls`; this module decides
 * what the controls look like and where they sit, nothing more.
 */
export function createDefaultControls(
  editor: Editor,
  options: DefaultControlsOptions = {},
): DefaultControls {
  const doc = editor.overlayElement.ownerDocument
  const showList = options.accessibleList !== false

  const selectionEl = doc.createElement('div')
  selectionEl.className = 'hc-selection'
  selectionEl.hidden = true

  const brushEl = doc.createElement('div')
  brushEl.className = 'hc-brush'
  brushEl.hidden = true

  // A fixed set of handle elements is created once and shown or hidden as the
  // selection changes. The node count is therefore constant rather than
  // proportional to the number of shapes (invariant 2).
  const handleEls = new Map<HandleId, HTMLElement>()
  const unbindHandles: Array<() => void> = []

  const listEl = doc.createElement('ul')
  listEl.className = 'hc-a11y-list'
  listEl.setAttribute('aria-label', editor.message('shapeList.label'))

  const liveEl = doc.createElement('div')
  liveEl.className = 'hc-a11y-live'
  liveEl.setAttribute('aria-live', 'polite')
  liveEl.setAttribute('aria-atomic', 'true')

  // Alignment guides come and go in small numbers; a pool avoids churning the
  // DOM every frame of a drag.
  const guideEls: HTMLElement[] = []

  editor.overlayElement.append(selectionEl, brushEl)
  if (showList) editor.container.append(listEl, liveEl)

  function handleElement(descriptor: HandleDescriptor): HTMLElement {
    let el = handleEls.get(descriptor.id)
    if (el) return el
    const button = doc.createElement('button')
    button.type = 'button'
    el = button
    el.className = 'hc-handle'
    el.style.cursor = descriptor.cursor
    // Pointer capture, keyboard nudging and the ARIA attributes all come from
    // the core primitive, which is also what the React adapter and any
    // hand-written UI call (spec §6.2).
    unbindHandles.push(editor.controls.bindHandle(el, descriptor.id))
    handleEls.set(descriptor.id, el)
    selectionEl.append(el)
    return el
  }

  let lastListKey = ''

  function renderSelection(): void {
    const box = editor.controls.getSelectionBox()
    if (!box) {
      selectionEl.hidden = true
      return
    }

    const { bounds } = box
    selectionEl.hidden = false
    selectionEl.style.width = `${bounds.width}px`
    selectionEl.style.height = `${bounds.height}px`
    // translate puts the box at its world position; rotate then spins it about
    // its own centre, which is where the shape's rotation origin is.
    selectionEl.style.transform = `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`
    selectionEl.setAttribute('data-hc-selection', box.isSingle ? 'single' : 'multiple')
    if (box.hasLocked) selectionEl.setAttribute('data-hc-locked', '')
    else selectionEl.removeAttribute('data-hc-locked')

    const wanted = new Set(box.handles.map((h) => h.id))
    for (const descriptor of box.handles) {
      const el = handleElement(descriptor)
      el.hidden = false
      el.style.left = `${descriptor.position.x * 100}%`
      el.style.top = `${descriptor.position.y * 100}%`
    }
    for (const [id, el] of handleEls) {
      if (!wanted.has(id)) el.hidden = true
    }
  }

  function renderBrush(): void {
    const brush = editor.getBrush()
    if (!brush) {
      brushEl.hidden = true
      return
    }
    brushEl.hidden = false
    brushEl.style.width = `${brush.width}px`
    brushEl.style.height = `${brush.height}px`
    brushEl.style.transform = `translate(${brush.x}px, ${brush.y}px)`
  }

  function renderList(): void {
    if (!showList) return
    const descriptors = editor.controls.getA11yShapeDescriptors()
    const summary = editor.controls.getA11ySummary()
    // Rebuilding this list every frame would churn the DOM for no reason, so it
    // is only touched when the rendered content would actually differ.
    const key = `${summary.total}:${descriptors
      .map((d) => `${d.id}${d.selected ? '*' : ''}${d.locked ? 'L' : ''}`)
      .join(',')}`
    if (key === lastListKey) return
    lastListKey = key

    listEl.replaceChildren()
    for (const descriptor of descriptors) {
      const item = doc.createElement('li')
      // A button rather than plain text: a keyboard user who cannot point at
      // the canvas still needs a way to select a shape, and this is it.
      const button = doc.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-pressed', String(descriptor.selected))
      button.textContent = [
        descriptor.label,
        descriptor.selected ? editor.message('shapeList.selected') : '',
        descriptor.locked ? editor.message('state.locked') : '',
      ]
        .filter(Boolean)
        .join(', ')
      button.addEventListener('click', () => {
        editor.selection.set([descriptor.id])
        editor.viewport.zoomToFit([descriptor.id], 120)
      })
      item.append(button)
      listEl.append(item)
    }

    if (summary.visible < summary.total) {
      const item = doc.createElement('li')
      item.textContent = editor.message('shapeList.more', {
        count: summary.total - summary.visible,
      })
      listEl.append(item)
    }
  }

  function renderGuides(): void {
    const guides = editor.getSnapGuides()

    while (guideEls.length < guides.length) {
      const element = doc.createElement('div')
      element.className = 'hc-guide'
      editor.overlayElement.append(element)
      guideEls.push(element)
    }

    guideEls.forEach((element, index) => {
      const guide = guides[index]
      if (!guide) {
        element.hidden = true
        return
      }
      element.hidden = false
      element.setAttribute('data-hc-guide', guide.axis)
      const length = guide.end - guide.start
      if (guide.axis === 'x') {
        element.style.width = '0px'
        element.style.height = `${length}px`
        element.style.transform = `translate(${guide.position}px, ${guide.start}px)`
      } else {
        element.style.width = `${length}px`
        element.style.height = '0px'
        element.style.transform = `translate(${guide.start}px, ${guide.position}px)`
      }
    })
  }

  let lastAnnouncement = ''

  /**
   * Announce selection changes.
   *
   * The selection box is a visual cue with no textual equivalent; without a
   * live region a screen-reader user gets no feedback that anything happened
   * (spec §10.1).
   */
  function renderAnnouncement(): void {
    if (!showList) return
    const count = editor.selection.ids.length
    const text =
      count === 0
        ? editor.message('selection.none')
        : count === 1
          ? editor.message('selection.single')
          : editor.message('selection.multiple', { count })
    if (text === lastAnnouncement) return
    lastAnnouncement = text
    liveEl.textContent = text
  }

  const stopFrames = editor.onFrame(() => {
    renderSelection()
    renderBrush()
    renderGuides()
    renderList()
    renderAnnouncement()
  })

  return {
    dispose() {
      stopFrames()
      for (const unbind of unbindHandles) unbind()
      selectionEl.remove()
      brushEl.remove()
      listEl.remove()
      liveEl.remove()
      for (const guide of guideEls) guide.remove()
      guideEls.length = 0
      handleEls.clear()
    },
  }
}

export type { ClipboardBinding, ClipboardBindingOptions } from './clipboard'
export { createClipboardBinding } from './clipboard'
export type { TextEditor, TextEditorOptions } from './text-editor'
export { createTextEditor } from './text-editor'
