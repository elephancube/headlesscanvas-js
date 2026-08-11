# ツール

選択・移動・リサイズ・回転・範囲選択・描画は、どれも同じポインタイベントを取り合います。これを条件分岐で捌くと、片方の操作を直すともう片方が壊れる類のコードになります。ツールはその代替です。ある時点で入力を所有するのは1つのオブジェクトであり、各モードは分離できます。

<Demo id="custom-tool" title="このページのために書いた矩形ツール" />

## ツールの切り替え

```ts
editor.tools.setCurrent('hand')
editor.tools.current      // 'hand'
editor.tools.state        // 'idle' | 'pointing' | 'dragging' | 'brushing' | ...
                          // 'resizing' | 'rotating' | 'panning' | 'editing'
editor.tools.cancel()     // 進行中の処理を中断
```

同梱は `select` / `hand` / `draw` の3つで、それぞれ <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> に割り当ててあります。いずれも自作ツールと同じ公開 API で登録されており、組み込みであることによる特権はありません。

現在のツール ID はコンテナの `data-hc-tool` に、状態は `data-hc-state` に現れるので、カーソルなどの表現は純粋な CSS で書けます。

```css
.hc-container[data-hc-tool='hand'] { cursor: grab; }
.hc-container[data-hc-state='panning'] { cursor: grabbing; }
```

## フリーハンドで描く

<Demo id="drawing" title="同梱の描画ツール" />

```ts
editor.tools.setCurrent('draw')
```

**ストロークはただの `path` シェイプです。** 設計の要点はそこに尽きます。選択・リサイズ・シリアライズ・移行・ベクタ書き出しがそのまま効くのは、パスがすでに全部できるからで、描画ツールはそのどれも実装していません。

描き方を変えるには、自分のオプションで**登録し直します**。登録は ID 単位なので2回目が1回目を置き換えます。**すでにアクティブなインスタンスも差し替わる**ので、カラーピッカーの変更はツールを切り替え直さなくても次のストロークに反映されます。

```ts
import { DrawTool } from '@headless-canvas/core'

editor.tools.register('draw', (editor) => new DrawTool(editor, {
  color: '#2563eb',
  width: 6,
  tolerance: 1,      // 間引きの許容誤差。スクリーン px
  smoothing: 1,      // 0 で直線。1.5 を超えると曲線が点を追い越し始める
  minDistance: 2,    // これ（スクリーン px）より近いサンプルは受け取った時点で捨てる
}))
```

### 点に何が起きるか

ポインタは数ミリ秒ごとにサンプルを報告するので、2秒のストロークは数百点として届きます。**見た目は数十点のときと変わりません。** それを全部残すと、文書・全ヒットテスト・全書き出しに永久にコストがかかります。そこで指を離した時点でフィッティングします。

1. **間引き** — Ramer–Douglas–Peucker。ある点は、それを捨てると線が `tolerance` より大きく動く場合にだけ残ります
2. **平滑化** — Catmull-Rom スプラインを三次ベジェへ厳密変換。**Catmull-Rom は与えた点を必ず通ります。** 描いた線に必要なのはこの性質で、近似スプラインだと実際に描いた角が丸められてしまいます

どちらも指を離したときに1回だけ走ります。毎フレーム全体を当て直すと長いストロークが二乗になるためで、ポインタを押している間に見えているのは一時状態にある素のポリラインです。**サンプル数がいくつでも、1ストローク = 履歴1件**です。

**点はツール由来である必要はありません。** 署名パッド、自前でポーリングしたペンデバイス、記録した入力の再生 — どれも同じ座標列を生み、`strokeFromPoints` がそれをツールと同じシェイプに変換します。

```ts
import { strokeFromPoints } from '@headless-canvas/core'

editor.createShape({ type: 'path', ...strokeFromPoints(points, { color: '#e11d48', width: 5 }) })
```

2つの処理は `simplifyPolyline` / `polylineToPath` として個別にも公開しています。

### 意図的にやらないこと

**ストロークの太さは一定です。** 筆圧で太さを変えるのは「線を引く」処理ではなく「輪郭を塗る」処理で、専用のシェイプ型と、そのヒットテストと書き出しが必要になります。これは v1.x の課題です。ペンと指を区別したい場合、`pointerType` はすべてのイベントに入っています。

## 登録する

```ts
editor.tools.register('draw-rect', (editor) => new DrawRectTool(editor))
editor.tools.setCurrent('draw-rect')
```

インスタンスではなく factory です。有効化のたびに新しいツールが作られるため、中途半端な操作状態がツールの切り替えをまたいで生き残ることはありません。

## インターフェース

`id` 以外はすべて省略可能です。

```ts
interface Tool {
  readonly id: string

  onEnter?(): void
  onExit?(): void

  onPointerDown?(event: HcPointerEvent): void
  onPointerMove?(event: HcPointerEvent): void
  onPointerUp?(event: HcPointerEvent): void
  onDoubleClick?(event: HcPointerEvent): void

  onKeyDown?(event: KeyboardEvent): boolean | void
  onKeyUp?(event: KeyboardEvent): boolean | void
  onWheel?(event: WheelEvent): boolean | void

  onCancel?(): void

  onHandlePointerDown?(handle: HandleId, event: HcPointerEvent): void
  onHandleNudge?(handle: HandleId, delta: Vec): void

  getBrush?(): Bounds | null
}
```

ポインタイベントは変換済みで届きます。

