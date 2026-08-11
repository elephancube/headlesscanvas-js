# Editor

```ts
import { Editor } from '@headless-canvas/core'

const editor = new Editor({ container })
```

エディタは図形用の Canvas とコントロール用の DOM オーバーレイを所有し、両者を同期させます。モジュールレベルの状態は一切持たないため、1ページに複数のエディタが共存できます。

## 構築

```ts
interface EditorOptions {
  container: HTMLElement                   // この中に Canvas とオーバーレイを構築する
  shapeUtils?: readonly ShapeUtil<any>[]   // 既定の集合を置き換える
  initialDocument?: HcDocument
  messages?: Partial<Messages>
  zoomRange?: readonly [number, number]    // 既定 [0.02, 64]
  hitTolerance?: number                    // クリック許容誤差（スクリーン px）。既定 5
  history?: HistoryOptions
  snapping?: Partial<SnapSettings>
}
```

コンテナには、`position` が `static` なら `relative` が、さらに `overflow: hidden` / `touch-action: none` / `tabindex="0"`（未設定時）/ `role="application"` / `hc-container` クラスが設定されます。コンテナ自身に大きさが必要です。エディタはそれを監視して Canvas の寸法を合わせます。

## 要素

```ts
editor.container       // HTMLElement — 渡したもの
editor.canvasElement   // HTMLCanvasElement — aria-hidden
editor.overlayElement  // HTMLElement — ビューポート変換を担う
```

自作のコントロール DOM は `overlayElement` の中に、**ワールド座標で**配置してください。カメラ変換が書き込まれる唯一の要素であり、コントロールが何個あってもパンのコストが変わらない理由です。

## サブオブジェクト

```ts
editor.registry     // ShapeUtilRegistry
editor.controls     // Controls — /ja/api/controls を参照
editor.resources    // ResourceCache
editor.history      // History
editor.selection    // 選択 API（後述）
editor.viewport     // カメラ API（後述）
editor.tools        // ツールレジストリ（後述）
```

## ライフサイクル

### `dispose()`

描画ループを止め、ResizeObserver を切断し、キャッシュしたリソースを解放し、生成した要素を除去します。以降のメソッド呼び出しは throw します。SPA では必須です。

## 状態

### `getSnapshot(): StoreSnapshot`

```ts
interface StoreSnapshot {
  readonly version: number
  readonly shapes: ReadonlyMap<ShapeId, AnyShape>
  readonly rootChildren: readonly ShapeId[]   // 描画順
  readonly paintOrder: readonly ShapeId[]     // 全図形、深さ優先
  readonly selectedIds: readonly ShapeId[]
}
```

イミュータブル（構造共有）。トランザクション内部の中間状態を見せることはありません。

### `getRenderVersion(): number`

確定変更・一時変更・カメラを含むキャッシュキーです。比較することで、何も動いていないときの処理を省けます。

### `subscribe(listener): () => void`

確定状態が変わったとき。トランザクションの内側から呼ばれることはありません。

### `subscribeEphemeral(listener): () => void`

進行中の操作が変わったとき。

### `subscribeNotifications(listener: (n: Notification) => void): () => void`

回復可能な問題:

```ts
interface Notification {
  level: 'warning' | 'error'
  code: 'resource-load-failed' | 'unknown-shape-type' | 'export-failed' | 'schema-migration-failed'
  message: string
  detail?: unknown
}
```

### `transact<T>(fn: () => T, options?: TransactOptions): T`

1ユーザー操作 = 1コミット。購読者への通知1回、履歴1件。内部での読み取りは、同じトランザクション内で先に書いた値を返します。

```ts
interface TransactOptions {
  addToHistory?: boolean   // ユーザーが行ったのでない変更は false
  mergeKey?: string        // 同じキーの連続トランザクションは1件にまとまる
}
```

### `notify(notification: Notification): void`

通知チャネルへ自分で流します。カスタムシェイプやツールから有用です。

## シェイプ

### `createShape<K>(input: CreateShapeInput<K>): ShapeId`

