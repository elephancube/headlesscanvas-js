# シェイプ

## 共通のフィールド

種別を問わず、すべての図形が同じ基底を持ちます。

```ts
interface ShapeBase<Type, Props> {
  readonly id: ShapeId
  readonly type: Type

  parentId: ShapeId | null   // 所属グループ。ルートでは null
  index: ZIndex              // fractional index — 親の中での描画順

  x: number                  // 親空間での位置。左上、回転前
  y: number
  width: number              // 実寸。常に正
  height: number
  rotation: number           // ラジアン、時計回り、中心まわり

  opacity: number
  locked: boolean
  visible: boolean

  meta: Record<string, unknown>  // 利用者のもの。ライブラリは一切解釈しない

  props: Props               // 種別ごと
}
```

`meta` はアプリケーションのデータを載せるための場所です。データベースの行 ID や自前モデルへの参照などを入れてください。シリアライズを無変更で往復します。

`locked` な図形はクリックして選択できます — 解除するには到達できる必要があるためです — が、ドラッグ・リサイズ・回転・矢印キーでの移動はできず、範囲選択の対象からも外れ、それを含む選択にはハンドルが出ず、`data-hc-locked` 属性が付いて装飾できます。

## 作成と編集

```ts
const id = editor.createShape({
  type: 'rect',
  x: 40,
  y: 40,
  width: 160,
  height: 110,
  props: { fill: { type: 'solid', color: '#4f7cff' }, cornerRadius: 8 },
})

editor.updateShape(id, { rotation: Math.PI / 12 })
editor.deleteShapes([id])
```

省略した項目は種別の既定値になります。`props` は既定値とマージされるので、一部だけ渡しても構いません。

`updateShape` に `props` を渡すと丸ごと置き換わります。1項目だけ変える場合は読んでから書いてください。

```ts
const shape = editor.getShape(id)
if (shape?.type === 'rect') {
  editor.updateShape(id, { props: { ...shape.props, cornerRadius: 16 } })
}
```

## 組み込みの種別

7種類すべてが、自作の型と同じ `ShapeUtil` インターフェースで登録されています。特権的な扱いは一切ありません。

### `rect`

```ts
{ fill: Fill, stroke: Stroke | null, shadow?: Shadow | null, cornerRadius: number }
```

### `ellipse`

```ts
{ fill: Fill, stroke: Stroke | null, shadow?: Shadow | null }
```

### `line`

```ts
{ start: Vec, end: Vec, stroke: Stroke, shadow?: Shadow | null }
```

`start` と `end` は絶対座標ではなく**図形ボックスに対する比率**（0〜1）です。ボックスをリサイズすると端点も一緒に動きます。

### `path`

```ts
{
  d: string                    // M, L, H, V, C, Q, Z（絶対・相対とも）
  fillRule?: 'nonzero' | 'evenodd'
  viewBox?: { width: number; height: number }
  fill: Fill
  stroke: Stroke | null
  shadow?: Shadow | null
}
```

