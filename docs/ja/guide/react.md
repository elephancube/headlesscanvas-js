# React

`@headless-canvas/react` は薄いアダプタです。やっていることは、vanilla のアプリケーションが呼ぶのと同じコア API を適切なライフサイクルから呼ぶことだけで、React 専用の挙動はなく、React の外で使えない機能もありません。

```sh
npm install @headless-canvas/core @headless-canvas/ui @headless-canvas/react
```

## Level 1

```tsx
import { HcCanvas, HcDefaultControls, HcTextEditor } from '@headless-canvas/react'
import '@headless-canvas/ui/styles.css'

export function Editor() {
  return (
    <div style={{ height: 480 }}>
      <HcCanvas onMount={(editor) => seed(editor)}>
        <HcDefaultControls />
        <HcTextEditor />
      </HcCanvas>
    </div>
  )
}
```

`<HcCanvas>` はコンテナを描画し、layout effect の中でエディタを構築します。レンダー中に構築されるものは何もないため、サーバー側のバンドルでも安全です。サーバーが出すのはコンテナだけで、オーバーレイは空、解消すべきハイドレーションの不一致もありません。アンマウント時にエディタを破棄します。

props は `EditorOptions` から `container` を除いたものに、`className` / `style` / `children` / `onMount` を加えたものです。

## 状態を読む

```tsx
import { useEditor, useSelectedIds, useShape, useValue, useZoom } from '@headless-canvas/react'

function Inspector() {
  const editor = useEditor()
  const selected = useSelectedIds()
  const shape = useShape(selected[0])
  const zoom = useZoom()

  const count = useValue(useCallback((snapshot) => snapshot.shapes.size, []))

  return <p>{count} 個 / {selected.length} 個選択 / {Math.round(zoom * 100)}%</p>
}
```

これらは `useSyncExternalStore` の上に構築されているので、Concurrent Rendering と `StrictMode` に正しく対応しています。`useValue` は確定変更と一時変更の両方を購読するため、ドラッグ中もインスペクタが追随します。

::: tip セレクタはメモ化してください
`useValue` はエディタの描画バージョン**とセレクタの同一性**でキャッシュします。インラインのアロー関数はレンダーごとに別物になり、キャッシュが効きません。`useCallback` で包むか、コンポーネントの外に出してください。
:::

`useEditor()` は `<HcCanvas>` の内側で呼ぶ必要があります。外側では throw します。null を返して後で失敗するより有用だからです。

## 状態を書く

エディタは React ストアではありません。メソッドを直接呼びます。

```tsx
function Toolbar() {
  const editor = useEditor()
  return (
    <>
      <button onClick={() => editor.createShape({ type: 'rect', x: 0, y: 0, width: 100, height: 60 })}>
        長方形
      </button>
      <button onClick={() => editor.history.undo()}>元に戻す</button>
    </>
  )
}
```

複数段階の変更は、他の環境と同じくトランザクションに入れます。

```tsx
editor.transact(() => {
  for (const item of items) editor.createShape(toShape(item))
})
```

## Level 3

```tsx
import { useSelectionBox, useZoom } from '@headless-canvas/react'
import { createPortal } from 'react-dom'

function CustomControls() {
  const editor = useEditor()
  const { descriptor, getHandleProps } = useSelectionBox()
  const zoom = useZoom()
  if (!descriptor) return null

  const { bounds } = descriptor
  return createPortal(
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: bounds.width,
        height: bounds.height,
        transform: `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`,
        border: `${2 / zoom}px dashed #7c3aed`,
        boxSizing: 'border-box',
      }}
    >
      {descriptor.handles.map((handle) => {
        const { style, ...props } = getHandleProps(handle)
        return (
          <div
            key={handle.id}
            {...props}
            style={{ ...style, width: 14 / zoom, height: 14 / zoom, background: '#fff' }}
          />
        )
      })}
    </div>,
    editor.overlayElement,
  )
}
```

ここで効いている点が2つあります。

**ポータルの出力先は `editor.overlayElement` です。** これがビューポート変換を担う要素なので、ワールド座標に置かれた子は1フレームあたり1回の書き込みで図形に貼り付いたままになります。それ以外の場所に描くと、カメラが動くたびに自分でスクリーン座標を計算し直すことになります。

**`getHandleProps` はイベントハンドラではなく `ref` を返します。** その ref が `controls.bindHandle` を呼びます。vanilla の実装が使うのと同じプリミティブなので、ポインタ・キーボード・ARIA のロジックは React 版と DOM 版が乖離することなく1つだけ存在します。React の合成イベント型がコアの公開面に漏れないという利点もあります。

```ts
getHandleProps(handle) // { ref, 'data-hc-handle', style }
```

上のスタイルで `zoom` による除算をしている点に注意してください。[逆補正の規則](/ja/guide/styling#逆補正)はインラインスタイルにもそのまま適用されます。`useZoom()` はその値を得るためのものです。

## カスタムシェイプ

エディタを構築する場所で登録します。

```tsx
<HcCanvas shapeUtils={[...defaultShapeUtils, starShapeUtil]} />
```

`shapeUtils` はマウント時に取り込まれます。後から変更しても再登録はされないため、集合そのものを変える必要があるならコンポーネントを再マウントしてください。

## サーバーサイドレンダリング

`@headless-canvas/core` は import 時にブラウザ API へ触れないためサーバー側のバンドルでも安全で、`<HcCanvas>` はレンダー中に何も構築しません。スタイルシートは実行時注入ではなく静的な import なので、ハイドレーション中にスタイルの当たっていないコントロールが見えることもありません。

```tsx
import '@headless-canvas/ui/styles.css'
```

Next.js ではクライアントコンポーネントに置いてください。エディタが動作するには DOM が必要です。

## API 一覧

| エクスポート | 用途 |
|---|---|
| `<HcCanvas>` | エディタを設置し、コンテキストで提供する |
| `<HcDefaultControls>` | 既定のコントロール |
| `<HcTextEditor>` | 既定のテキスト編集ダイアログ |
| `useEditor()` | インスタンス |
| `useValue(selector)` | 任意の派生値を購読 |
| `useSelectedIds()` | 現在の選択 |
| `useShape(id)` | 図形1つ（一時状態を反映） |
| `useZoom()` | カメラのズーム |
| `useSelectionBox()` | Level 3。記述子と `getHandleProps` |
| `useEditingSession()` | 開いている編集セッション。自作 UI 用 |

完全なシグネチャは [React API リファレンス](/ja/api/react)にあります。
