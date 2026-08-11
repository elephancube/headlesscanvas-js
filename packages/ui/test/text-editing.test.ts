// @vitest-environment jsdom

import type { Editor, ShapeId, ShapeUtil } from '@headless-canvas/core'
import { defaultShapeUtils } from '@headless-canvas/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultControls, createTextEditor } from '../src/index'
import { createEditor, fireKey, firePointer } from './harness'

/**
 * Text editing, from the session in the core to the dialog that drives it.
 *
 * The split under test is that the core owns *when* a shape is being edited and
 * how the change reaches the history, while the surface owns only what is on
 * screen — so a session can be driven with no surface at all, and a different
 * surface would behave identically.
 */

let editor: Editor
let container: HTMLDivElement

beforeEach(() => {
  ;({ editor, container } = createEditor())
})

afterEach(() => {
  editor.dispose()
  container.remove()
})

const addText = (text = 'before'): ShapeId =>
  editor.createShape({ type: 'text', x: 10, y: 10, width: 200, height: 60, props: { text } })

const textOf = (id: ShapeId) => editor.getShape<'text'>(id)!.props.text

describe('editing sessions', () => {
  it('opens only for shapes whose util can read and write text', () => {
    const text = addText()
    const rect = editor.createShape({ type: 'rect', x: 0, y: 0, width: 10, height: 10 })

    expect(editor.editing.canEdit(text)).toBe(true)
    expect(editor.editing.canEdit(rect)).toBe(false)
    expect(editor.editing.begin(rect)).toBe(false)
    expect(editor.editing.id).toBeNull()
  })

  it('refuses a locked shape', () => {
    const id = addText()
    editor.updateShape(id, { locked: true })

    expect(editor.editing.canEdit(id)).toBe(false)
    expect(editor.editing.begin(id)).toBe(false)
  })

  it('selects the shape and reports the current text', () => {
    const id = addText('hello')

    expect(editor.editing.begin(id)).toBe(true)
    expect(editor.editing.id).toBe(id)
    expect(editor.editing.initialText).toBe('hello')
    expect(editor.selection.ids).toEqual([id])
    expect(container.getAttribute('data-hc-state')).toBe('editing')
  })

  it('commits as a single undoable step', () => {
    const id = addText('before')
    const undoBefore = editor.history.getSize().undo

    editor.editing.begin(id)
    editor.editing.commit('after')

    expect(textOf(id)).toBe('after')
    expect(editor.history.getSize().undo).toBe(undoBefore + 1)

    editor.history.undo()
    expect(textOf(id)).toBe('before')
  })

  it('records nothing when the text is unchanged', () => {
    const id = addText('same')
    const undoBefore = editor.history.getSize().undo

    editor.editing.begin(id)
    editor.editing.commit('same')

    // Opening an editor and closing it is not an edit, and should not cost an
    // undo step.
    expect(editor.history.getSize().undo).toBe(undoBefore)
  })

  it('leaves the text alone when cancelled', () => {
    const id = addText('before')

    editor.editing.begin(id)
    editor.editing.cancel()

    expect(textOf(id)).toBe('before')
    expect(editor.editing.id).toBeNull()
    expect(container.getAttribute('data-hc-state')).toBe('idle')
  })

  it('notifies subscribers as sessions open and close', () => {
    const id = addText()
    const seen: Array<ShapeId | null> = []
    const stop = editor.editing.subscribe(() => seen.push(editor.editing.id))

    editor.editing.begin(id)
    editor.editing.cancel()
    stop()
    editor.editing.begin(id)

    expect(seen).toEqual([id, null])
  })

  it('starts from the keyboard on a single selection', () => {
    const id = addText()
    editor.selection.set([id])

    fireKey(container, 'Enter')

    expect(editor.editing.id).toBe(id)
  })

  it('opens on double-click over the shape', () => {
    const id = addText()
    container.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 60, clientY: 30 }),
    )

    expect(editor.editing.id).toBe(id)
  })
})

describe('a custom shape that opts in', () => {
  it('is editable on the same terms as the built-in text block', () => {
    interface BadgeShape {
      id: ShapeId
      type: 'badge'
      props: { caption: string }
      [key: string]: unknown
    }

    const badgeUtil = {
      type: 'badge',
      getDefaultProps: () => ({ caption: 'x' }),
      render: () => {},
      hitTest: () => true,
      getText: (shape: BadgeShape) => shape.props.caption,
      setText: (_shape: BadgeShape, text: string) => ({ caption: text }),
    } as unknown as ShapeUtil<any>

    const scoped = createEditor({ shapeUtils: [...defaultShapeUtils, badgeUtil] })
    try {
      const id = scoped.editor.createShape({
        type: 'badge',
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      } as never)

      expect(scoped.editor.editing.begin(id)).toBe(true)
      expect(scoped.editor.editing.initialText).toBe('x')

      scoped.editor.editing.commit('renamed')
      expect((scoped.editor.getShape(id)!.props as { caption: string }).caption).toBe('renamed')
    } finally {
      scoped.editor.dispose()
      scoped.container.remove()
    }
  })
})

