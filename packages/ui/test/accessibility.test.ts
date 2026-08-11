// @vitest-environment jsdom
import type { Editor } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls } from '../src/index'
import { addRects, createEditor, nextFrame } from './harness'

/**
 * Accessibility is one of the reasons to put the controls in the DOM at all: a
 * competitor that draws its handles into the canvas cannot expose any of this,
 * whatever effort it spends (spec §2.3, §10.1). That makes these tests a check
 * on the product claim, not just on the implementation.
 */

let editor: Editor
let container: HTMLElement

beforeEach(() => {
  ;({ editor, container } = createEditor())
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

describe('canvas container', () => {
  it('is focusable and named', () => {
    expect(container.getAttribute('tabindex')).toBe('0')
    expect(container.getAttribute('role')).toBe('application')
    expect(container.getAttribute('aria-label')).toBeTruthy()
  })

  it('hides the canvas from assistive technology', () => {
    // Nothing meaningful is in the canvas; it is all mirrored into the DOM.
    expect(container.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('handles', () => {
  it('are real buttons, reachable by tab and named', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 1)
    editor.selection.set([ids[0]!])
    await nextFrame()

    const handles = [...container.querySelectorAll<HTMLElement>('.hc-handle')].filter(
      (el) => !el.hidden,
    )
    expect(handles.length).toBeGreaterThan(0)
    for (const handle of handles) {
      expect(handle.tagName).toBe('BUTTON')
      expect(handle.getAttribute('role')).toBe('button')
      expect(handle.getAttribute('tabindex')).toBe('0')
      expect(handle.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('resize from the keyboard', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 1, 40)
    editor.selection.set([ids[0]!])
    await nextFrame()

    const handle = container.querySelector<HTMLElement>('[data-hc-handle="se"]')!
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )

    expect(editor.getShape(ids[0]!)!.width).toBe(41)
  })
})

describe('shape list', () => {
  it('lets a keyboard user select a shape without pointing at the canvas', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 3)
    await nextFrame()

    const buttons = container.querySelectorAll<HTMLButtonElement>('.hc-a11y-list button')
    expect(buttons.length).toBe(3)

    buttons[1]!.click()

    expect(editor.selection.ids).toEqual([ids[1]])
  })

  it('marks which entries are selected', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 2)
    editor.selection.set([ids[0]!])
    await nextFrame()

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.hc-a11y-list button')]
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false')
  })

  it('summarises what is off screen instead of listing everything', async () => {
    createDefaultControls(editor)
    addRects(editor, 2000)
    await nextFrame()

    const items = container.querySelectorAll('.hc-a11y-list li')
    const summary = editor.controls.getA11ySummary()

    expect(summary.visible).toBeLessThan(summary.total)
    expect(items[items.length - 1]!.textContent).toMatch(/more outside the view/)
  })

  it('can be turned off entirely', async () => {
    createDefaultControls(editor, { accessibleList: false })
    addRects(editor, 3)
    await nextFrame()

    expect(container.querySelector('.hc-a11y-list')).toBeNull()
  })
})

describe('live region', () => {
  it('announces selection changes', async () => {
    createDefaultControls(editor)
    const ids = addRects(editor, 3)
    await nextFrame()

    const live = container.querySelector('.hc-a11y-live')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toMatch(/Nothing selected/)

    editor.selection.set([ids[0]!])
    await nextFrame()
    expect(live.textContent).toMatch(/Selected shape/)

    editor.selection.set(ids)
    await nextFrame()
    expect(live.textContent).toMatch(/3 shapes selected/)
  })
})

describe('internationalisation', () => {
  it('uses supplied strings for everything it renders', async () => {
    const localised = createEditor({
      messages: {
        'handle.se': '右下からサイズ変更',
        'selection.multiple': '{count} 個を選択中',
        'shapeList.label': 'キャンバス上の図形',
      },
    })
    createDefaultControls(localised.editor)
    const ids = addRects(localised.editor, 2)
    localised.editor.selection.set(ids)
    await nextFrame()

    const list = localised.container.querySelector('.hc-a11y-list')!
    expect(list.getAttribute('aria-label')).toBe('キャンバス上の図形')
    expect(localised.container.querySelector('.hc-a11y-live')!.textContent).toBe('2 個を選択中')

    localised.editor.selection.set([ids[0]!])
    await nextFrame()
    const handle = localised.container.querySelector('[data-hc-handle="se"]')!
    expect(handle.getAttribute('aria-label')).toBe('右下からサイズ変更')

    localised.editor.dispose()
    localised.container.remove()
  })
})
