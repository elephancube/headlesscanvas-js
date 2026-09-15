import type {
  Editor as EditorInstance,
  HcPointerEvent,
  ShapeId,
  Tool,
  Vec,
} from '@headless-canvas/core'
import { Editor, strokeFromPoints } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button, slider } from '../demos/ui'
import { appScaffold, download } from './chrome'

/**
 * Amidakuji — ghost leg.
 *
 * Click between two verticals to lay a rung; click a name at the top and a ball
 * rolls down, taking every rung it meets, to whatever is waiting underneath.
 *
 * The interesting decision here is what belongs to the document and what does
 * not. The ladder and the trail the ball leaves are drawings: you would want
 * them in an exported PNG, so they are shapes. The ball itself and the covers
 * hiding the prizes are neither — they are the application telling you what is
 * happening — so they are DOM in the overlay, and the document never hears
 * about them (invariant 1).
 */

const MIN_LEGS = 3
const MAX_LEGS = 8
const LEG_GAP = 76
const ORIGIN_X = 56
const TOP_Y = 74
const BOTTOM_Y = 396
const ROWS = 11

const LADDER_INK = '#334155'
const RUNG_INK = '#0f766e'
const TRAIL_INK = '#e11d48'

/** Screen pixels within which a click counts as aiming at a rung slot. */
const AIM_PX = 22
/** World units per second the ball travels. */
const SPEED = 460

const legX = (leg: number): number => ORIGIN_X + leg * LEG_GAP
const rowY = (row: number): number => TOP_Y + ((BOTTOM_Y - TOP_Y) * (row + 1)) / (ROWS + 1)
const rungKey = (row: number, gap: number): string => `${row}:${gap}`

/**
 * `meta` is the shape's free-form slot, which the library never reads. It is
 * how this application says "this line is rung 3 in gap 1" without inventing a
 * shape type for something that is an ordinary line.
 */
interface Meta extends Record<string, unknown> {
  role?: string
  leg?: number
  row?: number
  gap?: number
}

const metaOf = (editor: EditorInstance, id: ShapeId): Meta =>
  (editor.getShape(id)?.meta ?? {}) as Meta

/** Rung slots currently occupied, read back from the document. */
function readRungs(editor: EditorInstance): Map<string, ShapeId> {
  const out = new Map<string, ShapeId>()
  for (const id of editor.getChildren(null)) {
    const meta = metaOf(editor, id)
    if (meta.role === 'rung' && meta.row !== undefined && meta.gap !== undefined) {
      out.set(rungKey(meta.row, meta.gap), id)
    }
  }
  return out
}

function shapesWithRole(editor: EditorInstance, role: string): ShapeId[] {
  return editor.getChildren(null).filter((id) => metaOf(editor, id).role === role)
}

/**
 * The walk down the ladder.
 *
 * At every row the runner takes a rung on its left if there is one, otherwise a
 * rung on its right, otherwise carries straight on. Rungs never touch, so the
 * two can never both apply and the result is a permutation.
 */
function walk(rungs: Map<string, ShapeId>, start: number): { points: Vec[]; end: number } {
  let leg = start
  const points: Vec[] = [{ x: legX(leg), y: TOP_Y }]

  for (let row = 0; row < ROWS; row++) {
    const y = rowY(row)
    const left = rungs.has(rungKey(row, leg - 1))
    const right = rungs.has(rungKey(row, leg))
    if (!left && !right) continue
    points.push({ x: legX(leg), y })
    leg += left ? -1 : 1
    points.push({ x: legX(leg), y })
  }

  points.push({ x: legX(leg), y: BOTTOM_Y })
  return { points, end: leg }
}

/** The prefix of a polyline `distance` along it, for the growing trail. */
function prefix(points: readonly Vec[], distance: number): { points: Vec[]; head: Vec } {
  const out: Vec[] = [points[0] as Vec]
  let left = distance

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as Vec
    const to = points[i] as Vec
    const span = Math.hypot(to.x - from.x, to.y - from.y)
    if (span >= left) {
      const ratio = span === 0 ? 0 : left / span
      const head = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
      out.push(head)
      return { points: out, head }
    }
    left -= span
    out.push(to)
  }

  return { points: out, head: points[points.length - 1] as Vec }
}

