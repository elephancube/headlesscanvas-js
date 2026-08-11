# カスタムシェイプ

シェイプ種別は登録制で、ハードコードされていません。組み込みの7種類もここで説明する仕組みをそのまま通っています。特権的な集合は存在せず、レンダラにもヒットテストにもシリアライザにも `switch (shape.type)` はありません。

<Demo id="custom-shape" title="アプリケーション側のコードだけで定義した星" />

## 型を定義する

```ts
import type { ShapeBase } from '@headless-canvas/core'

interface StarShape extends ShapeBase<'star', { points: number; fill: string }> {}
```

続いてレジストリにマージし、API の他の部分に知らせます。

```ts
declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}
```

これが `props` の型付けを保ちます。これなしでは `createShape({ type: 'star', ... })` は型検査を通らず、`getShape(id).props` は `unknown` になります。すべての呼び出しにジェネリック引数を通す方式ではなく declaration merging を選んだのは意図的です。型を後から厳しくすることは破壊的変更なので、厳しい方を先に出荷します。

## util を実装する

```ts
import type { ShapeUtil, Vec } from '@headless-canvas/core'

const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 1,
  preserveAspectRatio: true,

  getDefaultProps: () => ({ points: 5, fill: '#f59e0b' }),

  render(shape, ctx, info) {
    // ctx はすでに図形のローカル空間に変換されている。
    // (0, 0) は回転前の図形左上。
    ctx.beginPath()
    for (const [i, point] of starPoints(shape).entries()) {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.closePath()
    ctx.fillStyle = shape.props.fill
    ctx.fill()
  },

  hitTest(shape, point, tolerance) {
    // `point` はローカル空間。`tolerance` はスクリーンピクセルから
    // ローカル単位へ変換済み。
    return pointInPolygon(starPoints(shape), point)
  },
}
```

エディタ構築時に登録します。

```ts
import { defaultShapeUtils, Editor } from '@headless-canvas/core'

const editor = new Editor({
  container,
  shapeUtils: [...defaultShapeUtils, starShapeUtil],
})
```

`shapeUtils` を渡すと既定の集合を**置き換えます**。自作の型だけにしたい場合を除き、`defaultShapeUtils` を展開してください。

## インターフェース全体

| メンバ | 必須 | 役割 |
|---|---|---|
| `type` | ✓ | 判別子。レジストリのキーと一致すること |
| `getDefaultProps()` | ✓ | `createShape` で省略された項目を埋める |
| `render(shape, ctx, info)` | ✓ | ローカル空間での描画 |
| `hitTest(shape, point, tolerance)` | ✓ | 広域絞り込みのあとの厳密判定 |
| `getPath(shape)` | | SVG パスデータとしての輪郭。SVG 書き出しに使う |
| `toSvg(shape, info)` | | 輪郭だけでは足りないときに SVG 全体を制御する |
| `getLocalBounds(shape)` | | 正確なローカル境界。既定は `(0, 0, width, height)` |
| `onResize(shape, next)` | | リサイズに伴う従属的な `props` の調整 |
| `getResources(shape)` | | 先読みする画像・フォント |
| `getAccessibleLabel(shape)` | | スクリーンリーダーが読む説明 |
| `propsVersion` | | `props` のスキーマ版数 |
| `migrateProps(props, from)` | | 古い `props` の移行 |
| `getText` / `setText` | | 編集可能なテキスト。両方実装すると編集可能になる |
| `preserveAspectRatio` | | 縦横比を保ってリサイズ |
| `canRotate` | | 既定 true。false で回転ハンドルを出さない |

### `render`

コンテキストは図形のローカル空間へ平行移動・回転済みで渡され、`globalAlpha` には継承された不透明度が反映済みです。`(0, 0)` から `(width, height)` の間に描いてください。ライブラリのために全体を save/restore で囲む必要はありません（処理済みです）。

`info` には、任意のズームで綺麗に描くために必要なものが入っています。

```ts
interface RenderInfo {
  zoom: number                                    // 縮小時にヘアラインを残す
  isExporting: boolean                            // アニメーションを止める
  getImage?(src: string): CanvasImageSource | null // 読み込み中は null
}
```

組み込みと同じ塗り・線の意味を近似でなく厳密に再現するには、組み込みが使っているヘルパーをそのまま使ってください。

```ts
import { applyShadow, applyStrokeStyle, paintPath, resolveFill } from '@headless-canvas/core'
```

### `getPath` / `toSvg`

どちらも必須ではありませんが、**両方とも実装していない図形は SVG 書き出しに現れません。** 黙って落とすのではなく `export-failed` として通知したうえで除外します。

`props` が標準の `fill` / `stroke` / `shadow` を持つなら、輪郭を返すだけで十分です。グラデーション・線の位置揃え・影を含め、Canvas で `paintPath` が適用するのと同じ意味で書き出し側が適用します。

```ts
getPath(shape) {
  const { width: w, height: h } = shape
  return `M${w / 2},0L${w},${h}L0,${h}Z`
}
```

