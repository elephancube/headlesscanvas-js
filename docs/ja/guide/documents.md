# ドキュメントと書き出し

<Demo id="documents" title="保存される内容そのものを、リアルタイムで" />

## 保存と読み込み

```ts
const document = editor.toJSON({ savedBy: 'alice' })  // meta は任意
editor.loadDocument(document)
```

`toJSON()` は素のオブジェクトを返します。保存方法は自由です。

```ts
interface HcDocument {
  schemaVersion: number
  shapes: AnyShape[]
  propsVersions?: Record<string, number>   // シェイプ種別ごと
  resources?: Record<string, string>       // 画像。取得元の URL をキーにする
  meta?: Record<string, unknown>
}
```

`schemaVersion` を初回リリースから入れているのは、**後から追加できない**ためです。版数なしで書かれたファイルは、版数フィールドがたまたま欠けた将来のファイルと区別がつきません。`propsVersions` は種別ごとの版数を記録するので、カスタムシェイプはライブラリからも他人のプラグインからも独立して移行できます。

読み込みは Undo の対象ではなく、履歴をクリアします。文書を編集するのではなく置き換える操作だからです。

### ファイルとして扱う

**これ以上のファイル形式はありません。** 中身は JSON なので、書き出しはアプリケーションが普段 JSON に対して行っていることそのものです。

```ts
const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
```

```ts
const file = input.files?.[0]
if (file) editor.loadDocument(JSON.parse(await file.text()))
```

上のデモがまさにこれで、拡張子は `.hcanvas` にしています。

### 単体で完結させる

画像は URL の先にあるため、それを参照する文書はそれ単体では持ち運べません。ファイルを移動すると絵が欠けます。`embedImages` で埋め込めます。

```ts
editor.toJSON(undefined, { embedImages: true })
```

バイト列は URL をキーにして `resources` に入ります。**シェイプ側は書き換えません。** どの画像がどこから来たかを文書が保持し続けるためであり、同時に**どのシェイプ型も「自分の URL がどこにあるか」を書き出し側に教える必要がなくなります**（`getResources()` が登録制の上ですでに列挙しています）。

知っておくべき帰結が3つあります。

- **読み込んだ文書が持っていた画像は、`embedImages` の指定に関係なく必ず書き戻します。** 今回の保存が埋め込みを要求しなかったという理由で捨てるのは、渡されたデータの破壊にあたります
- **読み戻せない画像は致命的ではなく通知です。** CORS ヘッダのないクロスオリジンという、Canvas を汚染するのと同じ規則です。文書は URL 参照のまま書き出され、`export-failed` の通知が原因の URL を示します
- **埋め込むと、その画像については PNG 書き出しの汚染も解消します。** 戻ってくるのが data URI であり、同一オリジンなので Canvas を汚染しないためです

コピーも埋め込み済みの画像を持ち運ぶので、別のエディタへ貼っても絵が残ります。ただし**新規の符号化は行いません** — クリップボードへの書き込みのたびに全ビットマップを読み戻して待たせるべきではないためです。

## 未登録のシェイプ型

登録していない型を含む文書は、**破棄されず保持されます**。レコードは残り、描画も選択もされず、次の `toJSON()` でそのまま書き戻されます。

