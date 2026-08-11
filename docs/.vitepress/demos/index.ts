import type { Demo } from './types'

/**
 * Loaded on demand: a page that shows one demo should not pay for the code of
 * the other seven.
 */
export const demos: Record<string, () => Promise<Demo>> = {
  basics: () => import('./basics').then((m) => m.basics),
  styling: () => import('./styling').then((m) => m.styling),
  'custom-controls': () => import('./custom-controls').then((m) => m.customControls),
  'custom-shape': () => import('./custom-shape').then((m) => m.customShape),
  drawing: () => import('./drawing').then((m) => m.drawing),
  'custom-tool': () => import('./custom-tool').then((m) => m.customTool),
  'text-editing': () => import('./text-editing').then((m) => m.textEditing),
  snapping: () => import('./snapping').then((m) => m.snapping),
  documents: () => import('./documents').then((m) => m.documents),
  accessibility: () => import('./accessibility').then((m) => m.accessibility),
  performance: () => import('./performance').then((m) => m.performance_),
}

export type DemoId = keyof typeof demos
