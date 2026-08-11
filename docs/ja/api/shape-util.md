# ShapeUtil

シェイプ種別1つの実装です。組み込み7種を含め、すべての図形がこのインターフェースを通ります。レンダラ・ヒットテスト・シリアライザから種別ごとの `switch` を締め出しているのがこれです。

```ts
interface ShapeUtil<S extends ShapeBase = AnyShape> {
  readonly type: S['type']

  readonly propsVersion?: number
  migrateProps?(props: unknown, fromVersion: number): S['props']

  getDefaultProps(): S['props']

  render(shape: S, ctx: CanvasRenderingContext2D, info: RenderInfo): void
  hitTest(shape: S, point: Vec, tolerance: number): boolean

  getPath?(shape: S): string | null
  toSvg?(shape: S, info: SvgRenderInfo): SvgNode | SvgNode[] | null

  getLocalBounds?(shape: S): Bounds
  onResize?(shape: S, next: { width: number; height: number }): Partial<S['props']>
  getResources?(shape: S): ResourceRequest[]
  getAccessibleLabel?(shape: S): string

  getText?(shape: S): string | null
  setText?(shape: S, text: string): Partial<S['props']>

  readonly preserveAspectRatio?: boolean
  readonly canRotate?: boolean          // 既定は true
}
```

解説は[カスタムシェイプ](/ja/guide/custom-shapes)にあります。このページはリファレンスです。

## メンバ

### `type`

判別子。`ShapeRegistry` の declaration merging で使ったキーと一致させてください。

### `getDefaultProps()`

`createShape` で省略された項目のために呼ばれます。完全な `props` を返す必要があります。

### `render(shape, ctx, info)`

コンテキストは図形の**ローカル空間**へ平行移動・回転済み — `(0, 0)` は回転前の左上 — で、`globalAlpha` には継承された不透明度が反映済みです。`(0, 0)` から `(width, height)` の間に描いてください。

```ts
interface RenderInfo {
  zoom: number                                      // 縮小時にヘアラインを残す
  isExporting: boolean                              // アニメーションを止める
  getImage?(src: string): CanvasImageSource | null  // 読み込み中は null
}
```

`getImage` は await せず要求するだけなので、描画は同期的なままです。届いていない画像はそのフレームでは飛ばされ、読み込み完了後の再描画で現れます。

### `hitTest(shape, point, tolerance)`

空間インデックスがすでに範囲内と判定した図形にしか呼ばれないので、厳密であって構いません。

`point` はローカル空間です（回転は処理済み）。`tolerance` はクリック許容誤差で、スクリーンピクセルからローカル単位へ変換済みです。そうでなければクリックできない細い形状に使ってください。

### `getPath(shape)` / `toSvg(shape, info)`