const totalLength = (points: readonly Vec[]): number => {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as Vec
    const to = points[i] as Vec
    sum += Math.hypot(to.x - from.x, to.y - from.y)
  }
  return sum
}

interface Board {
  legs: number
  onAim(row: number, gap: number): void
  onStart(leg: number): void
}

/** Clicks: a name at the top starts a run, anywhere else aims at a rung slot. */
class LadderTool implements Tool {
  readonly id = 'ladder'

  constructor(
    private readonly editor: EditorInstance,
    private readonly board: Board,
  ) {}

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return

    if (event.target !== null) {
      const meta = metaOf(this.editor, event.target)
      if (meta.role === 'top' && meta.leg !== undefined) {
        this.board.onStart(meta.leg)
        return
      }
    }

    const tolerance = AIM_PX / this.editor.viewport.camera.z
    let row = -1
    let best = tolerance
    for (let candidate = 0; candidate < ROWS; candidate++) {
      const distance = Math.abs(rowY(candidate) - event.world.y)
      if (distance < best) {
        best = distance
        row = candidate
      }
    }
    if (row < 0) return

    const gap = Math.floor((event.world.x - ORIGIN_X) / LEG_GAP)
    if (gap < 0 || gap >= this.board.legs - 1) return
    this.board.onAim(row, gap)
  }
}

