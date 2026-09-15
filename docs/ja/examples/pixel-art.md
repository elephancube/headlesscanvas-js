# ドット絵エディタ

32×32 のマス目、16色、塗りつぶしとスポイト。アイコン用に 32px で、鑑賞用に 512px で保存できます。

<Demo id="pixel-art" />

## 1マスが1シェイプ

塗られたマスは、ただの `rect` です。ドット絵エディタとしては贅沢に聞こえますが、**このアプリが短い理由がそれ**です。消しゴム・元に戻す・やり直す・クリア・書き出しは、1行目を書く前からすでに完成していました。全面を埋めても 1,024 個で、レンダラのベンチマーク（5,000個）の 1/5 です。

**文書が絵そのもの**なので、アプリはビットマップを別に持ちません。必要になったら文書から読み直します。

```ts
function readBoard(editor: Editor): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const id of editor.getChildren(null)) {
    const shape = editor.getShape(id)
    if (shape?.type !== 'rect') continue
    const fill = shape.props.fill
    cells.set(cellKey(Math.round(shape.x / CELL), Math.round(shape.y / CELL)), {
      id,
      color: fill.type === 'solid' ? fill.color : '#000000',
    })
  }
  return cells
}
```

キャッシュせず毎回導出しているのは意図的です。**元に戻す・やり直す・ファイル読み込みは、アプリに断りなく文書を書き換えます。** キャッシュを持つと、まさに「元に戻す」を押した瞬間に間違った値を持つことになります。

## 1ストロークが Undo 1回

30マスを横切るドラッグは、**元に戻す1回**で消えるべきです。しかし同時に、**ユーザーは通過したマスをその場で見る必要**があるので、書き込みを遅らせることはできません。この2つは、ストローク中の書き込みに同じ結合キーを与え、指を離したときに履歴を封じることで両立します。

```ts
this.editor.transact(() => { /* この移動で通過したマスを塗る */ }, { mergeKey: 'pixel' })

// …そして離したとき:
this.editor.history.mark()   // 次のストロークは別の履歴になる
```

`mark()` がないと、1秒以内に描いた2本のストロークが1件にまとまってしまいます。[履歴とスナップ →](/ja/guide/editing)

ポインタイベントは1マスにつき1回など到底来ないので、**前回の位置から今回の位置までのマスを補間**しています（ツール内の素朴な Bresenham）。

## 大きく書き出してもボケない

`editor.export({ scale })` は**画像の拡大ではありません。** 新しい倍率でシーンを描き直しています。ここでは1ドットが長方形なので、512px の書き出しは**同じ長方形を16倍の大きさで描く**ことになります。エッジは画面で見えているとおりの硬さのままです。

```ts
editor.export({
  format: 'png',
  scale: 16 / CELL,
  background: transparent ? null : '#ffffff',
  // 塗られた部分の外接矩形ではなく盤面全体。だから画像は常に 32×32 で、
  // スプライトは自分の位置を保てる。
  bounds: { x: 0, y: 0, width: SIZE, height: SIZE },
})
```

この `bounds` は見た目より重要です。**指定しないと、隅に描いたスプライトはぴったり切り抜かれ、スプライトたらしめていた位置情報を失います。** [ドキュメントと書き出し →](/ja/guide/documents)

## 共有

**「SNSなどで共有」**は 512px の PNG を、ブラウザが提供する手段に渡します。スマートフォン・タブレットでは OS の共有シート、デスクトップではクリップボード、どちらも無ければダウンロードです。このページの裏にサーバーはなく、**画像をリンク経由で受け取る SNS も存在しない**ので、静的サイトで正直にできるのはここまでです。[お絵描き](./sketchpad#共有について、正直に)と同じ3段構えです。

**共有する画像は「背景を透明に」がオンでも白背景にしています。** 透明はスプライトとして保存するためのもので、タイムラインに流すと、ダークテーマでは暗い色のドットが背景に溶けて消えるためです。

## グリッドは1要素

オーバーレイの中に置いてあり、そこにはビューポート変換がすでに掛かっているので、**盤面と一緒にパン・ズームします。** マウント時に1回書いたきり、二度と触りません。JavaScript が設定するのは `background-size` だけです。

```css
.hc-app-pixel-grid {
  background-image:
    linear-gradient(to right, var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)), transparent 0),
    linear-gradient(to bottom, var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)), transparent 0);
}
```

`--hc-zoom` で割ることで、どのズーム率でも線は画面上1px のままです。既定のハンドルがサイズを保つのとまったく同じ仕組みです。[装飾ガイド →](/ja/guide/styling)

## ソース

::: details アプリ本体
<<< @/.vitepress/apps/pixel-art.ts
:::

[← サンプルアプリ一覧](./)
