# CSS 契約

このページに記載したクラス名・`data-hc-*` 属性・CSS 変数は**公開 API** です。これらの変更は、メソッド名の変更とまったく同じく semver 上の破壊的変更です。

ここに記載のないものは、スタイルシート上でどう見えていても内部実装です。

```ts
import '@headless-canvas/ui/styles.css'
```

スタイルシートは実行時注入ではなく独立したファイルです。注入方式は SSR のハイドレーション中にスタイルの当たっていないコントロールを一瞬見せ、厳格な CSP の下で動かず、既定 UI を完全に置き換えた利用者のバンドルにも不要な CSS を残します。

## 利用者が設定する変数

| 変数 | 既定値 | 適用先 |
|---|---|---|
| `--hc-accent` | `#3b82f6` | 選択枠、ハンドルの枠線、フォーカスリング |
| `--hc-handle-size` | `10px` | ハンドルの画面上の一辺 |
| `--hc-handle-border-width` | `1.5px` | ハンドルの枠線 |
| `--hc-selection-border-width` | `1.5px` | 選択枠の枠線 |
| `--hc-rotate-distance` | `26px` | 回転ハンドルの枠からの距離 |
| `--hc-guide-color` | `#f43f5e` | 整列ガイド |

宣言箇所は `.hc-container` なので、そこへ継承される場所ならどこに書いても効きます。

## ライブラリが書き込む変数

| 変数 | 値 |
|---|---|
| `--hc-zoom` | 現在のズーム倍率 |

**読み取り専用。** カメラが変化したフレームごとに `.hc-overlay` へ書き込まれるため、オーバーレイとその中のすべてから参照できます。必要とするスコープと一致しています。中の長さはこれで割ってください。[逆補正](/ja/guide/styling#逆補正)を参照。

## クラス

| クラス | 要素 |
|---|---|
| `.hc-container` | `container` として渡した要素。`role="application"`、フォーカス可能 |
| `.hc-canvas` | Canvas。`aria-hidden="true"` |
| `.hc-overlay` | ビューポート変換を担う唯一の要素。`pointer-events: none` |
| `.hc-selection` | 選択枠 |
| `.hc-handle` | リサイズ／回転ハンドル。`role="button"` を持つ `<button>` |
| `.hc-brush` | 範囲選択の矩形 |
| `.hc-guide` | スナップ中の整列ガイド |
| `.hc-a11y-list` | 視覚的に非表示の図形リスト |
| `.hc-a11y-live` | `aria-live` リージョン |
| `.hc-text-dialog` | テキスト編集の `<dialog>`。`::backdrop` もここ |
| `.hc-text-form` | 中のフォーム |
| `.hc-text-label` | フィールドを包むラベル |
| `.hc-text-input` | `<textarea>` |
| `.hc-text-actions` | ボタンの行 |
| `.hc-text-button` | ダイアログのボタン |

## data 属性

状態はクラス名ではなく data 属性で表現されます。クラスを同期させる JavaScript なしに条件付きスタイルが書けるためです。常に存在することになる属性は意図的に設けていません。冗長な属性は、それを読み飛ばすすべてのセレクタにとってノイズだからです。

| 属性 | 付与先 | 値 |
|---|---|---|
| `data-hc-tool` | `.hc-container` | 現在のツール ID: `select` / `hand` / `draw` / 自作 |
| `data-hc-state` | `.hc-container` | `idle` `pointing` `dragging` `brushing` `resizing` `rotating` `panning` `editing` |
| `data-hc-selection` | `.hc-selection` | `single` `multiple` |
| `data-hc-locked` | `.hc-selection` | ロックされた図形を含むとき付く |
| `data-hc-handle` | `.hc-handle` | `nw` `n` `ne` `e` `se` `s` `sw` `w` `rotate` |
| `data-hc-guide` | `.hc-guide` | `x` `y` |
| `data-hc-text-action` | `.hc-text-button` | `save` `cancel` |

## レシピ

```css
/* 丸いハンドル。回転だけ塗りつぶす */
.hc-handle { border-radius: 50%; }
.hc-handle[data-hc-handle='rotate'] {
  background: var(--hc-accent);
  border-color: #fff;
}

/* カーソルをツールの状態だけで決める */
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }

/* ドラッグ中はコントロールを薄くして図形を隠さない */
.hc-container[data-hc-state='dragging'] .hc-selection { opacity: 0.5; }

/* ロックされた選択は別の見え方に */
.hc-selection[data-hc-locked] {
  border-style: dotted;
  border-color: #9ca3af;
}

/* 見た目を変えずに当たり判定だけ広げる */
.hc-handle::before {
  content: '';
  position: absolute;
  inset: calc(-6px / var(--hc-zoom));
}

/* 編集ダイアログ。オーバーレイの外なので逆補正は不要 */
.hc-text-dialog::backdrop { background: rgb(0 0 0 / 60%); }
.hc-text-button[data-hc-text-action='save'] { background: rebeccapurple; }
.hc-container[data-hc-state='editing'] .hc-selection { opacity: 0.4; }

/* ダークテーマ */
@media (prefers-color-scheme: dark) {
  .hc-container { --hc-accent: #60a5fa; }
  .hc-handle { background: #1f2937; }
}
```

## スタイルシートがすでに面倒を見ていること

- **逆補正。** 内部のすべての長さが `--hc-zoom` で割られています
- **フォーカスリング。** コンテナと各ハンドルの `:focus-visible`
- **モーションの抑制。** `prefers-reduced-motion: reduce` の下で選択枠とハンドルのトランジションを無効化
- **スクリーンリーダー用要素の可視化。** 非表示リストのボタンはフォーカス時に可視になる。フォーカスされているのに見えないコントロールはそれ自体が失敗だから

スタイルシートを丸ごと置き換える場合、この4つはあなたの担当になります。
