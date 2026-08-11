# テキストの編集

<Demo id="text-editing" title="同じセッションを、2つの異なる編集 UI で" />

## 有効にする

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)
```

これだけです。テキストシェイプをダブルクリックするとダイアログが開きます。選択した状態で <kbd>Enter</kbd> または <kbd>F2</kbd> でも同じです。

呼ばなくてもセッションは開きます — 開くのはコアだからです — が、入力する先が画面に存在しません。この分離が設計の要点であり、ダイアログを差し替えられる理由でもあります。

## なぜダイアログなのか

一見自然なのは、図形の上に `<textarea>` を重ねて「その場で編集しているように見せる」方式です。これは機能しません。努力不足ではなく、Canvas のテキスト計測とブラウザのテキストレイアウトが**別々の実装**だからです。フィールドの行分割は描画結果からずれ、キャレットは見当違いの位置に来ます。そのずれはテキストが増えるほど大きくなります。

ダイアログは、その分離を下手に隠さず認めた形です。それでもその場編集が欲しい場合、下のセッション API がその土台になります。制約を明示した上で、判断は利用者に委ねます。

## 何が編集できるか

「型が `text` の図形」ではありません。`ShapeUtil` が `getText` と `setText` の**両方**を実装しているとき、その図形は編集可能です。

```ts
const badgeUtil: ShapeUtil<BadgeShape> = {
  type: 'badge',
  // ...
  getText: (shape) => shape.props.caption,
  setText: (_shape, text) => ({ caption: text }),
}
```

この2つを実装したカスタムシェイプは、組み込みのテキストブロックとまったく同じ場所で編集可能になります。ダブルクリック、キーボード、既定のダイアログ、そして自作の編集 UI のすべてで。エディタは種別ごとの知識を一切持ちません。

```ts
editor.editing.canEdit(id)   // 長方形なら false。ロックされていても false
```

## セッション API

```ts
editor.editing.id            // ShapeId | null
editor.editing.initialText   // string | null — セッション開始時のテキスト
editor.editing.canEdit(id)
editor.editing.begin(id)     // テキストを持たない・ロック済みなら false
editor.editing.commit(text)  // 閉じて、履歴1件として書き込む
editor.editing.cancel()      // 閉じて、破棄する
editor.editing.subscribe(fn) // セッションの開閉
```

知っておく価値があるのは3点です。

**セッションを開始すると図形が選択されます。** そうしないと、選択 UI が「編集しているテキスト」以外を指すことになります。

**同じテキストのコミットは何も記録しません。** エディタを開いて閉じただけなら編集ではなく、Undo 1段を消費すべきではありません。

**`subscribe` は独立したチャネルです。** セッションは文書の変更ではないため、store は動かず描画バージョンも進みません。つまり `editor.subscribe` では検知できず、これが唯一の正しい観測方法です。

セッション中はコンテナの `data-hc-state` が `editing` になるので、JavaScript なしにスタイルで反応できます。

```css
.hc-container[data-hc-state='editing'] .hc-selection { opacity: 0.4; }
```

## 自分の編集 UI を作る

文字列を読んで2つのメソッドを呼べるものなら何でも構いません。サイドパネル、インラインのフィールド、アプリケーションの別の場所にあるフォームなど。

```ts
const stop = editor.editing.subscribe(() => {
  const id = editor.editing.id
  if (id === null) {
    panel.hidden = true
    return
  }
  panel.hidden = false
  input.value = editor.editing.initialText ?? ''
  input.focus()
})

saveButton.addEventListener('click', () => editor.editing.commit(input.value))
cancelButton.addEventListener('click', () => editor.editing.cancel())
```

このページ冒頭のデモは、既定のダイアログとまさにこれを実行時に切り替えています。互いの存在は知りません。

::: warning キーボードの所有権
編集 UI を `editor.container` の中に置くと、そのキーイベントはエディタまでバブルします。エディタはセッション中のキー入力を無視し、さらに `<input>` / `<textarea>` / `<select>` / `contenteditable` 由来のキーも無視します。そうしないと、フィールドに「v」と打つとツールが切り替わり、<kbd>⌘Z</kbd> が入力ではなく文書を Undo してしまいます。コンテナの**外**に置く場合はどちらも関係ありません。
:::

## 「図形に入る」操作一般

ダブルクリックは `onDoubleClick` として現在のツールへ渡され、選択ツールの反応がたまたま「編集セッションを開く」というだけです。自作のツールではまったく別のことに使えます。

```ts
onDoubleClick(event: HcPointerEvent): void {
  if (event.target) this.enterSubEditor(event.target)
}
```

[ツール](/ja/guide/tools)を参照してください。

## オプション

```ts
createTextEditor(editor, { submitOnEnter: true })
```

既定では <kbd>Enter</kbd> が改行、<kbd>⌘Enter</kbd> が保存です。テキストブロックは複数行だからです。`submitOnEnter` を有効にすると入れ替わり、<kbd>Enter</kbd> が保存、<kbd>⇧Enter</kbd> が改行になります。1行のラベルにはこちらが適しています。

## 装飾

ダイアログも他と同じ CSS 契約に従います。オーバーレイの**外**にあるため逆補正は不要です。画面スケールの chrome であり、どのズームでも読める大きさのままです。

| クラス | 要素 |
|---|---|
| `.hc-text-dialog` | `<dialog>` 本体。`::backdrop` もここで指定 |
| `.hc-text-form` | 中のフォーム |
| `.hc-text-label` | フィールドを包むラベル |
| `.hc-text-input` | `<textarea>` |
| `.hc-text-actions` | ボタンの行 |
| `.hc-text-button` | ボタン。`[data-hc-text-action]` が `save` / `cancel` |

```css
.hc-text-dialog { border-radius: 2px; }
.hc-text-dialog::backdrop { background: rgb(0 0 0 / 60%); }
.hc-text-button[data-hc-text-action='save'] { background: rebeccapurple; }
```

ボタンの文言は[メッセージ表](/ja/guide/accessibility#文言の翻訳)から来ます（`edit.label` / `edit.save` / `edit.cancel`）。

## React では

```tsx
import { HcTextEditor, useEditingSession } from '@headless-canvas/react'

<HcCanvas>
  <HcDefaultControls />
  <HcTextEditor />
</HcCanvas>
```

自作する場合は `useEditingSession()` が `{ id, initialText }` を返します。購読先は同じチャネルです。

## これは何ではないか

これは単一スタイルのブロックに対する**プレーンテキスト**エディタです。リッチテキスト — 1ブロック内での混在スタイル、インライン書式、本格的な編集エンジン — は v1.0 の対象外であり、ライブラリの機能としては[ロードマップにもありません](/ja/guide/#含まれないもの)。
