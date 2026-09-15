# 写真コラージュ

写真をドラッグ&ドロップしてください。1枚ずつ**白フチのプリント**（台紙・切り抜いた写真・キャプション）になって、少し傾いて落ちてきます。ダブルクリックで書き込めます。

<Demo id="polaroid" />

写真がブラウザの外に出ることはありません。オブジェクト URL として読み、ローカルで描画しているだけです。**このページの裏に送信先はありません。**

## 1ファイル、写真ごと

**「.hcanvas で保存」**は、**写真を含めたコラージュ全体**を1つのファイルに書き出します。そのまま人に渡せて、**「.hcanvas を開く」**で戻ります。

面白いのは写真の置き場所です。`embedImages` は各画像シェイプの `src` を data URI で**上書きしません。** バイト列は文書の**側表**に入り、シェイプは元から指していた URL を指したままです。

```ts
const doc = editor.toJSON({ savedAt: new Date().toISOString() }, { embedImages: true })
// doc.shapes[…].props.src  → "blob:…"                    その写真がどこから来たか
// doc.resources["blob:…"]  → "data:image/png;base64,…"   どう見えていたか
```

`src` を書き換えるほうが実装は単純で、**二重に間違っています。** URL を持つすべてのシェイプ型が「自分の URL はどこにあるか」を書き出し側に申告する必要が生じ — **それこそ登録制が避けるための型ごとの分岐です** — そして文書は**自分の写真の出所を失います。** 側表なら両方残ります。[ドキュメントと書き出し →](/ja/guide/documents)

読み込みはその逆で、`ResourceCache` が記録された URL と埋め込みコピーを対応づけます。シェイプ側は何が起きたかを知らないまま解決されます。

## プリントは3つのシェイプとグループ

台紙・写真・キャプションは別々のシェイプで、**まとめて動くようにグループ化**しています。

```ts
const group = editor.group([card, photo, text])
if (group !== null) editor.updateShape(group, { rotation })
```

傾きは**グループ化した「あと」**に、グループへ掛けています。先に各シェイプへ掛けると、**台紙はまっすぐなのに写真だけ斜め**になります。グループ化は子に変換を焼き込まないので、あとで解除しても3つは**見た目どおりの位置**に残ります。[コンセプト →](/ja/guide/concepts)

切り抜きは `object-fit: cover` を文書の中でやっているだけです。

```ts
function cover(natural: { width: number; height: number }) {
  const target = PHOTO_W / PHOTO_H
  const source = natural.width / natural.height
  if (source > target) {
    const width = target / source
    return { x: (1 - width) / 2, y: 0, width, height: 1 }   // 左右を詰める
  }
  const height = source / target
  return { x: 0, y: (1 - height) / 2, width: 1, height }    // 上下を詰める
}
```

`image` は切り抜きを**実寸に対する比率**で持つので、リサイズしても再読込しても保たれます。保存したコラージュは、**閉じたときの構図のまま**戻ってきます。

## ツールを書き直さずにキャプションを編集する

プリントをダブルクリックしたらキャプションを編集したい。**それ以外**（移動・リサイズ・回転・範囲選択）は既定のままで良い。ならば**置き換えではなく継承**して、1メソッドだけ変えます。

```ts
class CardTool extends SelectTool {
  override onDoubleClick(event: HcPointerEvent): void {
    const caption = captionOf(this.host, event.target)
    if (caption === null) return super.onDoubleClick(event)
    this.host.editing.begin(caption)
  }
}

editor.tools.register('select', (e) => new CardTool(e))
```

`editing.begin` が開くのは**コア側のセッション**で、開いている間に画面へ何を出すかは別の判断です。このページは `createTextEditor(editor)` を呼んで既定のダイアログを使っています。**文字の上に重ねたフィールドではなくダイアログ**なのは、Canvas の字送りとブラウザのテキストレイアウトが別実装で、キャレットがずれるからです。[テキスト編集 →](/ja/guide/text-editing)

## 書き出し

**「PNG保存」**は2倍・余白つきで描画します。台紙の影も、傾きも、切り抜いた写真も、そのまま出ます。**CSS ではなくシェイプだから**です。書き出し側は画面と同じシーンを描いています。

## ソース

最初に置いてある3枚の写真は**生成したもの**で、ストックフォトではありません（小さな格子に色を置いて拡大・ぼかしたもの）。ドキュメントサイトが権利を持たない写真を同梱すべきではないためです。

::: details アプリ本体
<<< @/.vitepress/apps/polaroid.ts
:::

[← サンプルアプリ一覧](./)
