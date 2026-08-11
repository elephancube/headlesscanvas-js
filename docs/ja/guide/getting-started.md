# はじめる

## インストール

::: code-group

```sh [npm]
npm install @headless-canvas/core @headless-canvas/ui
```

```sh [pnpm]
pnpm add @headless-canvas/core @headless-canvas/ui
```

```sh [yarn]
yarn add @headless-canvas/core @headless-canvas/ui
```

:::

React で使う場合は `@headless-canvas/react` を追加し、[React ガイド](/ja/guide/react)を参照してください。

## エディタを設置する

エディタは、渡されたコンテナ要素の中に Canvas とオーバーレイを構築します。その要素には大きさが必要です。エディタは要素を監視して Canvas の寸法を合わせますが、寸法そのものを勝手に決めることはしません。

```html
<div id="app" style="width: 100%; height: 480px"></div>
```

```ts
import { Editor } from '@headless-canvas/core'
import { createDefaultControls } from '@headless-canvas/ui'
import '@headless-canvas/ui/styles.css'

const editor = new Editor({ container: document.querySelector('#app')! })
const controls = createDefaultControls(editor)
```

スタイルシートは自分で import する独立したファイルです。実行時に document へ注入することはしません。注入方式では SSR のハイドレーション中にスタイルの当たっていないコントロールが一瞬見え、厳格な Content Security Policy の下で動かず、既定 UI を完全に置き換えた利用者のバンドルにも不要な CSS が残ります。

## 図形を追加する

```ts
editor.createShape({
  type: 'rect',
  x: 40,
  y: 40,
  width: 180,
  height: 120,
  props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 8 },
})

editor.createShape({
  type: 'text',
  x: 40,
  y: 190,
  width: 300,
  height: 60,
  props: { text: 'ドラッグしてみてください', fontSize: 24 },
})
```

指定しなかった項目は種別ごとの既定値で埋まるため、`{ type: 'rect', x, y, width, height }` だけでも有効です。

1回のユーザー操作として複数の図形を作る場合は、まとめてコミットさせてください。購読者への通知も Undo の履歴も、5件ではなく1件になります。

```ts
editor.transact(() => {
  for (const row of data) {
    editor.createShape({ type: 'rect', x: row.x, y: row.y, width: 40, height: 40 })
  }
})
```

## 何もしなくても使えるもの

`createDefaultControls` を設置した時点で以下が有効です。

| 入力 | 動作 |
|---|---|
| クリック | 選択。<kbd>⇧</kbd> + クリックで追加選択 |
| 図形をドラッグ | 移動。グリッドと他図形に吸着。<kbd>Alt</kbd> で吸着を一時無効化 |
| 空白をドラッグ | 範囲選択 |
| ハンドルをドラッグ | リサイズ。枠の上のハンドルで回転。<kbd>⇧</kbd> でリサイズは縦横比維持、回転は 15° 刻み |
| 中ボタン／右ボタンのドラッグ | パン（ツールを問わず） |
| ホイール | パン。<kbd>Ctrl</kbd> または <kbd>⌘</kbd> + ホイールでポインタ位置を中心にズーム |
| ダブルクリック | テキストを編集。選択中なら <kbd>Enter</kbd> / <kbd>F2</kbd> でも同じ |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> | 選択ツール / ハンドツール / 描画ツール |
| 矢印キー | 選択を1単位移動。<kbd>⇧</kbd> で10単位 |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | 選択を削除 |
| <kbd>⌘A</kbd> / <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> | 全選択、グループ化、解除 |
| <kbd>⌘Z</kbd> | Undo。<kbd>⇧⌘Z</kbd> または <kbd>Ctrl+Y</kbd> で Redo |
| <kbd>Escape</kbd> | 進行中の操作を中断（途中状態を残さない） |
| <kbd>Tab</kbd> | 表示中の図形、続いてハンドルをフォーカス可能なボタンとして辿る |
| ハンドルにフォーカス中の矢印キー | キーボードでリサイズ・回転 |

キーボードのハンドラは **`window` ではなくコンテナ要素**に登録されています。フォーカスのないエディタはキーを消費しません。1ページに2つのエディタを置いても破綻しないのはこのためであり、ページ上の別のテキスト入力から <kbd>⌘Z</kbd> を奪わないのもこのためです。

同じ操作はメソッドとしても呼べます。自前のツールバーに使ってください。

```ts
editor.history.undo()
editor.history.redo()
editor.history.getSize() // { undo: 3, redo: 0 } — ボタンの活性判定に
```

コピー・カット・ペーストと画像のドラッグ&ドロップは1行です。クリップボードの読み取りは権限プロンプトを出し得るため、そのタイミングはアプリケーションが決めるべきという理由でコアには入っていません。

```ts
import { createClipboardBinding } from '@headless-canvas/ui'

createClipboardBinding(editor)
```

テキスト編集も1行です。[テキストの編集](/ja/guide/text-editing)を参照してください。

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)
```

## 後始末

```ts
controls.dispose()
editor.dispose()
```

SPA では両方必要です。`editor.dispose()` は描画ループを止め、ResizeObserver を切断し、キャッシュした画像を解放し、生成した要素を除去します。モジュールレベルの状態は持たないため、複数のエディタが1ページに共存できます。

## 回復可能な問題を扱う

画像の読み込み失敗、未登録のシェイプ型を含む文書の読み込み、書き出しの失敗 — いずれもエディタを止めるべきものではないので、throw せず通知として流れます。

```ts
editor.subscribeNotifications((notification) => {
  console.warn(notification.code, notification.message)
})
```

一方、登録していないツール ID の指定や、破棄済みエディタの操作といったプログラミング上の誤りは throw します。この区別は意図的なものです。片方はコードのバグ、もう片方は外界が信頼できないという話だからです。

## サーバーサイドレンダリング

モジュールは import 時にブラウザ API へ触れないため、サーバー側のバンドルに含めても安全です。`Editor` の構築は effect の中かマウント後に行ってください。React の `<HcCanvas>` はすでにそうなっています。

<Demo id="basics" title="動かすとこうなります" />

## 次に読むもの

- [コンセプト](/ja/guide/concepts) — 座標、トランザクション、不変条件
- [シェイプ](/ja/guide/shapes) — 組み込みの種別と操作方法
- [コントロールの装飾](/ja/guide/styling) — CSS 契約
