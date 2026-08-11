# アクセシビリティ

Canvas はアクセシビリティツリー上では不透明な1個のノードです。その中に描かれたものはフォーカスも読み上げも実行もできません。選択ハンドルを Canvas に描くライブラリは、アプリケーション側のコードでアクセシブルにすることが**できません**。努力の問題ではなく、原理的に不可能です。

コントロールを DOM に置いたことが、このページの内容を可能にしています。

<Demo id="accessibility" title="見えない層を画面に映したもの" />

## 同梱されているもの

### ハンドルはボタン

各ハンドルは実在の `<button>` で、`role="button"`、メッセージ表からの `aria-label`、`tabindex="0"` を持ちます。Tab で到達でき、矢印キーで操作できます。1回につき1単位、<kbd>⇧</kbd> で10単位。ポインタなしでリサイズと回転が可能です。

この挙動は `controls.bindHandle()` から来るので、既定 UI でも React バインディングでも[自作のマークアップ](/ja/guide/custom-controls)でも同一です。

### 図形リスト

視覚的に非表示の `<ul>` が、現在表示中の図形を列挙します。各項目はボタンで、実行するとその図形が選択され表示範囲に入ります。

```html
<ul class="hc-a11y-list" aria-label="キャンバス上の図形">
  <li><button aria-pressed="false">長方形</button></li>
  <li><button aria-pressed="true">5 芒星, 選択中</button></li>
  <li>表示範囲外にあと 12 個</li>
</ul>
```

ラベルは `ShapeUtil.getAccessibleLabel()` が返します。自作のシェイプ型では実装してください。実装しないと、どのインスタンスも種別名としか読まれません。

**リストは表示範囲に仮想化されています。** 図形1個につきノード1個を出すと5,000ノードが DOM に並び、アーキテクチャ全体が依拠する「有界なノード数」を放棄することになります。表示範囲外の件数は要約項目として提示されるので、総数が隠れることはありません。

ボタンはフォーカスされるまで非表示で、フォーカスされた時点で可視になります。フォーカスされているのに誰にも見えないコントロールは、それ自体がアクセシビリティの失敗だからです。

### 読み上げの通知

`aria-live="polite"` のリージョンが選択の変化を通知します。選択枠は純粋に視覚的な手がかりであり、これがないとスクリーンリーダー利用者は何かが起きたことすら確認できません。

```html
<div class="hc-a11y-live" aria-live="polite" aria-atomic="true">3 個の図形を選択中</div>
```

### コンテナ

`role="application"` と `aria-label` を持ち、フォーカス可能で、フォーカスリングが見えます。中の Canvas は `aria-hidden` です。意味のあるものはすべてオーバーレイ側から公開されています。

## 文言の翻訳

**ライブラリ自身が出す文字列**（ハンドルのラベル、選択のアナウンス、編集ダイアログ）はすべて差し替えられます。英語の `aria-label` をハードコードするライブラリは英語圏以外の製品では使えず、そもそもコントロールを DOM に置いた理由を台無しにします。シェイプのラベルは別の場所から来ます（[後述](#この表に含まれないもの)）。

```ts
const editor = new Editor({
  container,
  messages: {
    'handle.nw': '左上からリサイズ',
    'handle.rotate': '回転',
    'selection.multiple': '{count} 個の図形を選択中',
    'canvas.label': 'キャンバス',
    'shapeList.label': 'キャンバス上の図形',
    'shapeList.more': '表示範囲外にあと {count} 個',
  },
})
```

必要な分だけ渡せば、残りは英語のまま使われます。`{count}` は置換されます。

| キー | 既定値 |
|---|---|
| `handle.nw` 〜 `handle.w` | `Resize from top left` 〜 `Resize from left` |
| `handle.rotate` | `Rotate` |
| `selection.none` | `Nothing selected` |
| `selection.single` | `Selected shape` |
| `selection.multiple` | `{count} shapes selected` |
| `canvas.label` | `Canvas` |
| `shapeList.label` | `Shapes on canvas` |
| `shapeList.more` | `{count} more outside the view` |
| `shapeList.selected` | `selected` |
| `state.locked` | `locked` |
| `edit.label` | `Edit text` |
| `edit.save` / `edit.cancel` | `Save` / `Cancel` |

キーの追加は破壊的変更ではありません。削除と改名は破壊的変更です。

### この表に含まれないもの

**シェイプのラベルは含まれません。** リストの各項目としてスクリーンリーダーが読む文字列は `ShapeUtil.getAccessibleLabel(shape)` が返すもので、組み込みシェイプは英語を返します（`Rectangle 160×110`、`Line`、`3-pointed star`）。メッセージ表を経由していないのは、**ラベルがシェイプの中身に依存する**ためです。固定のキー集合では、ライブラリが知らないシェイプ型まで面倒を見られません。

翻訳するには、組み込みの util を差し替えて登録します。

```ts
import { defaultShapeUtils, Editor, rectShapeUtil } from '@headless-canvas/core'

const utils = defaultShapeUtils.map((util) =>
  util === rectShapeUtil
    ? { ...util, getAccessibleLabel: (s) => `長方形 ${Math.round(s.width)}×${Math.round(s.height)}` }
    : util,
)

new Editor({ container, shapeUtils: utils })
```

書き直すのではなくスプレッドするので、**描画・ヒットテスト・書き出しはそのまま**残ります。

## 無効化する

```ts
createDefaultControls(editor, { accessibleList: false })
```

同等のものを自分で提供する場合にだけ使ってください。たとえば、すでにキーボードで操作できるレイヤーパネルがある場合など。そうでなければ、文書への非視覚的な唯一の経路を取り除くことになります。

## 自作する

同じデータを直接取得できます。

```ts
editor.controls.getA11yShapeDescriptors()
// [{ id, label, selected, locked }, ...] — 表示範囲のみ

editor.controls.getA11ySummary()
// { total: 5000, visible: 37 }
```

両方の数値を提示してください。文書に 5,000 個ある状況で「37 個」とだけ伝えるのは、そう言わないより悪い答えです。

## キーボード操作一覧

| キー | 動作 |
|---|---|
| <kbd>Tab</kbd> | 図形リスト、続いてハンドルへ |
| リスト項目上の <kbd>Space</kbd> / <kbd>Enter</kbd> | その図形を選択し表示範囲へ |
| ハンドル上の矢印キー | リサイズ・回転。<kbd>⇧</kbd> で10単位 |
| 選択がある状態の矢印キー | 移動。<kbd>⇧</kbd> で10単位 |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | 選択を削除 |
| <kbd>⌘A</kbd> / <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> | 全選択、グループ化、解除 |
| 図形を1つ選択中の <kbd>Enter</kbd> / <kbd>F2</kbd> | テキストがあれば編集 |
| <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> | Undo、Redo |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> | 選択ツール、ハンドツール、描画ツール |
| <kbd>Escape</kbd> | 進行中の操作を中断 |

## 現状

::: warning 実機の支援技術では未検証です
実装と自動テストは完了していますが、jsdom ではスクリーンリーダーが実際に何をどの順で読み上げるかを確かめられません。NVDA と VoiceOver での検証は v1.0 前の残作業であり、それが済むまで、このページは「DOM に何が含まれているか」を説明したものであって、検証済みの体験を説明したものではありません。実際の利用からの報告を歓迎します。
:::
