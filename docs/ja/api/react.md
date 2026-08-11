# React バインディング

```sh
npm install @headless-canvas/core @headless-canvas/ui @headless-canvas/react
```

コアに対する薄いアダプタです。ここにあるものはすべて、vanilla のアプリケーションが呼ぶのと同じ API を適切なライフサイクルから呼んでいます。使い方は [React ガイド](/ja/guide/react)にあります。

## `<HcCanvas>`

```tsx
interface HcCanvasProps extends Omit<EditorOptions, 'container'> {
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
  onMount?: (editor: Editor) => void
}
```

`<div>` を描画し、その中に layout effect で `Editor` を構築してコンテキストで提供します。アンマウント時に破棄します。

レンダー中に構築されるものは何もないため、サーバー側でも安全です。マークアップはコンテナだけ、オーバーレイは空、ハイドレーションの不一致もありません。

エディタのオプションはマウント時に取り込まれます。後から `shapeUtils` や `messages` を変えても効果はありません。本当に変える必要があるなら再マウントしてください。

ラッパーは既定で `width: 100%; height: 100%` なので、親要素に大きさを与えてください。

## `<HcDefaultControls>`

```tsx
function HcDefaultControls(props?: { accessibleList?: boolean }): null
```

囲んでいるエディタに既定のコントロールを設置し、アンマウント時に除去します。自身は何も描画しません。コントロールはオーバーレイ内の命令的な DOM です。

## `<HcTextEditor>`

```tsx
function HcTextEditor(props?: { submitOnEnter?: boolean }): null
```

既定のテキスト編集ダイアログです。ダブルクリック・<kbd>Enter</kbd>・<kbd>F2</kbd> で開き、どのコントロールを載せているかとは独立しています。[テキストの編集](/ja/guide/text-editing)を参照してください。

## `useEditor()`

```tsx
function useEditor(): Editor
```

`<HcCanvas>` の外で呼ぶと throw します。

## `useValue()`

```tsx
function useValue<T>(selector: (snapshot: StoreSnapshot) => T): T
```

確定変更**と**一時変更の両方を購読するので、派生値が進行中のドラッグに追随します。

`useSyncExternalStore` の上に構築されており、これはスナップショットを同一性で比較します。呼ぶたびに新しいオブジェクトを返すセレクタは無限ループになります。そのため結果は、エディタの描画バージョン**とセレクタの同一性**でキャッシュされます。

```tsx
// ✓ 同一性が安定している
const count = useValue(useCallback((s) => s.shapes.size, []))

// ✗ レンダーごとに別の関数 — キャッシュが効かない
const count = useValue((s) => s.shapes.size)
```

## `useSelectedIds()`

```tsx
function useSelectedIds(): readonly ShapeId[]
```

## `useShape()`

```tsx
function useShape<K extends ShapeType = ShapeType>(id: ShapeId): ShapeRegistry[K] | undefined
```

解決済みです。一時状態が反映されるため、ドラッグに追随します。

## `useZoom()`

```tsx
function useZoom(): number
```

カメラの `z` です。オーバーレイ内のインラインスタイルを割るのに使います。[逆補正](/ja/guide/styling#逆補正)を参照してください。

## `useSelectionBox()`

```tsx
function useSelectionBox(): {
  descriptor: SelectionBoxDescriptor | null
  getHandleProps(handle: HandleDescriptor): {
    ref: (element: HTMLElement | null) => void
    'data-hc-handle': string
    style: React.CSSProperties
  }
}
```

Level 3 用です。何も選択されていなければ `descriptor` は `null` です。

`getHandleProps` はイベントハンドラではなく **ref** を返します。その ref が `controls.bindHandle` を呼ぶため、自作の React UI は既定 UI や vanilla の実装とまったく同じ実装を動かします。React の合成イベント型がコアの公開面に漏れることもありません。バインドは ref が外れたときとアンマウント時に解除されます。

返される `style` はハンドルを枠内に配置しカーソルを設定します。自分のスタイルはその後ろに展開してください。

```tsx
const { style, ...props } = getHandleProps(handle)
return <div key={handle.id} {...props} style={{ ...style, width: 14 / zoom }} />
```

コントロールは `createPortal` で `editor.overlayElement` に描画してください。これがビューポート変換を担う要素なので、ワールド座標の子は1フレームあたり1回の書き込みで図形に貼り付いたままになります。

## `useEditingSession()`

```tsx
function useEditingSession(): { id: ShapeId | null; initialText: string | null }
```

自作の編集 UI を作るためのものです。`commit` と `cancel` はこのフックではなく `editor.editing` から呼びます。自作の UI も既定のダイアログとまったく同じ方法でセッションを終えるためです。

購読先は store ではなく `editor.editing.subscribe` です。セッションは文書の変更ではないため、`editor.subscribe` は発火しません。

## 再エクスポート

```ts
export type { DefaultControlsOptions }
```

それ以外は `@headless-canvas/core` から直接 import します。