これがプラグインを安全に外せる理由です。代替案 — レコードを黙って捨てる — では、試しにプラグインを外しただけでその型の図形をすべて失います。

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'unknown-shape-type') console.warn(n.message)
  if (n.code === 'schema-migration-failed') console.error(n.message, n.detail)
})
```

移行が例外を投げた場合も同じ扱いで、失われるのではなく未描画のまま保持されます。

## 書き出し

```ts
const blob = await editor.export({
  format: 'png',        // 'png' | 'jpeg'
  scale: 2,             // 出力倍率
  quality: 0.92,        // JPEG のみ、0〜1
  background: '#fff',   // null で透過
  padding: 24,
  bounds: undefined,    // ワールド空間の範囲。既定は描画対象全体
})
```

`scale` は結果を引き伸ばすのではなく、描画そのものに掛かる倍率です。2倍の書き出しは2倍で描かれ、鮮明なままです。印刷や納品の用途では 2〜4 が普通に要求されます。

```ts
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = 'artboard.png'
link.click()
URL.revokeObjectURL(url)
```

書き出しは画面外で描画するため、表示中のビューポートは乱れません。またシェイプ util には `info.isExporting === true` が渡るので、動きのあるものは静止させられます。

## SVG で書き出す

```ts
const svg = editor.exportSvg({
  background: '#fff',   // null で透過
  padding: 24,
  scale: 1,             // width/height 属性を設定する。viewBox は変わらない
  bounds: undefined,    // ワールド空間の範囲。既定は描画対象全体
  embedImages: true,    // 画像を data URI として埋め込み、単体で完結させる
})
```

符号化するピクセルがないので、**同期的に文字列を返します。**

```ts
const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
```

出力はベクタなので、どんな大きさでも鮮明で、ドローソフトで開けます。したがって `scale` の意味は PNG とは異なり、幾何を変えずに**表示される大きさ**を決めます。

### シェイプはどうやって SVG になるか

描画先の Canvas がないため、「自分を描いてください」と頼むことができません。代わりに各シェイプが自分の幾何を提供します。レンダラやヒットテストと同じ登録制の上でです。

- **`ShapeUtil.getPath(shape)`** — 輪郭を SVG のパスデータで返す。塗り・線・影は書き出し側が適用します（グラデーション、破線、線の内側／外側揃えを含む）
- **`ShapeUtil.toSvg(shape, info)`** — 塗られた輪郭ではないシェイプ向けに、マークアップ自体を書く

**独自のシェイプも組み込みとまったく同じ条件で書き出されます。** どちらも実装していないシェイプは除外され、通知されます。

```ts
editor.subscribeNotifications((n) => {
  if (n.code === 'export-failed') console.warn(n.message, n.detail)
})
```

書き出し自体は成功します（1つ書き出せないシェイプのために文書全体を失うべきではないため）。ただし黙って済ませることもしません。

### PNG との違い

- **テキストはテキストのまま。** 本物の `<text>` 要素なので、選択も編集もできます。改行位置は Canvas と同じ計測結果からこちら側で決めますが、**行内のグリフの配置は開いたソフト側が行います。** フォントを持たない環境では字送りが変わります。アウトライン化すればこれは解決しますが、他のすべてを失ううえ、ブラウザが公開していないフォントデータが必要です
- **画像は既定で data URI として埋め込みます。** 読み戻せない画像（CORS ヘッダのないクロスオリジン。Canvas を汚染するのと同じ規則）は URL 参照に切り替え、通知します。PNG と違い、これで書き出しが失敗することはありません
- **合成モード**は Canvas と CSS で一致するもの（`multiply`、`screen`、`overlay` など）だけが残ります。`mix-blend-mode` に対応物のない合成操作は、近似せずに落とします

## CORS と Canvas の汚染

寛容な CORS ヘッダのないクロスオリジン画像を描画すると、ブラウザはその Canvas を**汚染済み**と見なします。ピクセルを読み戻せなくなる、つまり書き出しが失敗します。これは JavaScript から回避できないブラウザの規則です。

リモート画像を読み込んで書き出しも行うエディタは必ずこれに遭遇するため、失敗を不透明ではなく具体的にしています。

```ts
import { HcTaintedCanvasError } from '@headless-canvas/core'

try {
  await editor.export({ format: 'png' })
} catch (error) {
  if (error instanceof HcTaintedCanvasError) {
    console.error('書き出しを妨げた画像:', error.sources)
  }
}
```

`error.sources` が原因の URL を示します。対処可能なバグ報告と、文脈のない `SecurityError` の違いはここにあります。

回避方法:

- 画像を `Access-Control-Allow-Origin` 付きで配信する。`crossOrigin` は既定で `'anonymous'` なので、これだけで済みます
- 自分のオリジン経由でプロキシする
- data URL として保持する（クリップボード連携が貼り付け画像に対して行っていること）
- `crossOrigin: null` は**解決になりません**。画像を描画した時点で Canvas が汚染されます

## リソース

デコード済みの画像は状態木の外のキャッシュにあります。文書が持つのは URL と実寸だけです。読み込み完了はユーザー操作ではないため、履歴に触れずに再描画だけを起こします。

```ts
editor.resources.getImage(src)      // CanvasImageSource | null（読み込み中）
editor.resources.getStatus(src)     // 'idle' | 'loading' | 'loaded' | 'error'
```

失敗は例外ではなく `resource-load-failed` の通知として届きます。画像が1つ壊れているだけでエディタごと落ちるべきではありません。

フォントも同じモデルで、シェイプの `getResources()` から要求され、同じキャッシュを通ります。

```ts
await editor.resources.loadFont('Inter', 600, 'normal')
```

読み込みは `document.fonts.load` と `document.fonts.ready` を待ってから再描画します。代替フォントで計測してから本来のフォントで描き直すと、ユーザーの目の前でレイアウトがずれるためです。初回フレームが少し遅れるほうがましです。

## 外部からのパッチ適用

```ts
editor.applyPatch(patches, { addToHistory: false })
```

履歴が使うのと同じ `Patch` 表現です。共同編集のために存在しますが、共同編集自体は v1.0 では**実装していません**。それでもフックがあるのは、外部変更の経路を状態層に後付けするのは追加ではなく書き直しになるからです。

::: warning
v1.0 では、外部パッチを適用した状態での履歴の正しさを保証していません。
:::
