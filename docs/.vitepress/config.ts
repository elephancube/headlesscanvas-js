import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'

const REPO = 'https://github.com/elephancube/headlesscanvas-js'

/**
 * Deployed to GitHub Pages at /headlesscanvas-js/ by default. A custom domain
 * serves from the root instead, so the prefix is overridable rather than
 * baked in.
 */
const base = process.env.DOCS_BASE ?? '/headlesscanvas-js/'

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
  title: 'HeadlessCanvas',
  description:
    'A canvas editor engine whose selection handles are DOM elements — styleable with CSS, reachable by assistive technology, MIT licensed.',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'HeadlessCanvas' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'A canvas editor engine whose selection handles are DOM elements.',
      },
    ],
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
        ],
        sidebar: {
          '/guide/': [{ text: 'Guide', items: guide('') }],
          '/api/': [{ text: 'API reference', items: api('') }],
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
        ],
        sidebar: {
          '/ja/guide/': [{ text: 'ガイド', items: guide('/ja') }],
          '/ja/api/': [{ text: 'API リファレンス', items: api('/ja') }],
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
    logo: undefined,
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