```ts
interface HcPointerEvent {
  screen: Vec              // コンテナ基準
  world: Vec
  shiftKey, altKey, ctrlKey, metaKey: boolean
  button: number
  pointerType: string
  target: ShapeId | null   // ポインタ直下の最前面の図形
  original: PointerEvent | MouseEvent   // a MouseEvent for onDoubleClick
}
```

## 書いてみる

```ts
import type { Editor, HcPointerEvent, ShapeId, Tool, Vec } from '@headless-canvas/core'

class DrawRectTool implements Tool {
  readonly id = 'draw-rect'

  private origin: Vec | null = null
  private drawing: ShapeId | null = null

  constructor(private readonly editor: Editor) {}

  onPointerDown(event: HcPointerEvent): void {
    this.origin = event.world
    this.editor.tools.setState('dragging')
    this.drawing = this.editor.createShape({
      type: 'rect',
      x: event.world.x,
      y: event.world.y,
      width: 1,
      height: 1,
    })
  }

  onPointerMove(event: HcPointerEvent): void {
    if (!this.origin || !this.drawing) return
    // 一時状態。履歴に載らず、イミュータブル木も作り直さない。毎フレーム1回。
    this.editor.setEphemeral(
      new Map([[this.drawing, {
        x: Math.min(this.origin.x, event.world.x),
        y: Math.min(this.origin.y, event.world.y),
        width: Math.max(1, Math.abs(event.world.x - this.origin.x)),
        height: Math.max(1, Math.abs(event.world.y - this.origin.y)),
      }]]),
    )
  }

  onPointerUp(): void {
    if (!this.drawing) return
    this.editor.commitEphemeral()
    this.editor.selection.set([this.drawing])
    this.reset()
  }

  onCancel(): void {
    this.editor.clearEphemeral()
    if (this.drawing) this.editor.deleteShapes([this.drawing])
    this.reset()
  }

  private reset(): void {
    this.origin = null
    this.drawing = null
    this.editor.tools.setState('idle')
  }
}
```

行儀のよいツールとそうでないツールを分ける規則が3つあります。

**ドラッグ中は一時状態に書き、離したときに1回コミットする。** 確定状態を毎フレーム書くと Undo スタックが数百件で埋まり、イミュータブル木を毎秒60回作り直すことになります。[一時状態](/ja/guide/concepts#一時状態ephemeral-state)を参照してください。

**`onCancel` は何も残してはいけない。** <kbd>Escape</kbd>、フォーカスの喪失、ポインタのキャンセルで呼ばれます。作りかけの図形も状態も片付ける必要があります。

**モードが変わったら `tools.setState()` を呼ぶ。** これが `data-hc-state` を駆動し、スタイルシートが JavaScript なしにツールの状況へ反応できるようになります。

## エディタが自分で処理するもの

一部の挙動はエディタのレベルにあります。どのツールでも効くべきものであり、各ツールに同じコードを書かせないためです。

| 挙動 | ツールの仕事でない理由 |
|---|---|
| 中ボタン・右ボタンのパン | どんな Canvas アプリでもどのモードでも同じ。ツールにこれらのボタンは渡らない |
| <kbd>⌘Z</kbd> / <kbd>Ctrl+Y</kbd> | Undo はどこでも効くべきで、ツールが上書きしてよいものではない |
| <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> のツール切替 | そうでないと自作ツールの中でショートカットが効かなくなる |
| <kbd>Escape</kbd> | `onCancel` へ回送される |
| ホイールのパン、<kbd>Ctrl</kbd> + ホイールのズーム | ツールがイベントを消費しなかった場合にのみ実行 |

`onKeyDown` / `onKeyUp` / `onWheel` から `true` を返すとイベントは**消費**扱いとなり、エディタの既定処理は走りません。何も返さなければ通過します。

```ts
onKeyDown(event: KeyboardEvent): boolean | void {
  if (event.key !== 'Enter') return       // エディタに任せる
  this.commit()
  return true                             // 消費した
}
```

これらはすべて `window` ではなく**コンテナ**に登録されています。フォーカスのないエディタはキーを消費しません。1ページに複数のエディタ、あるいはテキスト入力の隣にエディタを置いても破綻しない理由です。

## ハンドルの操作

ハンドルを押してもツールは迂回されません。`onHandlePointerDown` として届き、キーボード相当は `onHandleNudge` です。実装しないツールではハンドルが単に何もしませんが、たとえば描画ツールにとってはそれが正しい挙動です。

```ts
onHandlePointerDown(handle: HandleId, event: HcPointerEvent): void {
  // 独自のリサイズ・回転を開始する
}
```

## 図形に「入る」

`onDoubleClick` は慣習的に「この図形に入る」操作です。選択ツールの答えはテキスト編集セッションを開くことですが、フックの側は何も規定していません。自作のツールでは「入る」が意味するものを自由に定義できます。

```ts
onDoubleClick(event: HcPointerEvent): void {
  if (event.target) this.editor.editing.begin(event.target)
}
```

`editing` 状態はツールではなくエディタが設定するため、どのツールが有効でも `data-hc-state='editing'` は利用できます。[テキストの編集](/ja/guide/text-editing)を参照してください。

## 範囲選択の矩形

選択矩形を描くツールでは、`getBrush()` からワールド座標で公開してください。描画はコントロール層の担当です。`editor.getBrush()` が現在のツールへ委譲し、既定 UI がそれをもとに `.hc-brush` を描きます。
