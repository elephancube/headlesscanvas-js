import { type Editor, strokeFromPoints, type Vec } from '@headless-canvas/core'
import type { Lang } from './types'

/**
 * A stroke as the draw tool would have left it.
 *
 * The points go through the same fitting a real one does, so what the demos
 * show is the tool's own output rather than a path drawn to look like it.
 */
export function addStroke(
  editor: Editor,
  points: readonly Vec[],
  options: { color?: string; width?: number } = {},
): void {
  editor.createShape({ type: 'path', ...strokeFromPoints(points, options) })
}

/** A hand-drawn-looking run of points, sampled the way a pointer would. */
export function wave(
  from: Vec,
  length: number,
  amplitude: number,
  cycles = 2,
  samples = 48,
): Vec[] {
  return Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1)
    return {
      x: from.x + t * length,
      y: from.y + Math.sin(t * Math.PI * cycles) * amplitude,
    }
  })
}

/**
 * A small starting scene, built in one transaction so it lands as a single
 * history entry rather than five separate ones.
 */
export function seedScene(editor: Editor, lang: Lang): void {
  editor.transact(() => {
    editor.createShape({
      type: 'rect',
      x: 60,
      y: 60,
      width: 160,
      height: 110,
      props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 10 },
    })
    editor.createShape({
      type: 'ellipse',
      x: 260,
      y: 70,
      width: 120,
      height: 120,
      props: {
        fill: {
          type: 'radial',
          stops: [
            { offset: 0, color: '#ffffff' },
            { offset: 1, color: '#22c55e' },
          ],
        },
      },
    })
    editor.createShape({
      type: 'path',
      x: 420,
      y: 65,
      width: 130,
      height: 130,
      props: {
        d: 'M 50 5 C 90 5 95 45 50 95 C 5 45 10 5 50 5 Z',
        viewBox: { width: 100, height: 100 },
        fill: {
          type: 'linear',
          angle: Math.PI / 2,
          stops: [
            { offset: 0, color: '#f472b6' },
            { offset: 1, color: '#7c3aed' },
          ],
        },
        stroke: { color: '#4c1d95', width: 2 },
      },
    })
    editor.createShape({
      type: 'text',
      x: 60,
      y: 215,
      width: 330,
      height: 48,
      props: {
        text:
          lang === 'ja'
            ? 'ドラッグ・リサイズ・回転してみてください'
            : 'Drag, resize and rotate — the handles are DOM',
        fontSize: 20,
      },
    })
    // Freehand output is an ordinary path, so it sits in the scene alongside
    // everything else and needs no special handling from the demos.
    addStroke(editor, wave({ x: 62, y: 280 }, 320, 12, 3), { color: '#e11d48', width: 5 })
  })
}
