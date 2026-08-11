export type Lang = 'en' | 'ja'

export interface DemoContext {
  /** The element the demo owns. It is empty on entry and cleared on dispose. */
  root: HTMLElement
  lang: Lang
}

export interface DemoInstance {
  dispose(): void
}

export type Demo = (context: DemoContext) => DemoInstance

/**
 * A pair of strings, picked by locale.
 *
 * The demos are shared between the English and Japanese sites, so their own
 * labels have to follow the page rather than being fixed in one language.
 */
export type Text = readonly [en: string, ja: string]

export const t =
  (lang: Lang) =>
  (text: Text): string =>
    lang === 'ja' ? text[1] : text[0]
