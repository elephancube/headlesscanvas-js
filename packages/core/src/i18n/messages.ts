/**
 * Every string the library itself puts in front of a user or a screen reader.
 *
 * These are overridable because a library that hard-codes English `aria-label`s
 * is unusable outside English-speaking products — and accessibility is one of
 * the reasons to build the controls in the DOM in the first place
 * (spec §10.2).
 *
 * Shape labels are deliberately *not* here: they come from
 * `ShapeUtil.getAccessibleLabel`, because a label depends on the shape's own
 * contents and no fixed set of keys can cover a type the library never saw.
 *
 * Adding a key is not a breaking change; removing or renaming one is. Every key
 * in this interface must actually be used by something — an unreachable one
 * costs translators work that can never show up on screen.
 */
export interface Messages {
  'handle.nw': string
  'handle.n': string
  'handle.ne': string
  'handle.e': string
  'handle.se': string
  'handle.s': string
  'handle.sw': string
  'handle.w': string
  'handle.rotate': string
  'selection.none': string
  'selection.single': string
  /** `{count}` is substituted. */
  'selection.multiple': string
  'canvas.label': string
  'shapeList.label': string
  /** `{count}` is substituted. */
  'shapeList.more': string
  /** Appended to a list entry that is currently selected. */
  'shapeList.selected': string
  /** Appended to a list entry whose shape is locked. */
  'state.locked': string
  /** The text editing surface, and the controls that close it. */
  'edit.label': string
  'edit.save': string
  'edit.cancel': string
}

export const defaultMessages: Messages = {
  'handle.nw': 'Resize from top left',
  'handle.n': 'Resize from top',
  'handle.ne': 'Resize from top right',
  'handle.e': 'Resize from right',
  'handle.se': 'Resize from bottom right',
  'handle.s': 'Resize from bottom',
  'handle.sw': 'Resize from bottom left',
  'handle.w': 'Resize from left',
  'handle.rotate': 'Rotate',
  'selection.none': 'Nothing selected',
  'selection.single': 'Selected shape',
  'selection.multiple': '{count} shapes selected',
  'canvas.label': 'Canvas',
  'shapeList.label': 'Shapes on canvas',
  'shapeList.more': '{count} more outside the view',
  'shapeList.selected': 'selected',
  'state.locked': 'locked',
  'edit.label': 'Edit text',
  'edit.save': 'Save',
  'edit.cancel': 'Cancel',
}

export function formatMessage(
  messages: Messages,
  key: keyof Messages,
  params?: Record<string, string | number>,
): string {
  let text = messages[key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value))
    }
  }
  return text
}
