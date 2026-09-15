import type {
  Editor as EditorInstance,
  HcPointerEvent,
  ShapeId,
  Tool,
  Vec,
} from '@headless-canvas/core'
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from '../demos/types'
import { t } from '../demos/types'
import { button } from '../demos/ui'
import { appScaffold, download } from './chrome'

/**
 * Tangram.
 *
 * Seven pieces, one silhouette, and the only interactions are drag, rotate by
 * 45° and flip. That is a narrow enough set that the stock select tool would be
 * wrong — it also resizes, rotates freely and deletes — so the puzzle brings
 * its own tool and hides the handles, which between them make an illegal move
 * unreachable rather than merely discouraged.
 *
 * The placements below were computed once, offline, and checked by sampling the
 * assembled square: every point covered by exactly one piece. Deriving a
 * dissection by hand and trusting it is how tangram apps end up with a puzzle
 * that cannot quite be solved.
 */

type Kind = 'large' | 'medium' | 'small' | 'square' | 'parallelogram'

interface KindSpec {
  width: number
  height: number
  d: string
  /** The mirrored outline, for the one piece that has a distinct reflection. */
  mirror?: string
  /**
   * Rotations, in eighths of a turn, after which the piece looks identical.
   * A square repeats every quarter turn, a parallelogram every half.
   */
  period: number
  color: string
}

const KINDS: Record<Kind, KindSpec> = {
  large: {
    width: 135.765,
    height: 135.765,
    d: 'M0,0L135.765,0L0,135.765Z',
    period: 8,
    color: '#ef4444',
  },
  medium: {
    width: 96,
    height: 96,
    d: 'M0,0L96,0L0,96Z',
    period: 8,
    color: '#22c55e',
  },
  small: {
    width: 67.882,
    height: 67.882,
    d: 'M0,0L67.882,0L0,67.882Z',
    period: 8,
    color: '#f59e0b',
  },
  square: {
    width: 67.882,
    height: 67.882,
    d: 'M0,0L67.882,0L67.882,67.882L0,67.882Z',
    period: 2,
    color: '#14b8a6',
  },
  parallelogram: {
    width: 144,
    height: 48,
    d: 'M0,0L96,0L144,48L48,48Z',
    mirror: 'M48,0L144,0L96,48L0,48Z',
    period: 4,
    color: '#ec4899',
  },
}

interface Slot {
  kind: Kind
  x: number
  y: number
  /** Eighths of a turn clockwise. */
  turns: number
  flipped: boolean
}

/** Where the assembled square sits, so the tray has room beside it. */
const BOARD = { x: 60, y: 44 }

const SOLUTION: readonly Slot[] = [
  { kind: 'large', x: 28.118, y: -67.882, turns: 5, flipped: false },
  { kind: 'large', x: -67.882, y: 28.118, turns: 3, flipped: false },
  { kind: 'medium', x: 96, y: 96, turns: 4, flipped: false },
  { kind: 'small', x: 158.059, y: 14.059, turns: 7, flipped: false },
  { kind: 'square', x: 110.059, y: 62.059, turns: 1, flipped: false },
  { kind: 'small', x: 62.059, y: 110.059, turns: 1, flipped: false },
  { kind: 'parallelogram', x: 0, y: 144, turns: 0, flipped: true },
].map((slot) => ({ ...slot, x: slot.x + BOARD.x, y: slot.y + BOARD.y }) as Slot)

/** Where the pieces wait before anyone has moved them. */
const TRAY: ReadonlyArray<{ kind: Kind; x: number; y: number; turns: number }> = [
  { kind: 'large', x: 320, y: 30, turns: 0 },
  { kind: 'large', x: 480, y: 30, turns: 2 },
  { kind: 'medium', x: 330, y: 190, turns: 6 },
  { kind: 'small', x: 452, y: 190, turns: 4 },
  { kind: 'small', x: 540, y: 190, turns: 0 },
  { kind: 'square', x: 330, y: 300, turns: 0 },
  { kind: 'parallelogram', x: 430, y: 310, turns: 0 },
]