describe('the stock dialog', () => {
  it('opens seeded with the current text and saves it back', () => {
    const surface = createTextEditor(editor)
    const id = addText('before')

    editor.editing.begin(id)

    const dialog = container.querySelector<HTMLDialogElement>('.hc-text-dialog')!
    const input = dialog.querySelector<HTMLTextAreaElement>('.hc-text-input')!
    expect(dialog.open).toBe(true)
    expect(input.value).toBe('before')

    input.value = 'after'
    dialog
      .querySelector<HTMLFormElement>('.hc-text-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    expect(textOf(id)).toBe('after')
    expect(dialog.open).toBe(false)
    expect(editor.editing.id).toBeNull()

    surface.dispose()
  })

  it('discards the edit when cancelled', () => {
    const surface = createTextEditor(editor)
    const id = addText('before')

    editor.editing.begin(id)
    const dialog = container.querySelector<HTMLDialogElement>('.hc-text-dialog')!
    dialog.querySelector<HTMLTextAreaElement>('.hc-text-input')!.value = 'discarded'
    dialog.querySelector<HTMLButtonElement>('[data-hc-text-action="cancel"]')!.click()

    expect(textOf(id)).toBe('before')
    expect(editor.editing.id).toBeNull()

    surface.dispose()
  })

  /**
   * Escape on a modal dialog is handled by the browser, which closes it and
   * fires `close`. jsdom implements neither, so the event is dispatched
   * directly — what is under test is our reaction to it, not the engine's.
   */
  it('ends the session when the dialog closes on its own', () => {
    const surface = createTextEditor(editor)
    const id = addText()

    editor.editing.begin(id)
    const dialog = container.querySelector<HTMLDialogElement>('.hc-text-dialog')!
    dialog.removeAttribute('open')
    dialog.dispatchEvent(new Event('close'))

    expect(editor.editing.id).toBeNull()

    surface.dispose()
  })

  it('removes itself on dispose', () => {
    const surface = createTextEditor(editor)
    expect(container.querySelector('.hc-text-dialog')).not.toBeNull()

    surface.dispose()
    expect(container.querySelector('.hc-text-dialog')).toBeNull()
  })
})

describe('pointer ownership inside the dialog', () => {
  /**
   * The dialog is a descendant of the container, so pressing a button in it
   * bubbles a `pointerdown` to the editor. Claiming that event moves focus off
   * the button and captures the pointer on the container — and a captured
   * pointer means the button's `click` never fires, which is exactly what
   * "pressing Save does nothing" looks like.
   */
  it('does not claim a press on the dialog', () => {
    const surface = createTextEditor(editor)
    const id = addText('before')
    const other = editor.createShape({ type: 'rect', x: 0, y: 0, width: 400, height: 300 })
    editor.editing.begin(id)

    let captured = false
    container.setPointerCapture = (() => {
      captured = true
    }) as never

    const save = container.querySelector<HTMLButtonElement>('[data-hc-text-action="save"]')!
    firePointer(save, 'pointerdown', { x: 60, y: 40 })

    expect(captured).toBe(false)
    // The shape under the dialog must not become the selection.
    expect(editor.selection.ids).toEqual([id])
    expect(editor.selection.ids).not.toContain(other)
    expect(editor.editing.id).toBe(id)
    expect(editor.tools.state).toBe('editing')

    surface.dispose()
  })

  it('still claims a press on the canvas itself', () => {
    const id = editor.createShape({ type: 'rect', x: 0, y: 0, width: 200, height: 200 })

    firePointer(editor.canvasElement, 'pointerdown', { x: 50, y: 50 })

    expect(editor.selection.ids).toEqual([id])
  })

  /**
   * Same root cause, and it predates the dialog: the visually hidden shape
   * list is a child of the container too, so its buttons were being swallowed
   * the same way.
   */
  it('does not claim a press on the accessibility list', () => {
    const controls = createDefaultControls(editor)
    const list = container.querySelector('.hc-a11y-list')!

    let captured = false
    container.setPointerCapture = (() => {
      captured = true
    }) as never
    firePointer(list, 'pointerdown', { x: 10, y: 10 })

    expect(captured).toBe(false)
    controls.dispose()
  })
})

describe('keyboard ownership while a field has focus', () => {
  /**
   * The surface is a descendant of the container, so its key events bubble to
   * the editor. Without a guard, typing "v" into it would also switch tools and
   * ⌘Z would undo the document instead of the typing.
   */
  it('does not let typing in the dialog drive the canvas', () => {
    const surface = createTextEditor(editor)
    const id = addText('before')
    editor.editing.begin(id)

    const input = container.querySelector<HTMLTextAreaElement>('.hc-text-input')!
    fireKey(input, 'v')
    fireKey(input, 'h')

    expect(editor.tools.current).toBe('select')

    surface.dispose()
  })

  it('ignores keys from a form control the application put in the container', () => {
    const field = document.createElement('input')
    container.append(field)

    fireKey(field, 'h')

    expect(editor.tools.current).toBe('select')
    field.remove()
  })
})
