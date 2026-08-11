import type { Bounds, Editor, HcPointerEvent, ShapeId, Tool, Vec } from '@headless-canvas/core'
import { Editor as EditorClass } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'
import type { Demo } from './types'
import { t } from './types'
import { pickColor, scaffold, toggle } from './ui'

/**
 * A tool that draws rectangles.
 *
 * Selecting, moving, resizing, marquee selection and drawing all want the same
 * pointer events; resolving that with conditionals produces code nobody can
 * safely change. Each mode is a tool instead, and application tools register
 * through the same call the built-in ones use (spec §5.8.2).
 */
class DrawRectTool implements Tool {
  readonly id = 'draw-rect'

  private origin: Vec | null = null
  private id_: ShapeId | null = null

  constructor(private readonly editor: Editor) {}

  onPointerDown(event: HcPointerEvent): void {
    this.origin = event.world
    this.editor.tools.setState('dragging')
    this.id_ = this.editor.createShape({
      type: 'rect',
      x: event.world.x,
      y: event.world.y,
      width: 1,
      height: 1,
      props: { fill: { type: 'solid', color: pickColor() }, cornerRadius: 6 },
    })
  }

  onPointerMove(event: HcPointerEvent): void {
    if (!this.origin || !this.id_) return
    // Written as ephemeral state, so dragging does not put a hundred entries in
    // the history or rebuild the committed tree on every frame (spec §5.2.4).
    this.editor.setEphemeral(
      new Map([
        [
          this.id_,
          {
            x: Math.min(this.origin.x, event.world.x),
            y: Math.min(this.origin.y, event.world.y),
            width: Math.max(1, Math.abs(event.world.x - this.origin.x)),
            height: Math.max(1, Math.abs(event.world.y - this.origin.y)),
          },
        ],
      ]),
    )
  }

  onPointerUp(): void {
    if (!this.id_) return
    this.editor.commitEphemeral()
    this.editor.selection.set([this.id_])
    this.origin = null
    this.id_ = null
    this.editor.tools.setState('idle')
  }

  onCancel(): void {
    this.editor.clearEphemeral()
    if (this.id_) this.editor.deleteShapes([this.id_])
    this.origin = null
    this.id_ = null
    this.editor.tools.setState('idle')
  }

  getBrush(): Bounds | null {
    return null
  }
}

export const customTool: Demo = ({ root, lang }) => {
  const _ = t(lang)
  const { bar, stage, setStatus } = scaffold(root)

  const editor = new EditorClass({ container: stage })
  const controls = createDefaultControls(editor)

  editor.tools.register('draw-rect', (instance) => new DrawRectTool(instance))

  toggle(
    bar,
    (on) => (on ? _(['Tool: draw', 'ツール: 描画']) : _(['Tool: select', 'ツール: 選択'])),
    false,
    (on) => editor.tools.setCurrent(on ? 'draw-rect' : 'select'),
  )

  setStatus(
    _([
      'Switch to the draw tool and drag on the canvas. Escape cancels mid-drag, leaving nothing behind.',
      '描画ツールに切り替えてキャンバス上をドラッグしてください。ドラッグ中に Escape を押すと、途中の状態を残さず取り消されます。',
    ]),
  )

  return {
    dispose() {
      controls.dispose()
      editor.dispose()
    },
  }
}
