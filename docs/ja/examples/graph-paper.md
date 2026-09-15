# 方眼紙作図

**「線を引く」**は格子の点から点へドラッグします。**「頂点を動かす」**は白い丸をドラッグすると、そこに集まっている線がすべて追従します。そのあと、元に戻すを1回押してみてください。

<Demo id="graph-paper" />

## 1操作 = 履歴1件

このアプリを置いた理由はここです。4本の線が集まる頂点をドラッグすると、4つのシェイプ（位置・サイズ・両端の比率）が書き換わります。それでも**取り消せる単位は1つ**でなければなりません。ユーザーがした動作は1つだからです。

この4つを `pointermove` のたびに書き込むのは、二重に間違っています。イミュータブルな文書を毎秒60回作り直すことになり、履歴も60件になります。**一時状態（ephemeral）はまさにこのためにあります。** 変更は毎フレーム書き換えてもコストのかからないオーバーレイのマップに入り、`commitEphemeral()` が最終状態だけを1件の履歴として文書に畳み込みます。

```ts
onPointerMove(event: HcPointerEvent): void {
  const changes = new Map<ShapeId, Partial<AnyShape>>()
  for (const segment of pending.incident) {
    const box = segmentBox(this.snap(event.world), segment.anchor)
    changes.set(segment.id, { x: box.x, y: box.y, width: box.width, height: box.height, props: … })
  }
  this.editor.setEphemeral(changes)      // 毎フレーム繰り返しても安い
}

onPointerUp(): void {
  if (pending.moved) this.editor.commitEphemeral()   // 何本集まっていても履歴1件
}
```

ヒットテスト・境界取得・描画はいずれも一時状態を**通して**読むので、ドラッグ中に値が食い違うことはありません。[コンセプト →](/ja/guide/concepts)

## 線が端点をどこに持っているか

`line` は `start` と `end` を座標ではなく**自分のボックスに対する比率**で持っています。これがあるおかげで、線の端点は通常のリサイズ機構だけで動き、どこにも特別扱いが要りません。そして線を1本置く作業は、「ボックスを求めて、その中のどこに両端が来るかを計算する」だけになります。

```ts
function segmentBox(from: Vec, to: Vec): SegmentBox {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  // 完全な水平・垂直の線は、そのままではサイズ 0 のボックスになってしまう。
  // 選択もリサイズもできなくなる。
  const width = Math.max(Math.abs(to.x - from.x), 1)
  const height = Math.max(Math.abs(to.y - from.y), 1)
  return {
    x, y, width, height,
    start: { x: (from.x - x) / width, y: (from.y - y) / height },
    end: { x: (to.x - x) / width, y: (to.y - y) / height },
  }
}
```

**文書には「頂点」という概念自体がありません。** 頂点とは2本の線がたまたま共有している座標にすぎず、アプリ側が端点を突き合わせて復元しています。これをライブラリに入れていないのは意図的です。シェイプどうしの結びつきはアプリケーションのモデルであって、キャンバスエンジンのモデルではありません。

## 格子を1要素で描く

方眼は、オーバーレイの中に置かれた `<div>` 1つです。オーバーレイにはビューポート変換がすでに掛かっているので、**方眼は絵と一緒にパン・ズームします。** 図形数に比例して増えるフレームごとの処理はありません（不変条件3）。

点の半径は `--hc-zoom` で割っています。リサイズハンドルのサイズと同じ理屈です。**絵は拡大されるが、紙の目盛りは拡大されない**からです。

```css
.hc-app-grid {
  background-image: radial-gradient(
    circle,
    var(--hc-app-grid-ink) calc(1px / var(--hc-zoom)),
    transparent 0
  );
}
```

1マスが画面上で5px を切ると、方眼は読めるより細かくなるので単に描きません。[装飾ガイド →](/ja/guide/styling)

## 頂点マーカーの個数を有界に保つ

既存の頂点を示す白い丸はアプリ側の DOM です。そして**文書のサイズに比例して増える DOM こそ、このライブラリが避けるために作られたもの**です。マーカーはプール化・上限つきで、`editor.getVisibleShapeIds()`（レンダラが使うカリング結果そのもの）からのみ作られます。したがって個数を決めるのは表示範囲であって、図面の規模ではありません。

```ts
for (const id of editor.getVisibleShapeIds()) {
  const shape = editor.getResolvedShape(id)
  if (shape?.type !== 'line') continue
  for (const point of endpoints(shape)) {
    if (points.size >= MAX_MARKERS) break
    points.set(key(point), point)
  }
}
```

描きながらステータス行のオーバーレイ DOM ノード数を見てみてください。[性能ガイド →](/ja/guide/performance)

## 3つのモード、3つのツール

線を引く・頂点を動かす・消すは、いずれも同じポインタイベントを取り合います。これを条件分岐で解決すると、誰も安全に変更できないコードになります。そこで**それぞれをツールにします。** アプリ定義のツールも、組み込みと同じ API で登録します。

```ts
editor.tools.register('draw-segment', (e) => new SegmentTool(e, settings, 'draw'))
editor.tools.register('move-vertex', (e) => new SegmentTool(e, settings, 'vertex'))
editor.tools.register('erase', (e) => new EraseTool(e))
editor.tools.setCurrent('draw-segment')
```

線を引くのと頂点を動かすのは実装を共有していますが、**モードは共有しません。** ここは重要です。このアプリの初期版は、押した位置で自動的に判断していました（既存の頂点の近くなら移動、そうでなければ描画）。説明としては通りますが、**実際には使えません。** 「既存の頂点の近く」は押下のほとんどです。線はそこから始まるからです。結果として判断がしばしば外れ、線を引きたいのに頂点が動きます。**ツールを分ければ、判断そのものが不要になります。**

選択ツールはそもそも置いていません。**自由なドラッグは方眼紙のための操作ではなく、**用意しても線を格子から外せるようになるだけです。

`settings` は参照で保持しているので、目盛りとインクの操作は**再登録せずに**動作中のツールへ反映されます。[ツールガイド →](/ja/guide/tools)

## ソース

::: details アプリ本体
<<< @/.vitepress/apps/graph-paper.ts
:::

[← サンプルアプリ一覧](./)