export const amidakuji: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint, say } = appScaffold(root, { plain: true })

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  let legs = 6
  let prizes: string[] = []
  let hidden = true
  let trail: ShapeId | null = null
  let animation: number | null = null

  const ball = document.createElement('div')
  ball.className = 'hc-app-ball'
  ball.hidden = true
  editor.overlayElement.append(ball)

  const covers: HTMLElement[] = []

  const winner = () => _(['WIN', 'あたり'])
  const blank = () => _(['—', 'はずれ'])
  const name = (leg: number) => String.fromCharCode(65 + leg)

  const freshPrizes = (count: number): string[] => {
    const out = Array.from({ length: count }, () => blank())
    out[Math.floor(Math.random() * count)] = winner()
    return out
  }

  // --- drawing the ladder ---------------------------------------------------

  const vertical = (x: number, y0: number, y1: number, colour: string, width: number, meta: Meta) =>
    editor.createShape({
      type: 'line',
      x: x - width / 2,
      y: y0,
      width,
      height: y1 - y0,
      meta,
      props: {
        start: { x: 0.5, y: 0 },
        end: { x: 0.5, y: 1 },
        stroke: { color: colour, width, cap: 'round' },
        shadow: null,
      },
    })

  const label = (leg: number, text: string, y: number, role: 'top' | 'bottom') =>
    editor.createShape({
      type: 'text',
      x: legX(leg) - 36,
      y,
      width: 72,
      height: 26,
      meta: { role, leg },
      props: {
        text,
        fontSize: 18,
        fontWeight: role === 'top' ? 600 : 400,
        align: 'center',
        fill: { type: 'solid', color: role === 'top' ? '#0f172a' : '#7c2d12' },
      },
    })

  const rebuild = (): void => {
    stopRun()
    editor.transact(() => {
      editor.deleteShapes(editor.getChildren(null))
      for (let leg = 0; leg < legs; leg++) {
        vertical(legX(leg), TOP_Y, BOTTOM_Y, LADDER_INK, 3, { role: 'leg', leg })
        label(leg, name(leg), TOP_Y - 34, 'top')
        label(leg, prizes[leg] ?? blank(), BOTTOM_Y + 10, 'bottom')
      }
    })
    layoutCovers()
    editor.viewport.zoomToFit(undefined, 48)
  }

  const writePrizes = (): void => {
    editor.transact(() => {
      for (const id of shapesWithRole(editor, 'bottom')) {
        const meta = metaOf(editor, id)
        const shape = editor.getShape<'text'>(id)
        if (!shape || meta.leg === undefined) continue
        editor.updateShape(id, { props: { ...shape.props, text: prizes[meta.leg] ?? blank() } })
      }
    })
  }

  // --- the covers, which are not part of the drawing ------------------------

  const layoutCovers = (): void => {
    while (covers.length < legs) {
      const cover = document.createElement('div')
      cover.className = 'hc-app-cover'
      cover.textContent = '?'
      editor.overlayElement.append(cover)
      covers.push(cover)
    }
    covers.forEach((cover, leg) => {
      cover.hidden = !hidden || leg >= legs
      cover.style.transform = `translate(${legX(leg) - 36}px, ${BOTTOM_Y + 8}px)`
    })
  }

  // --- the run --------------------------------------------------------------

  const clearTrail = (): void => {
    if (trail === null) return
    const doomed = trail
    trail = null
    editor.clearEphemeral()
    editor.transact(() => editor.deleteShapes([doomed]), { addToHistory: false })
  }

  const stopRun = (): void => {
    if (animation !== null) cancelAnimationFrame(animation)
    animation = null
    ball.hidden = true
    clearTrail()
  }

  const geometry = (points: readonly Vec[]) =>
    // Straight segments only, so the fitting is turned off: what is drawn is
    // the ladder itself rather than a smoothed impression of it.
    strokeFromPoints(points, { tolerance: 0, smoothing: 0, color: TRAIL_INK, width: 7 })

  const run = (start: number): void => {
    stopRun()
    const rungs = readRungs(editor)
    const { points, end } = walk(rungs, start)
    const length = totalLength(points)

    // Outside the history: a run is something you watch, not an edit.
    trail = editor.transact(
      () =>
        editor.createShape({
          type: 'path',
          meta: { role: 'trail' },
          ...geometry(points.slice(0, 2)),
        }),
      { addToHistory: false },
    )

    ball.hidden = false
    let travelled = 0
    let last = performance.now()

    const step = (now: number) => {
      travelled = Math.min(length, travelled + ((now - last) / 1000) * SPEED)
      last = now
      const grown = prefix(points, travelled)
      if (trail !== null && grown.points.length > 1) {
        editor.setEphemeral(new Map([[trail, geometry(grown.points)]]))
      }
      ball.style.transform = `translate(${grown.head.x}px, ${grown.head.y}px)`

      if (travelled < length) {
        animation = requestAnimationFrame(step)
        return
      }
      animation = null
      covers[end]?.setAttribute('hidden', '')
      say(_([`${name(start)} → ${prizes[end] ?? ''}`, `${name(start)} → ${prizes[end] ?? ''}`]))
    }

    animation = requestAnimationFrame(step)
  }

  // --- the board ------------------------------------------------------------

  const addRung = (row: number, gap: number): void => {
    const y = rowY(row)
    editor.createShape({
      type: 'line',
      x: legX(gap),
      y: y - 2,
      width: LEG_GAP,
      height: 4,
      meta: { role: 'rung', row, gap },
      props: {
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        stroke: { color: RUNG_INK, width: 4, cap: 'round' },
        shadow: null,
      },
    })
  }

  /**
   * A new rung changes where every run ends, so whatever anyone has already
   * seen of the prizes is now a spoiler. They are covered again and dealt
   * afresh — in the same transaction as the rung, so one undo takes back both.
   */
  const reshuffle = (): void => {
    prizes = freshPrizes(legs)
    writePrizes()
    setHidden(true)
  }

  const toggleRung = (row: number, gap: number): void => {
    stopRun()
    const rungs = readRungs(editor)
    const existing = rungs.get(rungKey(row, gap))
    if (existing) {
      editor.deleteShapes([existing])
      return
    }
    // Touching rungs would make the walk ambiguous, so neighbours block.
    if (rungs.has(rungKey(row, gap - 1)) || rungs.has(rungKey(row, gap + 1))) {
      say(_(['Rungs cannot touch.', '横線どうしは隣り合えません。']))
      return
    }
    editor.transact(() => {
      addRung(row, gap)
      reshuffle()
    })
    say(
      _([
        'New rung — prizes hidden and shuffled.',
        '横線を追加したので、あたりを隠してシャッフルしました。',
      ]),
    )
  }

  editor.tools.register(
    'ladder',
    (e) =>
      new LadderTool(e, {
        get legs() {
          return legs
        },
        onAim: toggleRung,
        onStart: run,
      }),
  )
  editor.tools.setCurrent('ladder')

  // --- controls -------------------------------------------------------------

  slider(
    bar,
    _(['People', '人数']),
    { min: MIN_LEGS, max: MAX_LEGS, step: 1, value: legs },
    (value) => {
      legs = value
      prizes = freshPrizes(legs)
      rebuild()
    },
  )

  button(bar, _(['Scatter rungs', '横線をランダムに']), () => {
    stopRun()
    editor.transact(() => {
      for (const id of shapesWithRole(editor, 'rung')) editor.deleteShapes([id])
      const taken = new Set<string>()
      for (let row = 0; row < ROWS; row++) {
        for (let gap = 0; gap < legs - 1; gap++) {
          if (Math.random() > 0.34) continue
          if (taken.has(rungKey(row, gap - 1)) || taken.has(rungKey(row, gap + 1))) continue
          taken.add(rungKey(row, gap))
          addRung(row, gap)
        }
      }
      reshuffle()
    })
    say(
      _([
        'New rungs — prizes hidden and shuffled.',
        '横線を引き直したので、あたりを隠してシャッフルしました。',
      ]),
    )
  })

  button(bar, _(['Shuffle prizes', 'あたりをシャッフル']), () => {
    stopRun()
    prizes = freshPrizes(legs)
    writePrizes()
    layoutCovers()
  })

  /**
   * Not the demos' `toggle`: that one keeps its state to itself, and a new rung
   * has to be able to switch this back on. The button reads `hidden` instead of
   * holding a copy, so there is only one answer to "are the prizes covered".
   */
  const hiddenButton = button(bar, '', () => setHidden(!hidden))

  function setHidden(value: boolean): void {
    hidden = value
    hiddenButton.textContent = value
      ? _(['Prizes hidden', 'あたりを隠す'])
      : _(['Prizes shown', 'あたりを表示'])
    hiddenButton.setAttribute('aria-pressed', String(value))
    layoutCovers()
  }
  setHidden(hidden)

  button(bar, _(['Reset', 'リセット']), () => {
    stopRun()
    layoutCovers()
    say('')
  })

  button(bar, _(['Save PNG', 'PNG保存']), () => {
    editor
      .export({ format: 'png', scale: 2, background: '#ffffff', padding: 28 })
      .then((blob) => download('amidakuji.png', blob))
      .catch(() => undefined)
  })

  hint(
    _([
      'Click between two verticals to lay a rung. Click a letter at the top to send a ball down.',
      '縦線と縦線のあいだをクリックすると横線が引けます。上の文字をクリックすると玉が転がります。',
    ]),
  )

  const stop = editor.subscribe(() => {
    const rungs = shapesWithRole(editor, 'rung').length
    setStatus(
      _([
        `${legs} people · ${rungs} rung(s) · ${editor.overlayElement.querySelectorAll('*').length} overlay DOM nodes`,
        `${legs} 人 · 横線 ${rungs} 本 · オーバーレイの DOM ノード ${editor.overlayElement.querySelectorAll('*').length} 個`,
      ]),
    )
  })

  prizes = freshPrizes(legs)
  rebuild()

  return {
    dispose() {
      stop()
      stopRun()
      ball.remove()
      for (const cover of covers) cover.remove()
      covers.length = 0
      controls.dispose()
      editor.dispose()
    },
  }
}
