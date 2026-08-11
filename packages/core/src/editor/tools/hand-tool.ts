import type { Vec } from '../../math'
import type { Editor } from '../editor'
import type { Camera } from '../viewport'
import type { HcPointerEvent, Tool } from './types'

/**
 * Pan-only tool.
 *
 * Small enough to double as the worked example for the `Tool` interface: it
 * owns its state, reports it so `data-hc-state` stays accurate, and touches
 * nothing else.
 */
export class HandTool implements Tool {
  readonly id = 'hand'

  private start: { screen: Vec; camera: Camera } | null = null

  constructor(private readonly editor: Editor) {}

  onExit(): void {
    this.start = null
  }

  onPointerDown(event: HcPointerEvent): void {
    if (event.button !== 0) return
    this.start = { screen: event.screen, camera: this.editor.viewport.camera }
    this.editor.tools.setState('panning')
  }

  onPointerMove(event: HcPointerEvent): void {
    if (!this.start) return
    const { screen, camera } = this.start
    this.editor.viewport.setCamera({
      x: camera.x - (event.screen.x - screen.x) / camera.z,
      y: camera.y - (event.screen.y - screen.y) / camera.z,
    })
  }

  onPointerUp(): void {
    if (!this.start) return
    this.start = null
    this.editor.tools.setState('idle')
  }

  onCancel(): void {
    this.start = null
    this.editor.tools.setState('idle')
  }
}
