# 履歴とスナップ

## Undo と Redo

```ts
editor.history.undo()
editor.history.redo()
editor.history.clear()
editor.history.getSize()    // { undo: 3, redo: 0 }
editor.history.subscribe(() => updateToolbarButtons())
```

<kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> / <kbd>Ctrl+Y</kbd> はコンテナに登録済みです。

### 仕組み

スタックが保持するのはスナップショットではなく**逆パッチ**です。スナップショット方式のほうが実装は簡単ですが、メモリ消費が文書サイズに比例します。そして逆パッチは、エディタがすでに適用方法を知っている表現です — `applyPatch` が同じものを受け取ります。結果として、Undo と外部からの変更は2つではなく1つの機構の上に載ります。

```ts
type Patch =
  | { op: 'create'; shape: AnyShape }
  | { op: 'update'; id: ShapeId; before: Partial<AnyShape>; after: Partial<AnyShape> }
  | { op: 'delete'; shape: AnyShape }
```

### スタックに載せないもの

**ビューポート。** パンを Undo するのは誰も期待していません。

**選択状態** — ただし各エントリは前後の選択を記録しており、Undo 時に**復元します**。これがないと、画面外で何かが元に戻っただけでユーザーには何が起きたか分かりません。

### 粒度

1トランザクションが1エントリです。

```ts
editor.transact(() => {
  editor.updateShape(a, { x: 10 })
  editor.updateShape(b, { x: 10 })
}) // Undo 1ステップ
```

ドラッグは何フレームかかっても1エントリです。途中のフレームは[一時状態](/ja/guide/concepts#一時状態ephemeral-state)であり、記録されるのはコミットだけだからです。

同じ `mergeKey` を持つ連続したコミットは、時間窓（既定 1000ms）の中で1つにまとまります。

```ts
// 自前のインスペクタでスライダーをドラッグする場合
editor.transact(
  () => editor.updateShape(id, { props: { ...shape.props, cornerRadius: value } }),
  { mergeKey: `corner-radius:${id}` },
)
```

組み込みもこれを使っています。矢印キーの押しっぱなしは40件ではなく1件になり、リサイズも毎フレームではなくハンドル操作ごとに1件になります。時間窓があるのは、1秒空けた2回の押下を別々に保つためです。キーだけで結合すると永遠にまとまってしまいます。

`editor.history.mark()` で明示的に区切ることもできます。

### Undo の対象にすべきでない変更

```ts
editor.transact(() => { /* ... */ }, { addToHistory: false })
```

ユーザーが行ったのではない変更に使います。共同編集者から届いた状態や、ローダーが埋めた値など。

::: warning
v1.0 では、外部パッチを適用した状態での履歴の正しさを保証していません。`applyPatch` は将来のために提供しているもので、Undo との相互作用に依存しないでください。
:::

## スナップ

<Demo id="snapping" title="図形の辺・中心がグリッドより優先されます" />

```ts
editor.setSnapping({ enabled: true, grid: 20, toObjects: true, thresholdPx: 5 })
editor.snapping             // 現在の設定（読み取り専用）
editor.getSnapGuides()      // 現在有効なガイド
```

| 設定 | 既定 | 意味 |
|---|---|---|
| `enabled` | `true` | 全体の有効・無効 |
| `grid` | `null` | ワールド単位のグリッド幅。`null` でグリッドなし |
| `toObjects` | `true` | 他図形の辺・中心へ吸着 |
| `thresholdPx` | `5` | 吸着する距離（**スクリーン**ピクセル） |

しきい値がスクリーンピクセルなのは、どのズームでも同じ感触にするためです。ワールド固定にすると、縮小したときに使い物にならなくなります。

ドラッグ中に <kbd>Alt</kbd> を押している間は吸着しません。

### 知っておくべき2つの判断

**図形への吸着がグリッドより優先されます。** 目視で揃えたものを 1px 隣のグリッド線へ引き寄せるのは、まさにその人が行っていた整列を壊す動作です。

**選択は1つの箱としてスナップします。** 複数選択で各図形を個別に吸着させると、選択内部の間隔が変わってしまいます。代わりに外接矩形を吸着させ、得られた補正量を全体へ一様に適用します。

### ガイド

```ts
interface SnapGuide {
  axis: 'x' | 'y'
  position: number   // 線のワールド座標
  start: number      // もう一方の軸方向の範囲
  end: number
}
```

勝った補正量に一致するペアを**すべて**返します。同サイズの箱どうしでは左・中央・右が同時に揃うことがあり、1本しか出さないと実際に起きたことを過小に伝えます。

既定 UI はこれを `.hc-guide` 要素として描きます。自作コントロールでは `onFrame` の中で `getSnapGuides()` を読んでください。

### 自作ツールから

```ts
const result = editor.computeSnap(proposedBounds, new Set(movingIds))
// { dx, dy, guides }
```

動かしている図形は除外してください。そうしないと自分自身に吸着します。

## クリップボード

```ts
import { createClipboardBinding } from '@headless-canvas/ui'

const clipboard = createClipboardBinding(editor)
clipboard.dispose()
```

コピー・カット・ペーストと画像のドラッグ&ドロップです。`core` ではなく `ui` にあるのは、システムクリップボードの読み取りが権限プロンプトを出し得るためで、それをいつ出すかはライブラリではなくアプリケーションの判断だからです。

異なる挙動が必要な場合、コアはその土台となるプリミティブを提供しています。

```ts
const doc = editor.getSelectionAsDocument()
const ids = editor.insertDocument(doc, { x: 24, y: 24 })
```

貼り付けられた画像は data URL として保持されます。同一オリジンになるため canvas を汚染せず、[書き出しが動き続けます](/ja/guide/documents#cors-と-canvas-の汚染)。