const EIGHTH = Math.PI / 4

/** Rotation as eighths of a turn, 0..7. */
const turnsOf = (rotation: number): number => ((Math.round(rotation / EIGHTH) % 8) + 8) % 8

/** Distance below which a dropped piece clicks into an empty slot. */
const SNAP = 26

/** How exactly a piece has to sit before it counts as placed. */
const SEATED = 0.5

interface PieceActions {
  /** The position a piece should take once released from `x, y`. */
  settle(id: ShapeId, x: number, y: number): Vec
  rotate(): void
  flip(): void
}

/**
 * Move, rotate, flip. Nothing else.
 *
 * Written rather than configured, because the stock select tool's repertoire —
 * free rotation, resizing, deletion — is exactly the set of things that would
 * turn a solvable puzzle into an unsolvable one.
 */
class PieceTool implements Tool {
  readonly id = 'piece'

  private drag: { id: ShapeId; grab: Vec; from: Vec } | null = null

  constructor(
    private readonly editor: EditorInstance,
    private readonly actions: PieceActions,
  ) {}

  onExit(): void {
    this.abandon()
  }

  onCancel(): void {
    this.abandon()
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    const target = event.target
    if (target === null) {
      this.editor.selection.clear()
      return
    }
    const shape = this.editor.getShape(target)
    // The silhouette is locked, and locked things are scenery.
    if (!shape || shape.locked) return

    this.editor.selection.set([target])
    // Picking a piece up brings it to the front. Pieces overlap constantly
    // while a solution is being assembled, and dragging one that stays buried
    // under its neighbours reads as the wrong piece moving.
    //
    // Kept out of the history on purpose: z-order here follows from touching
    // something, so undo should not have to walk back through every piece the
    // user merely clicked on.
    this.editor.transact(() => this.editor.reorder([target], 'front'), { addToHistory: false })
    this.drag = { id: target, grab: event.world, from: { x: shape.x, y: shape.y } }
    this.editor.tools.setState('dragging')
  }

  onPointerMove(event: HcPointerEvent): void {
    const drag = this.drag
    if (!drag) return
    this.editor.setEphemeral(new Map([[drag.id, this.moved(drag, event)]]))
  }

  onPointerUp(event: HcPointerEvent): void {
    const drag = this.drag
    this.drag = null
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
    if (!drag) return

    const loose = this.moved(drag, event)
    // The whole drag is one entry, and the piece clicks into place as part of
    // it rather than as a second, separately undoable nudge.
    this.editor.setEphemeral(new Map([[drag.id, this.actions.settle(drag.id, loose.x, loose.y)]]))
    this.editor.commitEphemeral()
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    if (key === 'r') {
      this.actions.rotate()
      return true
    }
    if (key === 'f') {
      this.actions.flip()
      return true
    }
    return false
  }

  private moved(drag: { grab: Vec; from: Vec }, event: HcPointerEvent): Vec {
    return {
      x: drag.from.x + (event.world.x - drag.grab.x),
      y: drag.from.y + (event.world.y - drag.grab.y),
    }
  }

  private abandon(): void {
    this.drag = null
    this.editor.clearEphemeral()
    if (this.editor.tools.state === 'dragging') this.editor.tools.setState('idle')
  }
}

