# お絵描き

マウス・指・ペンで描き、ストロークごと消し、PNG か SVG で書き出すか、共有シートに渡します。

<Demo id="sketchpad" />

## ほとんど「描画のコード」ではありません

ストロークは専用のシェイプ型ではありません。`DrawTool` が点を整形して、ただの `path` シェイプを作ります。だから上のアプリには、ストロークの選択・移動・リサイズ・元に戻す・シリアライズ・書き出しのコードが1行もありません。パスに対しては、すでに全部動いていたからです。

**「選択」**に切り替えて、描いたものの角をドラッグしてみてください。他の図形と同じようにリサイズできます。実際、他の図形と同じものだからです。

この判断の代償ははっきりしているので、隠さずに書きます。`path` の線幅は1つなので、**筆圧による可変幅には対応していません。** 幅の変わるストロークは「線を引く」処理ではなく「輪郭を塗る」処理で、別のシェイプ型になります。[ツールガイド →](/ja/guide/tools#フリーハンドで描く)

## 消しゴムと、「元に戻す」の正しい粒度

消しゴムで5本まとめてなぞるのは1つの操作なので、履歴も1件です。このツールはポインタが下りている間は何も削除しません。通過したシェイプを**一時状態（ephemeral）**で薄くしておき、指を離した時に1つのトランザクションでまとめて削除します。

```ts
private mark(event: HcPointerEvent): void {
  const target = event.target
  if (target === null || this.marked.has(target)) return
  this.marked.add(target)
  this.editor.setEphemeral(new Map([...this.marked].map((id) => [id, { opacity: 0.15 }])))
}

onPointerUp(): void {
  const ids = [...this.marked]
  this.reset()
  if (ids.length > 0) this.editor.deleteShapes(ids)  // トランザクション1回 = 履歴1件
}
```

なぞりながら削除するほうがコードは短くなりますが、挙動としては誤りです。ひと続きのなぞりを取り消すのに、元に戻すを5回押させることになります。[履歴とスナップ →](/ja/guide/editing)

## 共有について、正直に

このページの裏にサーバーはありません。そして**画像をリンク経由で受け取ってくれる SNS は存在しません。** 投稿に付く画像は端末から渡すしかないので、「共有」は「X に投稿する」という意味にはなりえません。このアプリは次の3つを順に試します。

1. **`navigator.share` にファイルを渡す。** OS の共有シートが開きます。描画の大半が起きるスマートフォン・タブレットでは、これが本命です。HTTPS とユーザー操作が必要です。
2. **クリップボード。** `ClipboardItem` で書いた PNG は投稿欄にそのまま貼り付けられます。デスクトップはこちらです。
3. **ダウンロード。** 常に使えます。

共有シートを閉じた場合は、そこで止めます。**渡すのをやめた相手にファイルを押し付けるのは、代替手段ではありません。**

```ts
if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
  try {
    await navigator.share({ files: [file], text })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  }
}
```

## 2つの書き出し、1つの絵

`editor.export()` は任意の倍率でラスタライズし、`editor.exportSvg()` はストロークをベクタとして書き出します。どちらも同じ `background` と `padding` を受け取るので、PNG と SVG の余白は一致します。

SVG は開いてみる価値があります。ビットマップをトレースしたものではなく、**整形処理が生成した曲線データそのものが `<path>` として出てきます。** [ドキュメントと書き出し →](/ja/guide/documents)

## ソース

ツールバー・パレット・消しゴム・共有の部品は共有のモジュールにあります。これはドキュメントサイトのコードであってライブラリのコードではありません。HeadlessCanvas はアプリケーション UI を一切同梱しないためです。

::: details アプリ本体
<<< @/.vitepress/apps/sketchpad.ts
:::

::: details 共有部品（ツールバー・消しゴム・共有）
<<< @/.vitepress/apps/chrome.ts
:::

[← サンプルアプリ一覧](./)
