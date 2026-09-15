import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'

const REPO = 'https://github.com/elephancube/headlesscanvas-js'

/** Absolute, because a link preview is fetched by someone else's server. */
const SITE = 'https://headlesscanvas.com'

/**
 * Deployed to GitHub Pages at /headlesscanvas-js/ by default. A custom domain
 * serves from the root instead, so the prefix is overridable rather than
 * baked in.
 *
 * Normalised rather than used as given: the workflow passes
 * `configure-pages`'s `base_path`, which is empty for a custom domain, and
 * `${empty}/` would produce `//assets/…` on every page.
 */
const configured = (process.env.DOCS_BASE ?? '/headlesscanvas-js/').replace(/^\/+|\/+$/g, '')
const base = configured === '' ? '/' : `/${configured}/`

const guide = (prefix: string) => [
  { text: 'Introduction', link: `${prefix}/guide/` },
  { text: 'Getting started', link: `${prefix}/guide/getting-started` },
  { text: 'Concepts', link: `${prefix}/guide/concepts` },
  { text: 'Shapes', link: `${prefix}/guide/shapes` },
  { text: 'Styling the controls', link: `${prefix}/guide/styling` },
  { text: 'Building your own controls', link: `${prefix}/guide/custom-controls` },
  { text: 'Custom shapes', link: `${prefix}/guide/custom-shapes` },
  { text: 'Editing text', link: `${prefix}/guide/text-editing` },
  { text: 'Tools', link: `${prefix}/guide/tools` },
  { text: 'History and snapping', link: `${prefix}/guide/editing` },
  { text: 'Documents and export', link: `${prefix}/guide/documents` },
  { text: 'Accessibility', link: `${prefix}/guide/accessibility` },
  { text: 'React', link: `${prefix}/guide/react` },
  { text: 'Performance', link: `${prefix}/guide/performance` },
]

const examples = (
  prefix: string,
  labels: readonly [string, string, string, string, string, string, string],
) => [
  { text: labels[0], link: `${prefix}/examples/` },
  { text: labels[1], link: `${prefix}/examples/sketchpad` },
  { text: labels[2], link: `${prefix}/examples/graph-paper` },
  { text: labels[3], link: `${prefix}/examples/pixel-art` },
  { text: labels[4], link: `${prefix}/examples/tangram` },
  { text: labels[5], link: `${prefix}/examples/amidakuji` },
  { text: labels[6], link: `${prefix}/examples/polaroid` },
]

const api = (prefix: string) => [
  { text: 'Overview', link: `${prefix}/api/` },
  { text: 'Editor', link: `${prefix}/api/editor` },
  { text: 'Controls', link: `${prefix}/api/controls` },
  { text: 'ShapeUtil', link: `${prefix}/api/shape-util` },
  { text: 'CSS contract', link: `${prefix}/api/css` },
  { text: 'React bindings', link: `${prefix}/api/react` },
]

