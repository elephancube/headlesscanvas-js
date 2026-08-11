import type { Editor } from '@headless-canvas/core'

export interface TextEditorOptions {
  /**
   * Commit on Enter and insert a newline on Shift+Enter, rather than the other
   * way round. Off by default: a text block is multi-line, and a single-line
   * habit would make paragraphs awkward to type.
   */
  submitOnEnter?: boolean
}

export interface TextEditor {
  dispose(): void
}

/**
 * The stock text editing surface: a modal dialog holding a textarea.
 *
 * A dialog rather than a field overlaid on the shape. Overlaying is the obvious
 * approach and it does not work: canvas text metrics and the browser's own text
 * layout are different implementations, so the field's line breaks drift from
 * the rendered ones and the caret lands in the wrong place (spec §8.5). A
 * dialog admits the separation instead of hiding it badly.
 *
 * Which shapes this can edit is not decided here — the core opens a session for
 * any shape whose `ShapeUtil` implements `getText` and `setText`, so a custom
 * shape is editable on the same terms as the built-in text block.
 */
export function createTextEditor(editor: Editor, options: TextEditorOptions = {}): TextEditor {
  const doc = editor.container.ownerDocument
  const submitOnEnter = options.submitOnEnter === true

  const dialog = doc.createElement('dialog')
  dialog.className = 'hc-text-dialog'
  dialog.setAttribute('aria-label', editor.message('edit.label'))

  const form = doc.createElement('form')
  // A dialog-method form closes the dialog and reports which button was used,
  // which is the behaviour we want without scripting it.
  form.method = 'dialog'
  form.className = 'hc-text-form'

  const label = doc.createElement('label')
  label.className = 'hc-text-label'
  label.textContent = editor.message('edit.label')

  const input = doc.createElement('textarea')
  input.className = 'hc-text-input'
  input.rows = 4
  label.append(input)

  const actions = doc.createElement('div')
  actions.className = 'hc-text-actions'

  const cancelButton = doc.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'hc-text-button'
  cancelButton.dataset.hcTextAction = 'cancel'
  cancelButton.textContent = editor.message('edit.cancel')

  const saveButton = doc.createElement('button')
  saveButton.type = 'submit'
  saveButton.className = 'hc-text-button'
  saveButton.dataset.hcTextAction = 'save'
  saveButton.textContent = editor.message('edit.save')

  actions.append(cancelButton, saveButton)
  form.append(label, actions)
  dialog.append(form)
  // Inside the container so the CSS variables and any theming scoped to this
  // editor still reach it, and so two editors on a page stay independent.
  editor.container.append(dialog)

  /** Set while closing on our own initiative, so `close` does not re-enter. */
  let closing = false
  let openFor: string | null = null

  /*
   * `<dialog>` is driven through these two rather than directly, because not
   * every environment that can run the library implements the methods — jsdom
   * has the element but neither `showModal` nor `close`. The `open` attribute
   * is the state either way, so the fallback is the same element in the same
   * state, just without the top layer and focus trap.
   */
  const isOpen = () => dialog.hasAttribute('open')

  function openDialog(): void {
    if (isOpen()) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }

  function closeDialog(): void {
    if (!isOpen()) return
    if (typeof dialog.close === 'function') {
      dialog.close()
      return
    }
    dialog.removeAttribute('open')
    dialog.dispatchEvent(new Event('close'))
  }

  function close(commit: boolean): void {
    if (closing) return
    closing = true
    const text = input.value
    closeDialog()
    closing = false
    openFor = null
    if (commit) editor.editing.commit(text)
    else editor.editing.cancel()
    editor.container.focus({ preventScroll: true })
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    close(true)
  })

  cancelButton.addEventListener('click', () => close(false))

  // Escape closes a modal dialog natively; the session has to end with it.
  dialog.addEventListener('close', () => {
    if (closing || openFor === null) return
    openFor = null
    editor.editing.cancel()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    const wantsSubmit = submitOnEnter ? !event.shiftKey : event.metaKey || event.ctrlKey
    if (!wantsSubmit) return
    event.preventDefault()
    close(true)
  })

  // A session is not a document change, so it has its own channel rather than
  // riding the render loop the way the selection UI does.
  const stopSession = editor.editing.subscribe(() => {
    const id = editor.editing.id

    if (id === null) {
      if (openFor !== null) {
        closing = true
        closeDialog()
        closing = false
      }
      openFor = null
      return
    }

    if (openFor === id) return
    openFor = id
    input.value = editor.editing.initialText ?? ''
    openDialog()
    input.focus()
    input.select()
  })

  return {
    dispose() {
      stopSession()
      closing = true
      closeDialog()
      closing = false
      dialog.remove()
    },
  }
}
