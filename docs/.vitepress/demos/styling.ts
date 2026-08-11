import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import { seedScene } from './seed'
import type { Demo } from './types'
import { t } from './types'
import { colorPicker, scaffold, slider, toggle } from './ui'

interface Rule {
  selector: string
  declarations: string[]
}

/**
 * Rules are kept structured rather than as one string because the page needs
 * two forms of them: the plain CSS to show the reader, and a copy scoped to
 * this demo so it does not restyle the other editors on the page.
 */
function scopeRule(rule: Rule, scope: string): string {
  const prefix = `[data-scope='${scope}']`
  // The stage element is itself the container, so that one selector is
  // combined rather than descended into.
  const selector = rule.selector.startsWith('.hc-container')
    ? `${prefix}${rule.selector}`
    : `${prefix} ${rule.selector}`
  return `${selector} { ${rule.declarations.join(' ')} }`
}

const format = (rules: Rule[]): string =>
  rules
    .map((rule) => `${rule.selector} {\n${rule.declarations.map((d) => `  ${d}`).join('\n')}\n}`)
    .join('\n\n')

/**
 * Level 2: restyling without touching JavaScript.
 *
 * Every control in the toolbar corresponds to a line of CSS, shown alongside.
 * None of it requires the library's cooperation — the class names, the data
 * attributes and the variables are the public contract (spec §7.1).
 */
export const styling: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, status } = scaffold(root)

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  const state = { accent: '#e11d48', handleSize: 12, borderWidth: 2, round: true }

  const scope = `s${Math.random().toString(36).slice(2, 8)}`
  stage.setAttribute('data-scope', scope)

  const sheet = document.createElement('style')
  document.head.append(sheet)

  const code = document.createElement('pre')
  code.className = 'hc-demo-code'
  status.replaceWith(code)

  function apply(): void {
    const rules: Rule[] = [
      {
        selector: '.hc-container',
        declarations: [
          `--hc-accent: ${state.accent};`,
          `--hc-handle-size: ${state.handleSize}px;`,
          `--hc-selection-border-width: ${state.borderWidth}px;`,
        ],
      },
      {
        selector: '.hc-handle',
        declarations: [`border-radius: ${state.round ? '50%' : 'calc(2px / var(--hc-zoom))'};`],
      },
      {
        // One handle singled out by its data attribute. The rotate handle keeps
        // the stock white fill and accent border that the resize handles have —
        // only its distance from the box differs.
        selector: ".hc-handle[data-hc-handle='rotate']",
        declarations: ['--hc-rotate-distance: 32px;'],
      },
    ]

    sheet.textContent = rules.map((rule) => scopeRule(rule, scope)).join('\n')
    code.textContent = format(rules)
  }

  colorPicker(bar, '--hc-accent', state.accent, (value) => {
    state.accent = value
    apply()
  })

  slider(
    bar,
    '--hc-handle-size',
    { min: 6, max: 24, step: 1, value: state.handleSize },
    (value) => {
      state.handleSize = value
      apply()
    },
  )

  slider(
    bar,
    '--hc-selection-border-width',
    { min: 1, max: 6, step: 0.5, value: state.borderWidth },
    (value) => {
      state.borderWidth = value
      apply()
    },
  )

  toggle(
    bar,
    (on) => (on ? _(['Round handles', '丸いハンドル']) : _(['Square handles', '角ハンドル'])),
    state.round,
    (on) => {
      state.round = on
      apply()
    },
  )

  apply()
  seedScene(editor, lang)
  // Something has to be selected for any of this to be visible.
  editor.selection.set(editor.getChildren(null).slice(0, 1))

  return {
    dispose() {
      controls.dispose()
      editor.dispose()
      sheet.remove()
    },
  }
}