**フリーハンドのストロークもこの型です。**[描画ツール](/ja/guide/tools#フリーハンドで描く)が `path` を作るので、選択・リサイズ・書き出しが他の図形と同じように効きます。

`viewBox` はパスデータを記述した座標系で、そこから図形ボックスへスケールされます。円弧コマンド（`A`）は v1.0 では未対応です。

### `text`

```ts
{
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  lineHeight: number       // fontSize に対する倍率
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  wrap: boolean            // 図形幅で折り返す
  fill: Fill
  stroke?: Stroke | null
}
```

**単一スタイルのブロック**です。1ブロック内での混在スタイルと縦書きは v1.0 の対象外で、それを脚注ではなく型で表明しています。編集は可能です（[後述](#テキストの編集)）。

### `image`

```ts
{
  src: string
  crossOrigin?: 'anonymous' | 'use-credentials' | null   // 既定は 'anonymous'
  naturalSize?: { width: number; height: number } | null // 読み込み時に埋まる
  crop?: { x: number; y: number; width: number; height: number } | null
}
```

文書が持つのは URL と実寸だけで、デコード済みのビットマップは状態木の外のキャッシュにあります。読み込み完了はユーザー操作ではないため、再描画は起こしますが履歴には載りません。

`crossOrigin` の既定が `'anonymous'` なのは、そうしないと PNG 書き出しが静かに壊れるからです。[ドキュメントと書き出し](/ja/guide/documents#cors-と-canvas-の汚染)を参照してください。

### `group`

```ts
{}
```

コンテナです。`width` / `height` は子に追随します。

## 塗りと線

```ts
type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'linear'; stops: GradientStop[]; angle: number }   // ラジアン、+X 軸から時計回り
  | { type: 'radial'; stops: GradientStop[] }
  | { type: 'pattern'; src: string; repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' }

interface Stroke {
  color: string
  width: number
  dash?: number[] | null
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
  align?: 'center' | 'inside' | 'outside'
}

interface Shadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}
```

色は任意の CSS カラー文字列です。グラデーションの `offset` は 0〜1 です。

Canvas は線を輪郭の中央にしか引けないため、`align: 'inside'` と `'outside'` は**倍の太さの線をクリップして**再現しています。SVG 書き出しも同じ手を使うので、両者の結果は一致します。

`fill` / `stroke` を持つシェイプは合成モードも受け付けます。

```ts
blendMode?: GlobalCompositeOperation   // 'multiply'、'screen'、'overlay' など
```

Canvas では `globalCompositeOperation` になります。SVG 書き出しでは CSS にも存在する値だけを `mix-blend-mode` として残し、対応物のない合成操作（`source-in`、`copy` など）は近似せずに落とします。

カスタムシェイプは、これらの意味を近似するのではなくそのまま適用できます。`resolveFill` / `applyStrokeStyle` / `applyShadow` / `paintPath` がそのために公開されています。[カスタムシェイプ](/ja/guide/custom-shapes)を参照してください。

## 選択

```ts
editor.selection.ids                 // readonly ShapeId[]
editor.selection.set([a, b])
editor.selection.add([c])
editor.selection.remove([a])
editor.selection.clear()
editor.selection.selectAll()
editor.selection.getBounds()         // OrientedBounds | null
```

単一選択では図形自身の**回転した**枠を、複数選択では軸並行の枠を返します。複数選択で回転を持たせるには、どれか1つの図形の回転を恣意的に採用するしかなく、「この枠に回転はない」と認める方がましだからです。

## 階層

```ts
editor.group([a, b, c])              // 新しいグループの ID を返す
editor.ungroup(groupId)              // 解放された子を返す

editor.setParent([id], groupId)      // ワールド上の見た目は保たれる
editor.getChildren(parentId)         // 描画順。ルートは null
editor.getAncestors(id)              // 近い順
```

グループ化も解除も、グループの変換を子に焼き込みません。回転したグループの中身は、解除の前後で完全に同じに見えます。

## 重なり順

```ts
editor.reorder([id], 'front')        // 'front' | 'back' | 'forward' | 'backward'
editor.moveTo([id], { before: otherId })
editor.moveTo([id], { after: otherId })
editor.moveTo([id], { position: 'first' })
```

順序は fractional index なので、隣り合う2つの間への挿入で書き換わるのは1フィールドだけです。`before` / `after` アンカーは、ドラッグで並べ替えるレイヤーパネルに必要なものです。

## テキストの編集

テキストは**編集セッション**を通して編集します。テキストシェイプをダブルクリックするか、選択して <kbd>Enter</kbd> または <kbd>F2</kbd> を押してください。

```ts
import { createTextEditor } from '@headless-canvas/ui'

createTextEditor(editor)   // 既定のダイアログ
```

既定の編集 UI は、図形の上に重ねたフィールドではなくモーダルダイアログです。重ねる方式は一見自然ですが機能しません。Canvas のテキスト計測とブラウザ自身のテキストレイアウトは別々の実装なので、フィールドの行分割は描画結果からずれ、キャレットが見当違いの位置に来ます。ダイアログは、その分離を下手に隠さず認めた形です。その場での編集は v1.x の課題として残っています。

セッション自体はコアにあるため、ダイアログは差し替え可能です。[テキストの編集](/ja/guide/text-editing)を参照してください。

<Demo id="basics" title="組み込みの図形" />
