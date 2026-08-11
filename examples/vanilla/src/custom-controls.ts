import type { Editor, HandleId } from '@headless-canvas/core'

/**
 * Level 3 without a framework.
 *
 * Every piece of interaction — pointer capture, keyboard nudging, the ARIA
 * attributes — comes from `editor.controls.bindHandle`. What is written here is
 * only markup and styling, which is the whole claim of the headless approach
 * (spec §6.2).
 *
 * The React example builds the same thing with JSX over the same primitive.
 */
export function createCustomControls(editor: Editor): { dispose(): void } {
  const doc = editor.overlayElement.ownerDocument

  const box = doc.createElement('div')
  Object.assign(box.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    boxSizing: 'border-box',
    border: 'calc(2px / var(--hc-zoom)) dashed #7c3aed',
    background: 'rgb(124 58 237 / 8%)',
  })
  box.hidden = true

  const label = doc.createElement('div')
  Object.assign(label.style, {
    position: 'absolute',
    insetBlockEnd: '100%',
    insetInlineStart: '0',
    marginBlockEnd: 'calc(6px / var(--hc-zoom))',
    // Counter-scaling applies to type as much as to boxes; without this the
    // readout grows with the zoom (spec §12.3).
    fontSize: 'calc(11px / var(--hc-zoom))',
    fontFamily: 'system-ui, sans-serif',
    color: '#7c3aed',
    whiteSpace: 'nowrap',
  })
  box.append(label)

  const handles = new Map<HandleId, HTMLElement>()
  const unbind: Array<() => void> = []

  editor.overlayElement.append(box)

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
    label.textContent = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`

    const wanted = new Set(descriptor.handles.map((handle) => handle.id))
    for (const handle of descriptor.handles) {
      let element = handles.get(handle.id)
      if (!element) {
        element = doc.createElement('button')
        ;(element as HTMLButtonElement).type = 'button'
        Object.assign(element.style, {
          position: 'absolute',
          boxSizing: 'border-box',
          padding: '0',
          width: 'calc(14px / var(--hc-zoom))',
          height: 'calc(14px / var(--hc-zoom))',
          marginLeft: 'calc(-7px / var(--hc-zoom))',
          background: '#fff',
          border: 'calc(2px / var(--hc-zoom)) solid #7c3aed',
          borderRadius: handle.id === 'rotate' ? '50%' : 'calc(2px / var(--hc-zoom))',
          cursor: handle.cursor,
        })
        element.style.marginTop =
          handle.id === 'rotate' ? 'calc(-32px / var(--hc-zoom))' : 'calc(-7px / var(--hc-zoom))'
        unbind.push(editor.controls.bindHandle(element, handle.id))
        handles.set(handle.id, element)
        box.append(element)
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