```ts
type CreateShapeInput<K> = Partial<Omit<ShapeRegistry[K], 'id' | 'type' | 'props' | 'index'>> & {
  type: K
  props?: Partial<ShapeRegistry[K]['props']>
}
```

省略した項目は種別の既定値から埋まります。`props` は既定値とマージされます。

### `getShape<K>(id): ShapeRegistry[K] | undefined`

**確定**レコード。同じトランザクション内で先に書いた値を読み返せます。

### `getResolvedShape(id): AnyShape | undefined`

一時状態を反映した図形 — いま画面に見えているものです。

### `updateShape(id, changes: Partial<AnyShape>): void`

`props` を渡すと丸ごと置き換わります。1項目だけ変えるなら既存の値を展開してください。

### `deleteShapes(ids: readonly ShapeId[]): void`

子孫も一緒に削除されます。

### `applyPatch(patches: readonly Patch[], options?: TransactOptions): void`

外部からの変更を適用します。履歴が使うのと同じ表現です。

::: warning
v1.0 では、外部パッチを適用した状態での履歴の正しさを保証していません。
:::

## 一時状態

```ts
setEphemeral(changes: ReadonlyMap<ShapeId, Partial<AnyShape>>): void
commitEphemeral(options?: TransactOptions): void
clearEphemeral(): void
```

