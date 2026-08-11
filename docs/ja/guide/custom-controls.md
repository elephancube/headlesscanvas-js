# コントロールを自作する

Level 3。既定 UI を使わず、マークアップを自分で書きます。書かなくてよいのは**操作ロジック**です。ポインタキャプチャ・キーボード操作・ARIA 属性はコアから供給されるため、自作のコントロールも既定のものとまったく同じように振る舞います。

<Demo id="custom-controls" title="フレームワークなしの自作コントロール" />

## 2つのプリミティブ

```ts
editor.controls.getSelectionBox(): SelectionBoxDescriptor | null
editor.controls.bindHandle(element: HTMLElement, handle: HandleId): () => void
```

`getSelectionBox()` は「いま何を描くべきか」を返します。`bindHandle()` は手元の要素をハンドルとして機能させ、解除用の関数を返します。

どちらも DOM を生成しません。そこが要点です。**何を**はライブラリが決め、**どう見えるか**はあなたが決めます。

```ts
interface SelectionBoxDescriptor {
  bounds: OrientedBounds      // ワールド空間。単一選択では回転を持つ
  isSingle: boolean
  hasLocked: boolean
  handles: readonly HandleDescriptor[]
}

interface HandleDescriptor {
  id: HandleId                // 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'
  position: Vec               // 枠内の 0..1。パーセント指定にそのまま使える
  cursor: string
  label: string               // メッセージ表を通して解決済み
}
```

何も選択されていないときは `null` を返します。そのとき一切のコントロール DOM が存在しない理由でもあります。

## 完全な実装例

```ts
import type { Editor, HandleId } from '@headless-canvas/core'

export function createControls(editor: Editor): { dispose(): void } {
  const doc = editor.overlayElement.ownerDocument

  const box = doc.createElement('div')
  box.className = 'my-selection'
  box.hidden = true
  editor.overlayElement.append(box)

  const handles = new Map<HandleId, HTMLElement>()
  const unbind: Array<() => void> = []

  const stop = editor.onFrame(() => {
    const descriptor = editor.controls.getSelectionBox()
    if (!descriptor) {
      box.hidden = true
      return
    }

    const { bounds } = descriptor
    box.hidden = false
    box.style.width = `${bounds.width}px`
    box.style.height = `${bounds.height}px`
    // ワールド位置へ translate してから、枠自身の中心で rotate する
    box.style.transform =
      `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`

    const wanted = new Set(descriptor.handles.map((h) => h.id))
    for (const handle of descriptor.handles) {
      let element = handles.get(handle.id)
      if (!element) {
        element = doc.createElement('button')
        element.className = 'my-handle'
        element.style.cursor = handle.cursor
        unbind.push(editor.controls.bindHandle(element, handle.id))
        handles.set(handle.id, element)
        box.append(element)
      }
      element.hidden = false
      element.style.left = `${handle.position.x * 100}%`
      element.style.top = `${handle.position.y * 100}%`
    }
    for (const [id, element] of handles) {
      if (!wanted.has(id)) element.hidden = true
    }
  })

  return {
    dispose() {
      stop()
      for (const off of unbind) off()
      box.remove()
      handles.clear()
    },
  }
}
```

このコードで押さえるべき点が4つあります。

**要素は `editor.overlayElement` の中に入れ、ワールド座標で配置します。** オーバーレイがビューポート変換を担うため、スクリーン座標への変換は不要ですし、カメラが動いてもこれらの要素に触れる必要はありません。

**ハンドルは一度作って使い回します。** 毎フレーム作り直すと DOM が無駄に入れ替わり、操作の途中でフォーカスが失われます。不要なものは削除ではなく非表示にしてください。

**描画フックは `onFrame` です。** エディタが描画するとき — 確定変更・一時変更・カメラ移動 — にだけ走ります。何も起きていないエディタは1フレームも描きません。

**`dispose` ですべて元に戻します。** `bindHandle` はそれぞれ解除関数を返すので、保持しておいてください。

## `bindHandle` が与えてくれるもの

```ts
const unbind = editor.controls.bindHandle(element, 'se')
```

- `pointerdown` でリサイズ／回転を開始。ポインタキャプチャつき。イベントが Canvas 面へ伝わるのも止める
- 矢印キーでのキーボード操作。1単位、<kbd>⇧</kbd> で10単位
- `role="button"`、メッセージ表からの `aria-label`、`tabindex` がなければ `"0"`
- 要素への `pointer-events: auto` と `touch-action: none`

最後の項目は重要です。オーバーレイは既定で `pointer-events: none` で、ハンドルだけが個別に受け取りを再開します。これによりブラウザ側が所有権を決めてくれます。ハンドルの上ならハンドル、それ以外なら Canvas。JavaScript で調停する必要がありません。

ハンドルは実在の要素なので、何にでもできます。ラベル付きの `<button>`、アイコン、独自の形。特別な理由がなければ `<button>` を使ってください。キーボードフォーカスと正しいロールが無料で付いてきます。

## 逆補正はあなたの仕事になります

[逆補正](/ja/guide/styling#逆補正)の内容がそのまま適用されます。オーバーレイ内の長さはフォントサイズを含め、すべて `--hc-zoom` で割ってください。

```css
.my-handle {
  position: absolute;
  width: calc(14px / var(--hc-zoom));
  height: calc(14px / var(--hc-zoom));
  margin-left: calc(-7px / var(--hc-zoom));
  margin-top: calc(-7px / var(--hc-zoom));
  border: calc(2px / var(--hc-zoom)) solid #7c3aed;
}

.my-selection-label {
  font-size: calc(11px / var(--hc-zoom));
}
```

## Level 3 でしかできないこと

代表例は、選択に追随するフローティングツールバーです。これが可能なのはコントロールが DOM だからで、Canvas はボタンを保持できません。

```ts
const toolbar = doc.createElement('div')
toolbar.style.pointerEvents = 'auto'
// 押下が下の図形のドラッグを開始しないよう止める
toolbar.addEventListener('pointerdown', (event) => event.stopPropagation())
box.append(toolbar)
```

`inset-block-start: 100%` などで枠に対して配置し、逆補正を忘れないでください。

ほかにも、寸法の表示、ハンドルごとのラベル、独自デザインのスナップ表示、特定のシェイプ型にだけ現れるハンドル、見た目より広い当たり判定などが可能になります。

## オーバーレイのその他の内容

既定 UI は範囲選択の矩形と整列ガイドも描いています。置き換えるならこれらもあなたの担当です。

```ts
editor.getBrush()       // Bounds | null — 範囲選択の矩形（ワールド空間）
editor.getSnapGuides()  // readonly SnapGuide[] — 現在有効なガイド
```

## React では

同じプリミティブをフックで包んであります。[React](/ja/guide/react#level-3) を参照してください。

```tsx
const { descriptor, getHandleProps } = useSelectionBox()
```

操作ロジックの実装は1つで、既定 UI も React バインディングもこのページのコードもそれを動かしています。このロジックが `ui` ではなく `core` にある理由がそれです。