export default defineConfig({
  base,
  /*
   * The seating chart is held back rather than deleted.
   *
   * Its source stays in `.vitepress/apps/`, stays typechecked, and stays in the
   * smoke test, so it cannot rot while it waits — but excluding the pages keeps
   * it out of the navigation *and* out of the search index, which an unlinked
   * page would not be.
   */
  srcExclude: ['examples/seating.md', 'ja/examples/seating.md'],
  title: 'HeadlessCanvas',
  description:
    'A canvas editor engine whose selection handles are DOM elements — styleable with CSS, reachable by assistive technology, MIT licensed.',
  lastUpdated: true,
  cleanUrls: true,
  /*
   * `base` has to be written in by hand here: VitePress resolves it for links
   * in the theme, but not for raw tags in `head`.
   */
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    // For the browsers that still want a bitmap. 16/32/48 in one file.
    ['link', { rel: 'alternate icon', type: 'image/x-icon', href: `${base}favicon.ico` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
    ['meta', { name: 'theme-color', content: '#144ffe' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'HeadlessCanvas' }],
    ['meta', { property: 'og:title', content: 'HeadlessCanvas' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'A canvas editor engine whose selection handles are DOM elements.',
      },
    ],
    ['meta', { property: 'og:url', content: `${SITE}/` }],
    ['meta', { property: 'og:image', content: `${SITE}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    [
      'meta',
      { property: 'og:image:alt', content: 'HeadlessCanvas — the handles are DOM elements.' },
    ],
    // Without this the card is a small square thumbnail rather than the banner.
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'HeadlessCanvas' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: 'A canvas editor engine whose selection handles are DOM elements.',
      },
    ],
    ['meta', { name: 'twitter:image', content: `${SITE}/og-image.png` }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
          { text: 'API', link: '/api/', activeMatch: '^/api/' },
          { text: 'Demos', link: '/demos' },
          { text: 'Examples', link: '/examples/', activeMatch: '^/examples/' },
        ],
        sidebar: {
          '/guide/': [{ text: 'Guide', items: guide('') }],
          '/api/': [{ text: 'API reference', items: api('') }],
          '/examples/': [
            {
              text: 'Sample applications',
              items: examples('', [
                'All applications',
                'Sketchpad',
                'Graph paper',
                'Pixel editor',
                'Tangram',
                'Amidakuji',
                'Photo collage',
              ]),
            },
          ],
        },
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © elephancube',
        },
      },
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      link: '/ja/',
      description:
        '選択ハンドルが DOM 要素である Canvas エディタエンジン。CSS で自由に装飾でき、支援技術から到達でき、MIT ライセンスです。',
      themeConfig: {
        nav: [
          { text: 'ガイド', link: '/ja/guide/', activeMatch: '^/ja/guide/' },
          { text: 'API', link: '/ja/api/', activeMatch: '^/ja/api/' },
          { text: 'デモ', link: '/ja/demos' },
          { text: 'サンプルアプリ', link: '/ja/examples/', activeMatch: '^/ja/examples/' },
        ],
        sidebar: {
          '/ja/guide/': [{ text: 'ガイド', items: guide('/ja') }],
          '/ja/api/': [{ text: 'API リファレンス', items: api('/ja') }],
          '/ja/examples/': [
            {
              text: 'サンプルアプリ',
              items: examples('/ja', [
                'アプリ一覧',
                'お絵描き',
                '方眼紙作図',
                'ドット絵',
                'タングラム',
                'あみだくじ',
                '写真コラージュ',
              ]),
            },
          ],
        },
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: 'GitHub でこのページを編集',
        },
        docFooter: { prev: '前のページ', next: '次のページ' },
        outline: { label: '目次' },
        lastUpdatedText: '最終更新',
        returnToTopLabel: '先頭へ戻る',
        darkModeSwitchLabel: '外観',
        sidebarMenuLabel: 'メニュー',
        langMenuLabel: '言語を変更',
        footer: {
          message: 'MIT ライセンスで公開しています。',
          copyright: 'Copyright © elephancube',
        },
      },
    },
  },

  themeConfig: {
    // Two files rather than one: the H is navy, which disappears on a dark
    // header. VitePress swaps them with the theme.
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: 'HeadlessCanvas' },
    socialLinks: [{ icon: 'github', link: REPO }],
    search: {
      provider: 'local',
      options: {
        locales: {
          ja: {
            translations: {
              button: { buttonText: '検索', buttonAriaLabel: '検索' },
              modal: {
                displayDetails: '詳細を表示',
                resetButtonTitle: '検索条件をリセット',
                backButtonTitle: '戻る',
                noResultsText: '該当する結果がありません',
                footer: {
                  selectText: '選択',
                  navigateText: '移動',
                  closeText: '閉じる',
                },
              },
            },
          },
        },
      },
    },
  },

  vite: {
    resolve: {
      // The same aliasing the examples use: the site runs against the sources,
      // so a stale dist can never be what the demos are demonstrating. Exact
      // matches keep the styles.css subpath resolving the way it will once the
      // packages are installed from npm.
      alias: [
        {
          find: '@headless-canvas/ui/styles.css',
          replacement: resolve(__dirname, '../../packages/ui/src/styles.css'),
        },
        {
          find: /^@headless-canvas\/core$/,
          replacement: resolve(__dirname, '../../packages/core/src/index.ts'),
        },
        {
          find: /^@headless-canvas\/ui$/,
          replacement: resolve(__dirname, '../../packages/ui/src/index.ts'),
        },
      ],
    },
  },
})
