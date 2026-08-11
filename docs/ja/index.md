---
layout: home

hero:
  name: HeadlessCanvas
  text: ハンドルは DOM 要素です
  tagline: デザインツール・ホワイトボード・図表エディタ・注釈 UI のための Canvas エディタエンジン。図形は Canvas に描画し、選択 UI は CSS で装飾できる DOM です。MIT ライセンス、ウォーターマークなし、フレームワーク不要。
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: デモを触る
      link: /ja/demos
    - theme: alt
      text: GitHub
      link: https://github.com/elephancube/headlesscanvas-js

features:
  - title: コントロールを CSS で装飾できる
    details: 選択枠もハンドルも、文書化されたクラス名と data 属性を持つ実在の要素です。フォークせずに見た目を変えられます。
    link: /ja/guide/styling
    linkText: 装飾ガイド
  - title: 支援技術から到達できる
    details: ハンドルはボタンです。表示中の図形はキーボードで辿れる仮想化リストとして公開されます。Canvas に描かれたコントロールにはどちらもできません。
    link: /ja/guide/accessibility
    linkText: アクセシビリティガイド
  - title: フレームワーク不要
    details: コアも既定 UI も実行時依存ゼロの素の TypeScript です。React は薄いアダプタで、使わなくても構いません。
    link: /ja/guide/react
    linkText: React バインディング
  - title: 完全な MIT
    details: ライセンスキーもウォーターマークも商用プランもありません。製品に組み込んでも、その利用者が別途何かを取得する必要はありません。
---

<Demo id="basics" title="Level 1 — 既定のコントロールをそのまま" />

## なぜコントロールを Canvas に描かないのか

Konva や Fabric は選択ハンドルを図版と同じ Canvas に描画します。そこから2つの帰結が生まれ、どちらもアプリケーション側のコードでは回避できません。ハンドルを CSS で装飾できないこと、そして支援技術からまったく見えないことです。

HeadlessCanvas はこの2つを分離します。

```
┌─────────────────────────────────────┐
│  DOM オーバーレイ — 選択枠・ハンドル  │  ← あなたの CSS・マークアップ、キーボード操作可能
├─────────────────────────────────────┤
│  Canvas        — 図形・画像          │  ← 高速な描画。UI は一切描かない
└─────────────────────────────────────┘
```

tldraw は同じ構成を採りますが、オープンソースではありません。本番利用にはライセンスキーが必要で、商用ライセンスを購入しない限りウォーターマークを外せず、あなたのプロジェクトを使う人もそれぞれライセンスを必要とします。HeadlessCanvas は MIT です。

| | 描画 | コントロール UI | CSS で装飾 | スクリーンリーダー対応 | ライセンス |
|---|---|---|---|---|---|
| **HeadlessCanvas** | Canvas | **DOM** | **可** | **可** | **MIT** |
| Konva.js | Canvas | Canvas | 不可 | 不可 | MIT |
| Fabric.js | Canvas | Canvas | 不可 | 不可 | MIT |
| tldraw | DOM/SVG | DOM | 可 | 一部 | 非オープンソース |
| Excalidraw | Canvas | DOM | 再利用可能なライブラリではなくアプリ | — | MIT |

## インストール

```sh
npm install @headless-canvas/core @headless-canvas/ui
```

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
createDefaultControls(editor)

editor.createShape({ type: 'rect', x: 40, y: 40, width: 160, height: 110 })
```

準備はこれだけです。続きは[はじめる](/ja/guide/getting-started)を参照してください。