独自の塗り方をする図形や、そもそも輪郭ではない図形は、マークアップ自体を自分で書いてください。組み込みのテキストと画像はこちらです。

```ts
toSvg(shape, info) {
  return {
    tag: 'path',
    attrs: { d: outlineOf(shape), fill: shape.props.fill, stroke: '#b45309', 'stroke-width': 2 },
  }
}
```

`info` は図形単体では決められないものを渡します。id は書き出す文書ごとに一意である必要があり、グラデーションは `<defs>` に置く必要があり、画像を埋め込めるかどうかは取得元によります。

```ts
interface SvgRenderInfo {
  define(node: SvgNode): string                     // <defs> に追加して id を返す
  resolveFill(fill, width, height): string          // 色・'none'・url(#id)
  measureText(text, font, letterSpacing): number | null
  resolveImage(src): string                         // data URI、または元の URL
}
```

**意図的に何も描かない図形は `null` ではなく `[]` を返してください。** 表現できない図形と区別するためです。`groupShapeUtil` がそうしています。

### `hitTest`

R-Tree がすでに範囲を絞った図形にしか呼ばれないので、厳密であって構いません。回転は処理済みで、点はローカル空間へ写像されています。

`tolerance` はクリックの許容誤差で、スクリーンピクセルからローカル単位へ変換済みです。細い形状に使ってください。

```ts
hitTest(shape, point, tolerance) {
  return distanceToPolyline(outline(shape), point) <= tolerance
}
```

`pointInPolygon` / `distanceToSegment` / `distanceToPolyline` がこのために公開されています。

### `getLocalBounds`

描画される範囲が図形ボックスと一致しないとき — はみ出す矢尻、グロー — に上書きします。空間インデックスとカリングがこれを使うため、値を誤ると「見た目が少し変」ではなく「ビューポート端で図形が消える」という症状になります。

### `onResize`

`width` / `height` はコアが書き換えます。このフックが返すのは**従属的な**調整だけです。

```ts
onResize(shape, next) {
  return { cornerRadius: Math.min(shape.props.cornerRadius, next.width / 2, next.height / 2) }
}
```

### `getResources`

図形が必要とする外部リソースです。キャッシュが読み込み、完了すると再描画されますが履歴には載りません。ユーザー操作ではないためです。

```ts
getResources(shape) {
  return [{ kind: 'image', src: shape.props.src, crossOrigin: 'anonymous' }]
}
```

### `getAccessibleLabel`

非表示の図形リストと live リージョンがこの図形について述べる内容です。実装しないと種別名が使われ、どの星も「star」としか読まれません。

```ts
getAccessibleLabel: (shape) => `${shape.props.points} 芒星`
```

### `getText` / `setText`

両方を実装すると、組み込みのテキストブロックとまったく同じように編集可能になります。ダブルクリック、<kbd>Enter</kbd>、<kbd>F2</kbd>、既定のダイアログ、`editor.editing` 上の任意の編集 UI のすべてで有効です。

```ts
getText: (shape) => shape.props.caption,
setText: (_shape, text) => ({ caption: text }),
```

エディタは種別ごとの知識を持たないため、特権的な「テキストシェイプ」は存在しません。[テキストの編集](/ja/guide/text-editing)を参照してください。

## props のバージョン管理

カスタムシェイプは出荷した瞬間から変化していきます。移行フックを各作者が独自に発明せずに済むよう、仕組みを標準化しています。

```ts
const starShapeUtil: ShapeUtil<StarShape> = {
  type: 'star',
  propsVersion: 2,

  migrateProps(props, fromVersion) {
    const next = props as Record<string, unknown>
    if (fromVersion < 2) {
      // v1 は色名、v2 は16進文字列
      next.fill = NAMED[next.fill as string] ?? '#f59e0b'
    }
    return next as StarShape['props']
  },
}
```

文書は props の版数を**種別ごと**に記録します。あなたのシェイプは、ライブラリのスキーマ版数からも他人のプラグインからも独立して移行できます。移行が例外を投げた場合は通知チャネルへ流れ、当該シェイプは破棄されず未描画のまま保持されます。

## 未登録の種別は保持される

util を登録していない種別を含む文書を読み込んでも、レコードは**破棄されず保持されます**。描画も選択もされませんが、再シリアライズすると届いたときのまま書き出されます。

これがプラグインを安全に外せる理由です。試しにプラグインを外して保存し、そのプラグインが持っていた図形をすべて失う — その失敗を防いでいます。発生したことは通知（`unknown-shape-type`）で分かります。

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'unknown-shape-type') console.warn(n.message)
})
```

## DOM でなければならない図形

動画、iframe、生きた Web ビュー。Canvas には描けないものです。DOM で描画するシェイプの経路は**予定されており、v1.0 には含まれません。** `ShapeUtil` に `renderDOM` メンバはまだなく、すべての図形は Canvas に描画されます。ここに書いているのは、これが見落としではないことを示すためです。設計としては拡張点を予約しており、そうした要素は既定で `pointer-events: none` とする — iframe が入力を飲み込んで選択・移動ができなくなるのを防ぐため — という規則も含みます。