[`editor.exportSvg()`](/ja/api/editor#ドキュメントと書き出し) でのシェイプの見え方です。どちらも必須ではありませんが、両方とも実装していないシェイプは SVG から除外され、`export-failed` として通知されます。

`getPath` はローカル空間での輪郭を SVG のパスデータで返します。書き出し側がシェイプの `fill` / `stroke` / `shadow` / `fillRule` を、Canvas で `paintPath` が適用するのと同じ意味で組み合わせます（グラデーションは `<defs>` へ、影は `feDropShadow`、線の内側／外側揃えはクリップで）。パス文法は円弧を含め全体を使えます。これは `parsePath` が読み戻せる部分集合より広い範囲です。

`toSvg` は `getPath` より優先され、マークアップ自体を書きます。塗られた輪郭ではないシェイプ向けです。

```ts
interface SvgNode {
  tag: string
  attrs?: Record<string, string | number | undefined>   // undefined は出力せず、数値は整形される
  children?: readonly SvgNode[]
  text?: string                                         // エスケープされる。children とは併用しない
}

interface SvgRenderInfo {
  define(node: SvgNode): string                         // <defs> に追加して id を返す
  resolveFill(fill: Fill, width: number, height: number): string
  measureText(text: string, font: string, letterSpacing: number): number | null
  resolveImage(src: string): string                     // data URI、または元の URL
}
```

**意図的に何も描かないシェイプは `null` ではなく `[]` を返してください。** `null` は「表現できない」という意味で、警告の対象になります。`groupShapeUtil` は `[]` を返します。

シェイプの変換・継承された不透明度・合成モードは、書き出し側が包む `<g>` に適用します。`render` と同じく、ローカル座標だけを出力してください。

### `getLocalBounds(shape)`

正確なローカル境界。既定は `(0, 0, width, height)` です。描画範囲が図形ボックスを超えるとき — はみ出す矢尻、グロー — に上書きします。空間インデックスとカリングがこれを使うため、値が不正だとビューポート端で図形が消えます。

### `onResize(shape, next)`

返すのは**従属的な** `props` の調整だけです。`width` / `height` はコアが書き換えます。

```ts
onResize(shape, next) {
  return { cornerRadius: Math.min(shape.props.cornerRadius, next.width / 2, next.height / 2) }
}
```

### `getResources(shape)`

```ts
interface ResourceRequest {
  kind: 'image' | 'font'
  src: string
  crossOrigin?: 'anonymous' | 'use-credentials' | null
}
```

キャッシュがこれらを読み込みます。完了時の再描画は履歴に載りません。ユーザー操作ではないためです。

### `getAccessibleLabel(shape)`

非表示の図形リストと live リージョンが述べる内容です。実装しないと種別名が使われ、すべてのインスタンスが同じに読まれます。

### `getText` / `setText`

```ts
getText?(shape: S): string | null
setText?(shape: S, text: string): Partial<S['props']>
```

**両方**を実装すると、その図形が編集可能になります。ダブルクリック、<kbd>Enter</kbd>、<kbd>F2</kbd>、既定のダイアログ、`editor.editing` 上に構築した任意の編集 UI のすべてで有効です。片方だけでは何も起きません。エディタは対で確認します。

`setText` は書き込まずに partial を返します。変更がどのトランザクションに載るかを呼び出し側が握り続けるためです。[テキストの編集](/ja/guide/text-editing)を参照してください。

### `propsVersion` / `migrateProps`

```ts
propsVersion: 2,
migrateProps(props, fromVersion) {
  const next = props as Record<string, unknown>
  if (fromVersion < 2) next.fill = String(next.color ?? '#000')
  return next as S['props']
}
```

文書は props の版数を種別ごとに記録するため、カスタムシェイプはライブラリのスキーマ版数からも他のプラグインからも独立して移行できます。移行が例外を投げた場合は `schema-migration-failed` として通知され、当該シェイプは失われず未描画のまま保持されます。

### `preserveAspectRatio`

<kbd>⇧</kbd> を押しているのと同じく、縦横比を保ってリサイズします。

### `canRotate`

`false` にすると、この種別の単一選択で回転ハンドルが出なくなります。複数選択では常に回転できます。

## レジストリ

```ts
class ShapeUtilRegistry {
  constructor(utils?: readonly ShapeUtil<any>[])
  register(util: ShapeUtil<any>): void
  get(type: string): ShapeUtil<any> | undefined   // 未登録の型では undefined
  has(type: string): boolean
  types(): string[]
}
```

`editor.registry` から到達できます。未登録の型は**保持されるが描画されません**。[ドキュメント](/ja/guide/documents#未登録のシェイプ型)を参照してください。

## 型を付ける

```ts
interface StarShape extends ShapeBase<'star', { points: number; fill: string }> {}

declare module '@headless-canvas/core' {
  interface ShapeRegistry {
    star: StarShape
  }
}
```

マージしないと `props` は `unknown` になります。型を後から厳しくすることは破壊的変更なので、厳しい形を先に出荷します。

## 登録する

```ts
import { defaultShapeUtils, Editor } from '@headless-canvas/core'

new Editor({ container, shapeUtils: [...defaultShapeUtils, starShapeUtil] })
```

`shapeUtils` は既定の集合を**置き換えます**。自作の型だけにしたい場合を除き、`defaultShapeUtils` を展開してください。

## 組み込みの util

`rectShapeUtil` / `ellipseShapeUtil` / `lineShapeUtil` / `pathShapeUtil` / `textShapeUtil` / `imageShapeUtil` / `groupShapeUtil`、およびこの7つを含む `defaultShapeUtils`。

## 実装用のヘルパー

描画。組み込みの意味を近似ではなくそのまま再現します。

```ts
resolveFill(ctx, fill, width, height, info): string | CanvasGradient | CanvasPattern | null
applyStrokeStyle(ctx, stroke): void
applyShadow(ctx, shadow): void
paintPath(ctx, options: PaintOptions): void
```

通常は `paintPath` を使います。塗り・線・影・線の配置を、組み込みと同じ順序で適用します。

```ts
interface PaintOptions {
  buildPath(ctx: CanvasRenderingContext2D): void   // 複数回呼ばれる。副作用を持たせないこと
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
  fillRule?: CanvasFillRule
  width: number
  height: number
  info: RenderInfo
}
```

パスをコンテキスト上に残すのではなくビルダとして渡すのは、内側・外側の線の配置を「2倍幅でストロークしてクリップする」方法で再現しており、輪郭が複数回必要になるためです。

幾何:

```ts
pointInPolygon(polygon, point): boolean
distanceToSegment(point, a, b): number
distanceToPolyline(points, point): number
parsePath(d): PathCommand[]
flattenPath(commands, ...): Vec[][]
pathBounds(subpaths): Bounds
emitPath(sink, commands, ...): void     // sink: 2D コンテキスト・Path2D・任意の PathSink
pathData(commands, ...): string         // 同じコマンドを SVG の `d` 属性として返す
```

テキスト計測:

```ts
fontString(props): string
```
