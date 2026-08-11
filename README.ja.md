# HeadlessCanvas

**デザインツール・ホワイトボード・作図エディタ・フロアプラン・画像アノテーション UI を作るための Canvas エディタエンジン。操作ハンドルは実際の DOM 要素なので、CSS でそのままスタイリングできます。**

[ドキュメントとデモ](https://elephancube.github.io/headlesscanvas-js/ja/) · [English README](./README.md)

> **状態: pre-alpha。** v1.0 に向けて開発中です（[ロードマップ](#ロードマップ)）。API は固まっていますが、npm へは未公開です。

図形は速度のために `<canvas>` に描画します。選択枠・リサイズハンドル・回転 UI は**その上に重ねた DOM 要素**として描画するため、素の CSS で外観を変更でき、独自のマークアップに丸ごと差し替えることもできます。

```
┌─────────────────────────────────────┐
│  DOM オーバーレイ — 選択枠・ハンドル  │  ← 自分の CSS・マークアップ、キーボード操作可能
├─────────────────────────────────────┤
│  Canvas          — 図形・画像        │  ← 高速描画。UI はここに描かない
└─────────────────────────────────────┘
```

## なぜ新しい Canvas ライブラリなのか

| | 描画 | 操作 UI | CSS でスタイル可能 | スクリーンリーダー対応 | ライセンス |
|---|---|---|---|---|---|
| **HeadlessCanvas** | Canvas | **DOM** | **可能** | **可能** | **MIT** |
| Konva.js | Canvas | Canvas | 不可 | 不可 | MIT |
| Fabric.js | Canvas | Canvas | 不可 | 不可 | MIT |
| tldraw | DOM/SVG | DOM | 可能 | 一部 | 非オープンソース。ウォーターマーク必須・商用は有償ライセンス |
| Excalidraw | Canvas | DOM | アプリであり再利用可能なライブラリではない | — | MIT |

Konva や Fabric のように操作 UI を Canvas の**中に**描画すると、回避しようのない結果が2つ生じます。CSS で外観を変更できないこと、そして支援技術から一切見えないことです。操作 UI を DOM に置けば、この両方が同時に解決します。

tldraw は同じアーキテクチャを採りますが、オープンソースではありません。本番利用にはライセンスキーが必要で、商用ライセンスを購入しない限り「Made with tldraw」ウォーターマークの保持が必須、さらにあなたのプロジェクトの利用者全員が各自ライセンスを取得する必要があります。HeadlessCanvas は MIT であり、ウォーターマークもライセンスキーも費用もありません。

## 設計原則

1. **Canvas には UI を描かない。** 選択枠とハンドルは DOM である。これがこのライブラリの存在理由そのものです。
2. **DOM ノード数を有界に保つ。** 操作 UI を持つのは選択中のオブジェクトだけ。10,000 個の図形があっても DOM ノードは数個です。
3. **1フレームあたりの transform 書き込みは1回。** ビューポート変換はオーバーレイのコンテナに適用し、子はワールド座標で配置します。パンとズームのコストは図形が10個でも10,000個でも変わりません。
4. **フレームワーク非依存。** コアも既定 UI も素の TypeScript です。React はアダプタであって必須ではありません。

## パッケージ

| パッケージ | 内容 |
|---|---|
| `@headless-canvas/core` | シーングラフ、レンダラ、状態管理、座標変換、ツール、シェイプ登録、ヘッドレス操作プリミティブ。実行時依存ゼロ。 |
| `@headless-canvas/ui` | 既定の操作 UI とスタイルシート。命令的な DOM 実装なので、任意のフレームワークからも、フレームワークなしでも使えます。 |
| `@headless-canvas/react` | `core` と `ui` の React バインディング。 |

## カスタマイズの3段階

**Level 1 — 既定のまま使う。**

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
createDefaultControls(editor)
```

**Level 2 — CSS で外観を変える。** 状態は data 属性に載るので、直接指定できます。

```css
.hc-handle { border-radius: 50%; }
.hc-handle[data-hc-handle='rotate'] { background: tomato; }
.hc-container[data-hc-tool='hand'] { cursor: grab; }
:root { --hc-accent: rebeccapurple; --hc-handle-size: 12px; }
```

**Level 3 — 自前のマークアップで作る。** 既定 UI を使わず、自分の要素を束ねます。

```ts
const box = editor.controls.getSelectionBox()
for (const handle of box.handles) {
  const el = myOwnHandleElement(handle)
  editor.controls.bindHandle(el, handle.id) // ポインタ捕捉・キーボード・ARIA 込み
}
```

React バインディングも同じプリミティブの上に載っているため、Level 3 はどちらでも同一に機能します。

## カスタムシェイプ

シェイプ種別は登録制であり、ハードコードされていません。組み込み図形もまったく同じ仕組みで実装されています。

```ts
const wallUtil: ShapeUtil<WallShape> = {
  type: 'wall',
  getDefaultProps: () => ({ thickness: 8 }),
  render(shape, ctx) { /* 2D コンテキストで描画 */ },
  hitTest(shape, point, tolerance) { /* ... */ },
}
```

型を一度宣言すれば、`createShape` / `getShape` が props を推論します。

```ts
declare module '@headless-canvas/core' {
  interface ShapeRegistry { wall: WallShape }
}
```

## ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | コアの数学・状態管理・シェイプ登録・レンダラ・操作プリミティブ | 完了 |
| 2 | 基本図形一式、ビューポート、ヒットテスト、シリアライズ、PNG 書き出し | 完了 |
| 3 | 既定 UI、React アダプタ、ツール登録制、アクセシビリティ、i18n | 完了 |
| 4 | Undo/Redo、スナップ、クリップボード、テキスト編集、フリーハンド描画、SVG 書き出し、ドキュメントサイト → v1.0 | 進行中 |

**意図的に対象外**としているもの: Fabric.js との機能パリティ、リッチテキスト編集エンジン、画像フィルタ、ツールバーやカラーピッカーなどのアプリケーション UI。HeadlessCanvas はエンジンであってアプリではありません。

## ライセンス

MIT © elephancube
