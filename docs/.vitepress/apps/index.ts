import type { Demo } from '../demos/types'

/**
 * The sample applications.
 *
 * Kept apart from `demos/` because they answer a different question. A demo
 * isolates one feature; these are whole small applications, and what they show
 * is what the parts look like once they have to work together.
 *
 * Loaded on demand, like the demos: a page showing one application should not
 * pay for the code of the others.
 */
export const apps: Record<string, () => Promise<Demo>> = {
  // Not a sample application: the live editor in the home page's hero. It is
  // registered here so it mounts through the same component and is covered by
  // the same smoke test as everything else.
  hero: () => import('./hero').then((m) => m.hero),
  sketchpad: () => import('./sketchpad').then((m) => m.sketchpad),
  'graph-paper': () => import('./graph-paper').then((m) => m.graphPaper),
  'pixel-art': () => import('./pixel-art').then((m) => m.pixelArt),
  tangram: () => import('./tangram').then((m) => m.tangram),
  amidakuji: () => import('./amidakuji').then((m) => m.amidakuji),
  polaroid: () => import('./polaroid').then((m) => m.polaroid),
  // Held back: `seating.md` is in the config's srcExclude, so no page mounts
  // this today. It stays registered deliberately — that is what keeps it
  // typechecked and in the smoke test while it waits, so it will still work
  // when its page comes back.
  seating: () => import('./seating').then((m) => m.seating),
}

export type AppId = keyof typeof apps
