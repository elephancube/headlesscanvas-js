# API 概要

パッケージは3つ。必須なのは `core` だけです。

| パッケージ | 内容 | 実行時依存 |
|---|---|---|
| [`@headless-canvas/core`](/ja/api/editor) | エディタ、シェイプ、状態、座標変換、ツール、コントロールのプリミティブ | なし |
| `@headless-canvas/ui` | 既定のコントロール、スタイルシート、クリップボード連携 | `core` |
| [`@headless-canvas/react`](/ja/api/react) | React バインディング | `core` / `ui` / `react` |

## `@headless-canvas/core`

| 領域 | エクスポート |
|---|---|
| エディタ | [`Editor`](/ja/api/editor), `EditorOptions`, `CreateShapeInput`, `ZIndexAnchor` |
| コントロール | [`Controls`](/ja/api/controls), `HandleId`, `HandleDescriptor`, `SelectionBoxDescriptor`, `A11yShapeDescriptor`, `RESIZE_HANDLES` |
| シェイプ | [`ShapeUtil`](/ja/api/shape-util), `ShapeUtilRegistry`, `ShapeRegistry`, `ShapeBase`, `AnyShape`, `ShapeId`, `ZIndex`, `asShapeId`, `asZIndex`, `RenderInfo`, 組み込み7種の `*ShapeUtil`, `defaultShapeUtils` |
| シェイプの props | `RectProps`, `EllipseProps`, `LineProps`, `PathProps`, `TextProps`, `ImageProps`, `GroupProps`, `Fill`, `Stroke`, `Shadow`, `PaintProps`, `GradientStop` |
| 描画補助 | `resolveFill`, `applyStrokeStyle`, `applyShadow`, `paintPath`, `fontString` |
| 幾何 | `pointInPolygon`, `distanceToSegment`, `distanceToPolyline`, `parsePath`, `emitPath`, `pathData`, `flattenPath`, `pathBounds`, `simplifyPolyline`, `polylineToPath`, `PathCommand`, `PathSink` |
| 数学 | `Vec`, `Bounds`, `OrientedBounds`, `Matrix` と各種演算 |
| ビューポート | `Camera`, `screenToWorldPoint`, `worldToScreenPoint`, `cameraMatrix`, `visibleBounds`, `clampZoom`, `DEFAULT_ZOOM_RANGE` |
| 変換 | `decomposeTransform`, `worldTransformOf`, `worldCorners`, `inheritedOpacity` |
| 状態 | `Store`, `StoreSnapshot`, `TransactOptions`, `CommitEvent`, `Patch`, `invertPatch`, `invertPatches` |
| 履歴 | `History`, `HistoryEntry`, `HistoryOptions` |
| ドキュメント | `HcDocument`, `SCHEMA_VERSION`, `serialize`, `deserialize`, `SerializeOptions`, `DeserializeResult` |
| レンダリング | `Renderer`, `RenderItem`, `RenderScene`, `Canvas2dRenderer`, `worldAabb`, `exportToBlob`, `ExportOptions`, `HcTaintedCanvasError` |
| SVG 書き出し | `exportToSvg`, `SvgExportOptions`, `SvgExportParams`, `SvgNode`, `SvgRenderInfo` |
| リソース | `ResourceCache`, `ResourceCacheOptions`, `ResourceStatus`, `ResourceRequest` |
| ツール | `Tool`, `ToolState`, `HcPointerEvent`, `SelectTool`, `HandTool`, `DrawTool`, `DrawToolOptions`, `defaultDrawOptions`, `strokeFromPoints`, `StrokeGeometry` |
| スナップ | `SnapSettings`, `SnapGuide`, `SnapResult`, `defaultSnapSettings` |
| 通知 | `Notification`, `NotificationEmitter` |
| i18n | `Messages`, `defaultMessages`, `formatMessage` |
| ユーティリティ | `createId`, `RTree`, `SpatialIndex`, `compareIndexes`, `generateIndexBetween`, `generateNIndexesBetween`, `DEV` |

## `@headless-canvas/ui`

```ts
function createDefaultControls(
  editor: Editor,
  options?: { accessibleList?: boolean },
): { dispose(): void }

function createClipboardBinding(
  editor: Editor,
  options?: ClipboardBindingOptions,
): ClipboardBinding

function createTextEditor(
  editor: Editor,
  options?: { submitOnEnter?: boolean },
): { dispose(): void }
```

加えてスタイルシート。実行時に注入されないよう、独立したサブパスから import します。

```ts
import '@headless-canvas/ui/styles.css'
```

そこで定義されるクラス名と data 属性は公開 API です。[CSS 契約](/ja/api/css)を参照してください。

## `@headless-canvas/react`

[React リファレンス](/ja/api/react)を参照してください。

## 安定性

これらのページに書かれているものは v1.0 以降 semver に従います。[CSS 契約](/ja/api/css)も同様で、クラスや data 属性の改名は、メソッドの改名とまったく同じく破壊的変更です。

ここに記載のないものは、export されていても内部実装です。

0.x の間は minor バージョンに破壊的変更が含まれ得ます。その場合は CHANGELOG に記載されます。
