# Controls

```ts
editor.controls
```

コントロール UI のヘッドレス側です。ここでは DOM を生成も所有もしません。「何を描くべきか」を報告し、手元にある要素をハンドルとして機能させます。

これが `ui` ではなく `core` にあるのは意図的です。既定 UI は React 専用ではないため、操作ロジックが既定 UI の隣にあると、React バインディングと自作コントロールがそれぞれ独自のコピーを必要とします。3つの実装を一致させ続けることになります。実装は1つです。

## `getSelectionBox()`

```ts
getSelectionBox(): SelectionBoxDescriptor | null
```

選択 UI が今どうあるべきかを返します。何も選択されていなければ `null` で、そのときコントロール DOM が存在しない理由でもあります。

```ts
interface SelectionBoxDescriptor {
  bounds: OrientedBounds       // ワールド空間
  isSingle: boolean
  hasLocked: boolean
  handles: readonly HandleDescriptor[]
}

interface HandleDescriptor {
  id: HandleId                 // 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'
  position: Vec                // 枠内の 0..1。パーセント指定にそのまま使える
  cursor: string
  label: string                // メッセージ表を通して解決済み
}
```

`bounds.rotation` は単一選択では図形に追随し、複数選択では `0` です。

選択にロックされた図形が含まれる場合、`handles` は**空**です。単一選択で、その util が `canRotate: false` を宣言している場合は回転ハンドルが省かれます。

## `bindHandle()`

```ts
bindHandle(element: HTMLElement, handle: HandleId): () => void
```

`element` を該当ハンドルとして機能させます。すべてを解除する関数を返すので、保持して破棄時に呼んでください。

設定するもの:

- `role="button"`、メッセージ表からの `aria-label`、`data-hc-handle`、`tabindex` がなければ `"0"`
- インラインの `pointer-events: auto` と `touch-action: none`

登録するもの:

- `pointerdown` — ポインタをキャプチャし、イベントが Canvas 面へ届くのを止め、`onHandlePointerDown` で現在のツールへ回送する
- `keydown` — 矢印キーでハンドルを操作。1単位、<kbd>⇧</kbd> で10単位。`onHandleNudge` 経由

オーバーレイは `pointer-events: none` で、ハンドルだけが個別に受け取りを再開します。それによりブラウザが所有権を裁定します。ハンドルの上ならハンドル、それ以外なら Canvas。JavaScript のヒットテストが決めているわけではありません。

## アクセシビリティ記述子

```ts
getA11yShapeDescriptors(): A11yShapeDescriptor[]
getA11ySummary(): { total: number; visible: number }
```

```ts
interface A11yShapeDescriptor {
  id: ShapeId
  label: string      // ShapeUtil.getAccessibleLabel、なければ種別名
  selected: boolean
  locked: boolean
}
```

記述子は**表示範囲のみ**を対象とします。図形ごとに出力すると5,000ノードが DOM に並び、アーキテクチャが依拠する有界なノード数を失います。総数が隠れないよう、リストと一緒に要約も提示してください。

## 定数

```ts
const RESIZE_HANDLES: readonly HandleId[]
// ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
```

ハンドルの位置とカーソル:

| ハンドル | `position` | カーソル |
|---|---|---|
| `nw` | `{ x: 0, y: 0 }` | `nwse-resize` |
| `n` | `{ x: 0.5, y: 0 }` | `ns-resize` |
| `ne` | `{ x: 1, y: 0 }` | `nesw-resize` |
| `e` | `{ x: 1, y: 0.5 }` | `ew-resize` |
| `se` | `{ x: 1, y: 1 }` | `nwse-resize` |
| `s` | `{ x: 0.5, y: 1 }` | `ns-resize` |
| `sw` | `{ x: 0, y: 1 }` | `nesw-resize` |
| `w` | `{ x: 0, y: 0.5 }` | `ew-resize` |
| `rotate` | `{ x: 0.5, y: 0 }` | `grab` |

`rotate` は `n` と位置を共有しており、スタイルシートが `--hc-rotate-distance` で上へ逃がしています。

## 使い方

完全な実装例は[コントロールを自作する](/ja/guide/custom-controls)に、これらを包むフックは [React](/ja/guide/react#level-3) にあります。