ドラッグ中はこちらに書き、最後に1回コミットします。[一時状態](/ja/guide/concepts#一時状態ephemeral-state)を参照してください。

## 階層と順序

```ts
getChildren(parentId: ShapeId | null): ShapeId[]     // 描画順
getAncestors(id: ShapeId): ShapeId[]                 // 近い順

setParent(ids, parentId: ShapeId | null, at?: ZIndexAnchor): void  // 見た目は保たれる
moveTo(ids, anchor: ZIndexAnchor): void
reorder(ids, to: 'front' | 'back' | 'forward' | 'backward'): void

group(ids): ShapeId | null       // 新しいグループ。2個未満なら null
ungroup(groupId): ShapeId[]      // 解放された子
```

```ts
type ZIndexAnchor =
  | { before: ShapeId }
  | { after: ShapeId }
  | { position: 'first' | 'last' }
```

グループ化も解除も、子に変換を焼き込みません。

## 幾何

```ts
getWorldTransform(id): Matrix | null
getShapeBounds(id, space?: 'world' | 'screen'): OrientedBounds | null
hitTest(screenPoint: Vec): ShapeId | null      // 最前面。最外のグループを返す
hitTestArea(screenBounds: Bounds): ShapeId[]   // ロックされた図形は除外
getVisibleShapeIds(): ShapeId[]
```

`hitTest` はグループの子に当たった場合、それを含む最外のグループを返します。グループ化されたオブジェクトに対してユーザーが期待する挙動です。

## 選択

```ts
editor.selection.ids                  // readonly ShapeId[]
editor.selection.set(ids)
editor.selection.add(ids)
editor.selection.remove(ids)
editor.selection.clear()
editor.selection.selectAll()
editor.selection.getBounds()          // OrientedBounds | null
```

単一選択では図形の回転した枠を、複数選択では軸並行の枠を返します。

## ビューポート

```ts
editor.viewport.camera                             // { x, y, z }
editor.viewport.setCamera(next: Partial<Camera>)
editor.viewport.panBy(delta: Vec)                  // スクリーンピクセル
editor.viewport.zoomTo(z, centerInScreen?: Vec)    // その点を固定してズーム
editor.viewport.zoomToFit(ids?, padding = 40)
editor.viewport.screenToWorld(p: Vec): Vec
editor.viewport.worldToScreen(p: Vec): Vec
editor.viewport.getVisibleBounds(): Bounds
```

ズームは `zoomRange` にクランプされます。ビューポートは履歴の対象外です。

## ツール

```ts
editor.tools.register(id: string, factory: (editor: Editor) => Tool): void
editor.tools.setCurrent(id: string): void      // 未登録の ID では throw
editor.tools.current                           // string
editor.tools.instance                          // Tool | null
editor.tools.state                             // ToolState
editor.tools.setState(state: ToolState): void  // data-hc-state を駆動
editor.tools.cancel(): void

editor.getBrush(): Bounds | null               // 現在のツールから
editor.interactionState                        // tools.state の別名
```

既定で `select` / `hand` / `draw` が登録済みで、割り当ては <kbd>v</kbd> / <kbd>h</kbd> / <kbd>d</kbd> です。既存の ID を登録すると置き換わります。**そのツールがアクティブなら生きているインスタンスも差し替わり**、これがツールを再設定する方法になります。

```ts
import { DrawTool } from '@headless-canvas/core'
editor.tools.register('draw', (e) => new DrawTool(e, { color: '#f00', width: 8 }))
```

`DrawToolOptions` とストロークのフィッティングについては[ツール](/ja/guide/tools#フリーハンドで描く)を参照してください。

## テキスト編集

```ts
editor.editing.id                          // ShapeId | null
editor.editing.initialText                 // string | null
editor.editing.canEdit(id): boolean        // ロック済み・テキストなしでは false
editor.editing.begin(id): boolean
editor.editing.commit(text: string): void  // 履歴1件。無変更なら何もしない
editor.editing.cancel(): void
editor.editing.subscribe(fn): () => void
```

`ShapeUtil` が `getText` と `setText` の両方を実装しているとき、その図形は編集可能です。`begin` は図形を選択し、`data-hc-state` を `editing` にします。

`subscribe` が別チャネルなのは、セッションが文書の変更ではないためです。store は動かないので `editor.subscribe` は発火しません。[テキストの編集](/ja/guide/text-editing)を参照してください。

## スナップ

```ts
editor.snapping                                  // Readonly<SnapSettings>
editor.setSnapping(settings: Partial<SnapSettings>): void
editor.getSnapGuides(): readonly SnapGuide[]
editor.computeSnap(proposed: Bounds, exclude: ReadonlySet<ShapeId>): SnapResult
editor.clearSnapGuides(): void
```

## 入力の補助

```ts
editor.beginHandleInteraction(handle: HandleId, event: PointerEvent): void
editor.nudgeHandle(handle: HandleId, delta: Vec): void
editor.nudgeSelection(delta: Vec): void
```

最初の2つは `bindHandle` が呼びます。手作業でハンドルを束ねる場合にのみ直接使ってください。

## ドキュメントと書き出し

```ts
editor.toJSON(meta?: Record<string, unknown>, options?: SerializeOptions): HcDocument
editor.loadDocument(document: HcDocument): void      // 履歴をクリアする
editor.getSelectionAsDocument(): HcDocument
editor.insertDocument(document: HcDocument, at?: Vec): ShapeId[]

editor.export(options?: ExportOptions): Promise<Blob>       // png, jpeg
editor.exportSvg(options?: SvgExportOptions): string        // 同期。符号化するピクセルがない
```

クロスオリジン画像が Canvas を汚染している場合、`export` は `HcTaintedCanvasError` で reject し、エラーが原因の URL を示します。

`exportSvg` は各シェイプの `getPath` または `toSvg` から文書を組み立てます。どちらも実装していないシェイプは除外され、`export-failed` として通知されます。書き出す対象がない場合はどちらも throw します。

`toJSON` の `{ embedImages: true }` は参照している画像を `HcDocument.resources` に埋め込み、文書を単体で完結させます。**シェイプ側は書き換えず**、どの URL から来た画像かを保持し続けます。読み込んだ文書がすでに持っていた画像は、この保存が埋め込みを要求したかどうかに関係なく書き戻します。[ドキュメントと書き出し](/ja/guide/documents)を参照してください。

## 描画

```ts
editor.onFrame(render: () => void): () => void
editor.getRenderStats(): { drawn: number; culled: number; indexed: number }
```

`onFrame` はエディタが描画するときにだけ走ります。何も起きていないエディタは1フレームも描きません。既定 UI と自作コントロールが歩調を合わせる手段です。

## メッセージ

```ts
editor.message(key: keyof Messages, params?: Record<string, string | number>): string
```

`EditorOptions.messages` で渡した表を通して解決し、なければ英語にフォールバックします。[アクセシビリティ](/ja/guide/accessibility#文言の翻訳)を参照してください。
