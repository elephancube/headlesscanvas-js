# API overview

Three packages. `core` is the only one that is required.

| Package | Contents | Runtime dependencies |
|---|---|---|
| [`@headless-canvas/core`](/api/editor) | Editor, shapes, state, transforms, tools, control primitives | None |
| `@headless-canvas/ui` | Default controls, stylesheet, clipboard binding | `core` |
| [`@headless-canvas/react`](/api/react) | React bindings | `core`, `ui`, `react` |

## `@headless-canvas/core`

| Area | Exports |
|---|---|
| Editor | [`Editor`](/api/editor), `EditorOptions`, `CreateShapeInput`, `ZIndexAnchor` |
| Controls | [`Controls`](/api/controls), `HandleId`, `HandleDescriptor`, `SelectionBoxDescriptor`, `A11yShapeDescriptor`, `RESIZE_HANDLES` |
| Shapes | [`ShapeUtil`](/api/shape-util), `ShapeUtilRegistry`, `ShapeRegistry`, `ShapeBase`, `AnyShape`, `ShapeId`, `ZIndex`, `asShapeId`, `asZIndex`, `RenderInfo`, the seven built-in `*ShapeUtil`s, `defaultShapeUtils` |
| Shape props | `RectProps`, `EllipseProps`, `LineProps`, `PathProps`, `TextProps`, `ImageProps`, `GroupProps`, `Fill`, `Stroke`, `Shadow`, `PaintProps`, `GradientStop` |
| Painting | `resolveFill`, `applyStrokeStyle`, `applyShadow`, `paintPath`, `fontString` |
| Geometry | `pointInPolygon`, `distanceToSegment`, `distanceToPolyline`, `parsePath`, `emitPath`, `pathData`, `flattenPath`, `pathBounds`, `simplifyPolyline`, `polylineToPath`, `PathCommand`, `PathSink` |
| Maths | `Vec`, `Bounds`, `OrientedBounds`, `Matrix` and their operations |
| Viewport | `Camera`, `screenToWorldPoint`, `worldToScreenPoint`, `cameraMatrix`, `visibleBounds`, `clampZoom`, `DEFAULT_ZOOM_RANGE` |
| Transforms | `decomposeTransform`, `worldTransformOf`, `worldCorners`, `inheritedOpacity` |
| State | `Store`, `StoreSnapshot`, `TransactOptions`, `CommitEvent`, `Patch`, `invertPatch`, `invertPatches` |
| History | `History`, `HistoryEntry`, `HistoryOptions` |
| Documents | `HcDocument`, `SCHEMA_VERSION`, `serialize`, `deserialize`, `SerializeOptions`, `DeserializeResult` |
| Rendering | `Renderer`, `RenderItem`, `RenderScene`, `Canvas2dRenderer`, `worldAabb`, `exportToBlob`, `ExportOptions`, `HcTaintedCanvasError` |
| SVG export | `exportToSvg`, `SvgExportOptions`, `SvgExportParams`, `SvgNode`, `SvgRenderInfo` |
| Resources | `ResourceCache`, `ResourceCacheOptions`, `ResourceStatus`, `ResourceRequest` |
| Tools | `Tool`, `ToolState`, `HcPointerEvent`, `SelectTool`, `HandTool`, `DrawTool`, `DrawToolOptions`, `defaultDrawOptions`, `strokeFromPoints`, `StrokeGeometry` |
| Snapping | `SnapSettings`, `SnapGuide`, `SnapResult`, `defaultSnapSettings` |
| Notifications | `Notification`, `NotificationEmitter` |
| i18n | `Messages`, `defaultMessages`, `formatMessage` |
| Utilities | `createId`, `RTree`, `SpatialIndex`, `compareIndexes`, `generateIndexBetween`, `generateNIndexesBetween`, `DEV` |

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

Plus the stylesheet, imported from its own subpath so it is never injected at runtime:

```ts
import '@headless-canvas/ui/styles.css'
```

The class names and data attributes it defines are public API — see the [CSS contract](/api/css).

## `@headless-canvas/react`

See the [React reference](/api/react).

## Stability

Everything on these pages follows semver from v1.0. So does the [CSS contract](/api/css): renaming a class or a data attribute is a breaking change, exactly as renaming a method would be.

Anything not documented here is internal, whatever its export status.

During the 0.x series, minor versions may contain breaking changes; they will be listed in the changelog.