export const tangram: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus, hint, say } = appScaffold(root, { plain: true, height: 470 })

  // No handles: there is nothing here to resize, and a rotate handle would turn
  // pieces to angles no tangram has. They are elements, so one rule removes
  // them — and `display: none` takes them out of the tab order too.
  stage.classList.add('hc-app-pick')

  const editor = new Editor({ container: stage })
  const controls = createDefaultControls(editor)

  const ghosts: ShapeId[] = []
  const pieces: ShapeId[] = []

  const kindOf = (id: ShapeId): Kind | null => {
    const kind = editor.getShape(id)?.meta.kind
    return typeof kind === 'string' ? (kind as Kind) : null
  }

  const flippedOf = (id: ShapeId): boolean => editor.getShape(id)?.meta.flipped === true

  /** The slot a piece is sitting in, or -1. */
  const slotOf = (id: ShapeId): number => {
    const shape = editor.getShape(id)
    const kind = kindOf(id)
    if (!shape || !kind) return -1
    const spec = KINDS[kind]
    const turns = turnsOf(shape.rotation)
    return SOLUTION.findIndex(
      (slot) =>
        slot.kind === kind &&
        slot.flipped === flippedOf(id) &&
        (turns - slot.turns) % spec.period === 0 &&
        Math.abs(shape.x - slot.x) < SEATED &&
        Math.abs(shape.y - slot.y) < SEATED,
    )
  }

  const occupied = (except: ShapeId): Set<number> => {
    const taken = new Set<number>()
    for (const id of pieces) {
      if (id === except) continue
      const slot = slotOf(id)
      if (slot >= 0) taken.add(slot)
    }
    return taken
  }

  const actions: PieceActions = {
    /**
     * Drop a piece into a matching empty slot when it lands close enough.
     *
     * The magnet is what makes the puzzle feel like one: without it the last
     * few pixels are a test of the mouse rather than of the solver.
     */
    settle(id, x, y) {
      const kind = kindOf(id)
      const shape = editor.getShape(id)
      if (!kind || !shape) return { x, y }
      const spec = KINDS[kind]
      const turns = turnsOf(shape.rotation)
      const flipped = flippedOf(id)
      const taken = occupied(id)

      for (let index = 0; index < SOLUTION.length; index++) {
        if (taken.has(index)) continue
        const slot = SOLUTION[index] as Slot
        if (slot.kind !== kind || slot.flipped !== flipped) continue
        if ((turns - slot.turns) % spec.period !== 0) continue
        if (Math.hypot(x - slot.x, y - slot.y) > SNAP) continue
        return { x: slot.x, y: slot.y }
      }
      return { x, y }
    },

    rotate() {
      const id = editor.selection.ids[0]
      const shape = id ? editor.getShape(id) : undefined
      if (!id || !shape) return needSelection()
      editor.transact(() => {
        editor.updateShape(id, { rotation: shape.rotation + EIGHTH })
        const settled = actions.settle(id, shape.x, shape.y)
        editor.updateShape(id, settled)
      })
    },

    flip() {
      const id = editor.selection.ids[0]
      const shape = id ? editor.getShape(id) : undefined
      const kind = id ? kindOf(id) : null
      if (!id || !shape || !kind) return needSelection()
      const spec = KINDS[kind]
      if (!spec.mirror) {
        say(
          _([
            'Only the parallelogram has a distinct mirror image.',
            '鏡像が別物になるのは平行四辺形だけです。',
          ]),
        )
        return
      }
      const flipped = !flippedOf(id)
      editor.transact(() => {
        editor.updateShape(id, {
          meta: { ...shape.meta, flipped },
          props: { ...shape.props, d: flipped ? (spec.mirror as string) : spec.d },
        })
        editor.updateShape(id, actions.settle(id, shape.x, shape.y))
      })
    },
  }

  const needSelection = () => say(_(['Select a piece first.', 'まずピースを選んでください。']))

  editor.tools.register('piece', (e) => new PieceTool(e, actions))
  editor.tools.setCurrent('piece')

  // --- the board ------------------------------------------------------------

  const pieceProps = (kind: Kind, flipped: boolean, ghost: boolean) => {
    const spec = KINDS[kind]
    return {
      d: flipped && spec.mirror ? spec.mirror : spec.d,
      viewBox: { width: spec.width, height: spec.height },
      fill: { type: 'solid' as const, color: ghost ? '#e2e8f0' : spec.color },
      stroke: ghost ? null : { color: 'rgb(255 255 255 / 65%)', width: 1.5 },
      shadow: null,
      fillRule: 'nonzero' as const,
    }
  }

  editor.transact(() => {
    // The silhouette is the solution drawn in grey. Deriving it from the same
    // table means the target and the answer cannot disagree.
    for (const slot of SOLUTION) {
      const spec = KINDS[slot.kind]
      ghosts.push(
        editor.createShape({
          type: 'path',
          x: slot.x,
          y: slot.y,
          width: spec.width,
          height: spec.height,
          rotation: slot.turns * EIGHTH,
          locked: true,
          meta: { role: 'ghost' },
          props: pieceProps(slot.kind, slot.flipped, true),
        }),
      )
    }

    for (const start of TRAY) {
      const spec = KINDS[start.kind]
      pieces.push(
        editor.createShape({
          type: 'path',
          x: start.x,
          y: start.y,
          width: spec.width,
          height: spec.height,
          rotation: start.turns * EIGHTH,
          meta: { kind: start.kind, flipped: false },
          props: pieceProps(start.kind, false, false),
        }),
      )
    }
  })

  // --- controls -------------------------------------------------------------

  button(bar, _(['Rotate 45°', '45° 回す']), actions.rotate)
  button(bar, _(['Flip', '反転']), actions.flip)

  button(bar, _(['Shuffle', 'ちらばす']), () => {
    editor.transact(() => {
      for (const id of pieces) {
        editor.updateShape(id, {
          x: 300 + Math.random() * 260,
          y: 20 + Math.random() * 300,
          rotation: Math.floor(Math.random() * 8) * EIGHTH,
        })
      }
    })
    editor.selection.clear()
  })

  button(bar, _(['Solve it', '答えを見る']), () => {
    editor.transact(() => {
      const used = new Set<number>()
      for (const id of pieces) {
        const kind = kindOf(id)
        const index = SOLUTION.findIndex((slot, i) => !used.has(i) && slot.kind === kind)
        if (index < 0) continue
        used.add(index)
        const slot = SOLUTION[index] as Slot
        const shape = editor.getShape(id)
        editor.updateShape(id, {
          x: slot.x,
          y: slot.y,
          rotation: slot.turns * EIGHTH,
          meta: { kind, flipped: slot.flipped },
          props: { ...shape?.props, ...pieceProps(slot.kind, slot.flipped, false) },
        })
      }
    })
    editor.selection.clear()
  })

  let showGhosts = true
  button(bar, _(['Hide the target', '目標を隠す']), function (this: void) {
    showGhosts = !showGhosts
    // Showing a hint is not an edit, so it stays out of the history.
    editor.transact(
      () => {
        for (const id of ghosts) editor.updateShape(id, { visible: showGhosts })
      },
      { addToHistory: false },
    )
  })

  button(bar, _(['Undo', '元に戻す']), () => editor.history.undo())
  button(bar, _(['Redo', 'やり直す']), () => editor.history.redo())

  button(bar, _(['Export SVG', 'SVG を書き出し']), () => {
    const svg = editor.exportSvg({ background: '#ffffff', padding: 24 })
    download('tangram.svg', new Blob([svg], { type: 'image/svg+xml' }))
  })

  hint(
    _([
      'Drag a piece; press R to turn it 45°, F to flip the parallelogram. A piece near its place clicks into it.',
      'ピースをドラッグします。R キーで 45° 回転、F キーで平行四辺形を反転。正しい位置の近くで放すと吸い付きます。',
    ]),
  )

  let wasSolved = false
  const stop = editor.subscribe(() => {
    const seated = pieces.filter((id) => slotOf(id) >= 0).length
    const solved = seated === SOLUTION.length
    if (solved && !wasSolved) {
      say(_(['Solved. All seven, exactly.', '完成です。7つぴったり。']))
    } else if (!solved && wasSolved) {
      say('')
    }
    wasSolved = solved

    setStatus(
      _([
        `${seated} of ${SOLUTION.length} pieces placed`,
        `${SOLUTION.length} ピース中 ${seated} ピース`,
      ]),
    )
  })

  editor.viewport.zoomToFit(undefined, 24)

  return {
    dispose() {
      stop()
      controls.dispose()
      editor.dispose()
    },
  }
}
