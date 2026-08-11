/**
 * Chrome for the demos: toolbars, buttons and a status line.
 *
 * None of this is part of the library. HeadlessCanvas deliberately ships no
 * application UI, so every demo has to build its own — which also keeps the
 * boundary visible on the page.
 */

export interface Scaffold {
  bar: HTMLDivElement
  stage: HTMLDivElement
  status: HTMLDivElement
  setStatus(text: string): void
}

export function scaffold(root: HTMLElement, options: { height?: number } = {}): Scaffold {
  const bar = document.createElement('div')
  bar.className = 'hc-demo-bar'

  const stage = document.createElement('div')
  stage.className = 'hc-demo-stage'
  stage.style.height = `${options.height ?? 320}px`

  const status = document.createElement('div')
  status.className = 'hc-demo-status'

  root.append(bar, stage, status)

  return {
    bar,
    stage,
    status,
    setStatus(text) {
      status.textContent = text
    },
  }
}

export function button(bar: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'hc-demo-button'
  el.textContent = label
  el.addEventListener('click', onClick)
  bar.append(el)
  return el
}

/**
 * A button that carries state. `aria-pressed` is set rather than only a class,
 * so the control reads correctly to a screen reader as well as looking pressed.
 */
export function toggle(
  bar: HTMLElement,
  label: (on: boolean) => string,
  initial: boolean,
  onChange: (on: boolean) => void,
): HTMLButtonElement {
  let on = initial
  const el = button(bar, label(on), () => {
    on = !on
    el.textContent = label(on)
    el.setAttribute('aria-pressed', String(on))
    onChange(on)
  })
  el.setAttribute('aria-pressed', String(on))
  return el
}

export function slider(
  bar: HTMLElement,
  label: string,
  options: { min: number; max: number; step: number; value: number },
  onInput: (value: number) => void,
): HTMLInputElement {
  const wrap = document.createElement('label')
  wrap.className = 'hc-demo-field'

  const caption = document.createElement('span')
  caption.textContent = label

  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(options.min)
  input.max = String(options.max)
  input.step = String(options.step)
  input.value = String(options.value)
  input.addEventListener('input', () => onInput(Number(input.value)))

  wrap.append(caption, input)
  bar.append(wrap)
  return input
}

export function colorPicker(
  bar: HTMLElement,
  label: string,
  value: string,
  onInput: (value: string) => void,
): HTMLInputElement {
  const wrap = document.createElement('label')
  wrap.className = 'hc-demo-field'

  const caption = document.createElement('span')
  caption.textContent = label

  const input = document.createElement('input')
  input.type = 'color'
  input.value = value
  input.addEventListener('input', () => onInput(input.value))

  wrap.append(caption, input)
  bar.append(wrap)
  return input
}

const PALETTE = ['#4f7cff', '#22c55e', '#ef4444', '#a855f7', '#14b8a6', '#f59e0b']

export const pickColor = (i?: number): string =>
  PALETTE[(i ?? Math.floor(Math.random() * PALETTE.length)) % PALETTE.length] as string
