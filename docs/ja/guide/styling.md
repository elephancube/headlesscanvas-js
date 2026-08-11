# コントロールの装飾

3段階のうちの Level 2 です。既定のコントロールをそのまま使い、見た目だけを変えます。JavaScript は書きません。

<Demo id="styling" title="下のコントロールはすべて CSS 1行に対応します" />

## 契約

クラス名・`data-hc-*` 属性・文書化された CSS 変数は**公開 API** です。これらの変更は、メソッド名の変更とまったく同じく semver 上の破壊的変更として扱われます。パッチリリースで動かされる心配なく、この上に構築できます。

裏返せば、文書化されていない内部は契約の対象外です。このページか [CSS リファレンス](/ja/api/css)にないセレクタは狙わないでください。

## 変数

コンテナまで継承される場所であればどこに書いても構いません。`:root`、コンテナ自身、テーマ用のクラスなど。

| 変数 | 既定値 | 意味 |
|---|---|---|
| `--hc-accent` | `#3b82f6` | 選択枠とハンドルの枠線色 |
| `--hc-handle-size` | `10px` | ハンドルの**画面上の**一辺（ズームによらず） |
| `--hc-handle-border-width` | `1.5px` | ハンドルの枠線 |
| `--hc-selection-border-width` | `1.5px` | 選択枠の枠線 |
| `--hc-rotate-distance` | `26px` | 枠と回転ハンドルの距離 |
| `--hc-guide-color` | `#f43f5e` | スナップ時のガイド線 |

```css
.hc-container {
  --hc-accent: rebeccapurple;
  --hc-handle-size: 12px;
}
```

逆方向のものが1つあります。

| 変数 | 書き込む主体 | 意味 |
|---|---|---|
| `--hc-zoom` | ライブラリ（毎フレーム） | 現在のズーム倍率 |

**読むだけ。設定しないでください。** オーバーレイ全体が拡大縮小される中で、見かけの大きさを一定に保つための値です。[逆補正](#逆補正)を参照してください。

## 要素と状態

| セレクタ | 要素 |
|---|---|
| `.hc-container` | `container` として渡した要素 |
| `.hc-canvas` | Canvas。`aria-hidden`。意味のあるものはすべてオーバーレイ側にある |
| `.hc-overlay` | ビューポート変換を担う唯一の要素 |
| `.hc-selection` | 選択枠 |
| `.hc-handle` | リサイズ／回転ハンドル。実体は `<button>` |
| `.hc-brush` | 範囲選択の矩形 |
| `.hc-guide` | スナップ中のガイド線 |
| `.hc-a11y-list`, `.hc-a11y-live` | 視覚的に非表示。[アクセシビリティ](/ja/guide/accessibility)を参照 |

状態は**クラス名ではなく data 属性**で表現されます。クラスを同期させる JavaScript なしに条件付き CSS が書けるためです。

| 属性 | 付与先 | 値 |
|---|---|---|
| `data-hc-tool` | `.hc-container` | 現在のツール ID。`select` / `hand` / `draw` / 自作のもの |
| `data-hc-state` | `.hc-container` | `idle` `pointing` `dragging` `brushing` `resizing` `rotating` `panning` |
| `data-hc-selection` | `.hc-selection` | `single` `multiple` |
| `data-hc-locked` | `.hc-selection` | ロックされた図形を含むとき付く |
| `data-hc-handle` | `.hc-handle` | `nw` `n` `ne` `e` `se` `s` `sw` `w` `rotate` |
| `data-hc-guide` | `.hc-guide` | `x` `y` |

```css
/* 丸いハンドル。回転だけ塗りつぶす */
.hc-handle {
  border-radius: 50%;
}
.hc-handle[data-hc-handle='rotate'] {
  background: var(--hc-accent);
  border-color: #fff;
}

/* ハンドツールでは掴む形、パン中は握った形 */
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }

/* ドラッグ中は枠を薄く */
.hc-container[data-hc-state='dragging'] .hc-selection { opacity: 0.6; }

/* ロックされた選択は別の見え方に */
.hc-selection[data-hc-locked] {
  border-style: dotted;
  border-color: #9ca3af;
}
```

## 逆補正

オーバーレイは全体としてスケールされます。それが不変条件3であり、コントロールが何個あってもパンのコストが transform 1回で済む理由です。その帰結として、中の要素はズームに追随して伸縮します。10px のハンドルも例外ではありません。

対処は CSS 上の算術です。

```css
.hc-handle {
  width: calc(var(--hc-handle-size) / var(--hc-zoom));
  height: calc(var(--hc-handle-size) / var(--hc-zoom));
  border-width: calc(1.5px / var(--hc-zoom));
}
```

**オーバーレイ内の要素に書く長さはすべて同じ割り算が必要です。** 枠線・余白・フォントサイズ・オフセット、いずれも。忘れると 100% では正しく、それ以外のズームで崩れます。

代替案 — 毎フレーム JavaScript で各ハンドルに補正済みのピクセル値を書き込む — は不変条件4がまさに禁じているものです。不変条件3で取り除いた要素ごとの処理が戻ってきてしまいます。

## ダークモード

スタイルシートは明るい背景を前提としていません。アプリケーションの他の部分と同じ仕組みを使ってください。

```css
@media (prefers-color-scheme: dark) {
  .hc-container {
    --hc-accent: #60a5fa;
  }
  .hc-handle {
    background: #1f2937;
  }
}
```

Canvas 自体は透明なので、文書の下地はコンテナの背景です。

## モーションの抑制

`prefers-reduced-motion: reduce` の下では、選択枠とハンドルのトランジションが無効化されます。独自にトランジションを追加する場合も同じ設定を尊重してください。

## CSS で足りないとき

異なるマークアップが必要なとき — 選択に追随するツールバー、ラベル付きのハンドル、点を追加する辺の中点 — CSS では到達できません。それが [Level 3](/ja/guide/custom-controls) であり、操作の挙動を諦めることを意味しません。
