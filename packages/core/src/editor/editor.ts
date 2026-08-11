import { defaultMessages, formatMessage, type Messages } from '../i18n/messages'
import type { Bounds, Matrix, OrientedBounds, Vec } from '../math'
import {
  applyToPoint,
  boundsFromPoints,
  boundsIntersect,
  invert,
  multiply,
  toCssMatrix,
} from '../math'
import { Canvas2dRenderer, worldAabb } from '../render/canvas2d'
import { type ExportOptions, exportToBlob } from '../render/export'
import type { RenderItem } from '../render/renderer'
import { exportToSvg, type SvgExportOptions } from '../render/svg'
import { encodeImage } from '../resource/inline'
import { ResourceCache } from '../resource/resource-cache'
import { defaultShapeUtils } from '../shape'
import { type ShapeUtil, ShapeUtilRegistry } from '../shape/shape-util'
import type { AnyShape, ShapeId, ShapeRegistry, ShapeType, ZIndex } from '../shape/types'
import { asShapeId, asZIndex } from '../shape/types'
import { History, type HistoryOptions } from '../state/history'
import { type Notification, NotificationEmitter } from '../state/notifications'
import type { Patch } from '../state/patch'
import { deserialize, type HcDocument, type SerializeOptions, serialize } from '../state/serialize'
import { Store, type StoreSnapshot, type TransactOptions } from '../state/store'
import { generateIndexBetween } from '../util/fractional-index'
import { createId } from '../util/id'
import { Controls, type HandleId } from './controls'
import {
  computeSnap,
  defaultSnapSettings,
  type SnapGuide,
  type SnapResult,
  type SnapSettings,
} from './snapping'
import { SpatialIndex } from './spatial-index'
import { DrawTool } from './tools/draw-tool'
import { HandTool } from './tools/hand-tool'
import { SelectTool } from './tools/select-tool'
import type { HcPointerEvent, Tool, ToolState } from './tools/types'
import { decomposeTransform, inheritedOpacity, worldCorners, worldTransformOf } from './transforms'
import {
  type Camera,
  cameraMatrix,
  clampZoom,
  DEFAULT_ZOOM_RANGE,
  screenToWorldPoint,
  visibleBounds,
  worldToScreenPoint,
} from './viewport'

export type { ToolState as InteractionState } from './tools/types'

export interface EditorOptions {
  /** The editor creates its canvas and overlay inside this element. */
  container: HTMLElement
  shapeUtils?: readonly ShapeUtil<any>[]
  initialDocument?: HcDocument
  messages?: Partial<Messages>
  zoomRange?: readonly [number, number]
  /** Click slop in screen pixels. Defaults to 5. */
  hitTolerance?: number
  history?: HistoryOptions
  snapping?: Partial<SnapSettings>
}

export type CreateShapeInput<K extends ShapeType> = Partial<
  Omit<ShapeRegistry[K], 'id' | 'type' | 'props' | 'index'>
> & {
  type: K
  props?: Partial<ShapeRegistry[K]['props']>
}

export type ZIndexAnchor = { before: ShapeId } | { after: ShapeId } | { position: 'first' | 'last' }

/**
 * The editor.
 *
 * It owns a canvas for the shapes and a DOM overlay for the controls, and keeps
 * the two in step. The split is the entire premise of the library: nothing that
 * a user interacts with is ever painted into the canvas, so all of it can be
 * restyled with CSS and reached by assistive technology (invariant 1).
 *
 * There is no module-level state anywhere, so several editors can coexist on a
 * page (spec §5.2.5).
 */
export class Editor {
  readonly container: HTMLElement
  readonly canvasElement: HTMLCanvasElement
  /**
   * The one element that carries the viewport transform. Controls are placed
   * inside it using world coordinates, which is what makes panning and zooming
   * cost a single style write no matter how many of them there are
   * (invariant 3).
   */
  readonly overlayElement: HTMLElement

  readonly registry: ShapeUtilRegistry
  readonly controls: Controls
  readonly resources: ResourceCache
  readonly history: History

  private readonly store = new Store()
  private readonly notifications = new NotificationEmitter()
  private readonly messages: Messages
  private readonly renderer: Canvas2dRenderer
  private readonly resizeObserver: ResizeObserver
  private readonly disposers: Array<() => void> = []
  private readonly index = new SpatialIndex()

  private camera: Camera = { x: 0, y: 0, z: 1 }
  private cameraVersion = 0
  private readonly zoomRange: readonly [number, number]
  private readonly hitTolerance: number

  private frame: number | null = null
  private size = { width: 0, height: 0 }
  private disposed = false

  private transformCache = new Map<ShapeId, Matrix>()
  private transformCacheVersion = -1

  constructor(options: EditorOptions) {
    this.container = options.container
    this.messages = { ...defaultMessages, ...options.messages }
    this.zoomRange = options.zoomRange ?? DEFAULT_ZOOM_RANGE
    this.hitTolerance = options.hitTolerance ?? 5
    this.registry = new ShapeUtilRegistry(options.shapeUtils ?? defaultShapeUtils)
    if (options.snapping) this.snapSettings = { ...defaultSnapSettings, ...options.snapping }

    const { canvas, overlay } = this.buildDom()
    this.canvasElement = canvas
    this.overlayElement = overlay

    this.renderer = new Canvas2dRenderer({ canvas, registry: this.registry })
    this.controls = new Controls(this)
    this.history = new History(this.store, options.history)

    this.resources = new ResourceCache({
      onChange: () => this.requestRender(),
      notify: (notification) => this.notifications.emit(notification),
      onImageSize: (src, naturalSize) => this.recordImageSize(src, naturalSize),
    })

    this.disposers.push(
      this.store.subscribe(() => {
        this.index.invalidate()
        this.lastIndexByParent.clear()
        this.requestRender()
      }),
    )
    this.disposers.push(this.store.subscribeEphemeral(() => this.requestRender()))

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.container)

    // Registered through the same public API an application would use.
    this.tools.register('select', (editor) => new SelectTool(editor))
    this.tools.register('hand', (editor) => new HandTool(editor))
    // Re-register this one to give it a colour, width or smoothing of your own;
    // registration is by id, so a second call replaces it.
    this.tools.register('draw', (editor) => new DrawTool(editor))
    this.tools.setCurrent('select')

    this.attachInput()
    this.handleResize()

    if (options.initialDocument) this.loadDocument(options.initialDocument)
  }

  // --- DOM -----------------------------------------------------------------

  private buildDom(): { canvas: HTMLCanvasElement; overlay: HTMLElement } {
    const doc = this.container.ownerDocument
    this.container.classList.add('hc-container')
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative'
    }
    this.container.style.overflow = 'hidden'
    this.container.style.touchAction = 'none'
    if (!this.container.hasAttribute('tabindex')) this.container.setAttribute('tabindex', '0')
    this.container.setAttribute('role', 'application')
    this.container.setAttribute('aria-label', this.message('canvas.label'))
    this.container.setAttribute('data-hc-tool', 'select')
    this.container.setAttribute('data-hc-state', 'idle')

    const canvas = doc.createElement('canvas')
    canvas.className = 'hc-canvas'
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.display = 'block'
    // The canvas is decorative: everything meaningful is exposed through the
    // overlay's DOM instead.
    canvas.setAttribute('aria-hidden', 'true')

    const overlay = doc.createElement('div')
    overlay.className = 'hc-overlay'
    overlay.style.position = 'absolute'
    overlay.style.inset = '0'
    // Only the handles opt back in. Letting the browser decide ownership this
    // way is what keeps canvas drags and handle drags from fighting each other
    // (spec §5.8.1).
    overlay.style.pointerEvents = 'none'
    overlay.style.transformOrigin = '0 0'

    this.container.append(canvas, overlay)
    return { canvas, overlay }
  }

  // --- lifecycle -----------------------------------------------------------

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.editingListeners.clear()
    for (const dispose of this.disposers) dispose()
    this.history.dispose()
    this.resources.dispose()
    this.renderer.dispose()
    this.canvasElement.remove()
    this.overlayElement.remove()
    this.container.classList.remove('hc-container')
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('[headless-canvas] editor has been disposed')
  }

  // --- state ---------------------------------------------------------------

  getSnapshot(): StoreSnapshot {
    return this.store.getSnapshot()
  }

  /** Cache key covering committed and in-flight changes alike. */
  getRenderVersion(): number {
    return this.store.getRenderVersion() + this.cameraVersion
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  subscribeEphemeral(listener: () => void): () => void {
    return this.store.subscribeEphemeral(listener)
  }

  subscribeNotifications(listener: (n: Notification) => void): () => void {
    return this.notifications.subscribe(listener)
  }

  transact<T>(fn: () => T, options?: TransactOptions): T {
    this.assertAlive()
    return this.store.transact(fn, options)
  }

  /** Reads back writes made earlier in the same transaction (spec §5.2.3). */
  getShape<K extends ShapeType = ShapeType>(id: ShapeId): ShapeRegistry[K] | undefined {
    return this.store.get(id) as ShapeRegistry[K] | undefined
  }

  /** Includes any in-flight interaction, so it matches what is on screen. */
  getResolvedShape(id: ShapeId): AnyShape | undefined {
    return this.store.getResolved(id)
  }

  createShape<K extends ShapeType>(input: CreateShapeInput<K>): ShapeId {
    this.assertAlive()
    const id = asShapeId(createId())
    const util = this.registry.get(input.type)
    const parentId = (input.parentId as ShapeId | null | undefined) ?? null

    const shape = {
      id,
      type: input.type,
      parentId,
      index: this.nextIndex(parentId),
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width ?? 100,
      height: input.height ?? 100,
      rotation: input.rotation ?? 0,
      opacity: input.opacity ?? 1,
      locked: input.locked ?? false,
      visible: input.visible ?? true,
      meta: input.meta ?? {},
      props: { ...((util?.getDefaultProps() ?? {}) as object), ...(input.props as object) },
    } as unknown as AnyShape

    this.store.transact(() => this.store.put(shape))
    this.requestResources(shape)
    return id
  }

  updateShape(id: ShapeId, changes: Partial<AnyShape>): void {
    this.assertAlive()
    this.store.transact(() => this.store.update(id, changes))
    const shape = this.store.get(id)
    if (shape) this.requestResources(shape)
  }

  deleteShapes(ids: readonly ShapeId[]): void {
    this.assertAlive()
    // One pass over the document rather than one per deleted shape; clearing a
    // 5,000-shape canvas otherwise degenerates into a quadratic walk.
    const childrenMap = this.buildChildrenMap()
    const doomed = new Set<ShapeId>()
    const collect = (id: ShapeId) => {
      if (doomed.has(id)) return
      doomed.add(id)
      for (const child of childrenMap.get(id) ?? []) collect(child)
    }
    for (const id of ids) collect(id)

    this.store.transact(() => {
      for (const id of doomed) this.store.remove(id)
      this.store.setSelection(this.store.selectedIds.filter((selected) => !doomed.has(selected)))
    })
  }

  applyPatch(patches: readonly Patch[], options: TransactOptions = {}): void {
    this.assertAlive()
    this.store.applyPatches(patches, { addToHistory: false, ...options })
  }

  /**
   * Show a change without committing it.
   *
   * This is the path an interaction takes while it is in flight: the immutable
   * document is left alone and only an overlay map is rewritten, which is what
   * makes a per-frame update affordable. Custom tools should use it for the
   * same reason (spec §5.2.4).
   */
  setEphemeral(changes: ReadonlyMap<ShapeId, Partial<AnyShape>>): void {
    this.assertAlive()
    this.store.setEphemeral(changes)
    this.index.setExcluded(new Set(changes.keys()))
  }

  /** Fold the pending changes into the document as one undoable step. */
  commitEphemeral(options?: TransactOptions): void {
    this.assertAlive()
    this.store.commitEphemeral(options)
    this.index.setExcluded(new Set())
  }

  /** Abandon the pending changes. */
  clearEphemeral(): void {
    this.store.clearEphemeral()
    this.index.setExcluded(new Set())
  }

  /**
   * Next z-order key for a new child of `parentId`.
   *
   * The highest existing key is cached per parent and cleared on commit.
   * Without it, creating n shapes in one transaction would rescan the document
   * n times — and the cache has to be transaction-scoped because within one
   * transaction the previous key is not committed yet.
   */
  private nextIndex(parentId: ShapeId | null): ZIndex {
    let last = this.lastIndexByParent.get(parentId) ?? null
    if (last === null) {
      for (const shape of this.store.currentShapes()) {
        if (shape.parentId !== parentId) continue
        if (last === null || shape.index > last) last = shape.index
      }
    }
    const next = generateIndexBetween(last, null)
    this.lastIndexByParent.set(parentId, next)
    return asZIndex(next)
  }

  private readonly lastIndexByParent = new Map<ShapeId | null, string>()

  private requestResources(shape: AnyShape): void {
    const util = this.registry.get(shape.type)
    for (const request of util?.getResources?.(shape) ?? []) {
      if (request.kind === 'image') {
        this.resources.getImage(request.src, request.crossOrigin ?? 'anonymous')
      } else {
        void this.resources.loadFont(request.src)
      }
    }
  }

  private recordImageSize(src: string, naturalSize: { width: number; height: number }): void {
    // A load completing is not a user action, so it must not become an undo
    // step (spec §5.6).
    this.store.transact(
      () => {
        for (const shape of this.store.getSnapshot().shapes.values()) {
          if (shape.type !== 'image') continue
          const props = shape.props as { src: string; naturalSize?: unknown }
          if (props.src !== src || props.naturalSize) continue
          this.store.update(shape.id, {
            props: { ...(shape.props as object), naturalSize },
          } as Partial<AnyShape>)
        }
      },
      { addToHistory: false },
    )
  }

  // --- hierarchy -----------------------------------------------------------

  /**
   * Children of `parentId` in paint order; pass null for the root.
   *
   * Reads uncommitted state, so it stays correct while a transaction is open.
   */
  getChildren(parentId: ShapeId | null): ShapeId[] {
    const siblings: AnyShape[] = []
    for (const shape of this.store.currentShapes()) {
      if (shape.parentId === parentId) siblings.push(shape)
    }
    siblings.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
    return siblings.map((shape) => shape.id)
  }

  /** All parent-to-children links in one pass, for whole-tree walks. */
  private buildChildrenMap(): Map<ShapeId | null, ShapeId[]> {
    const map = new Map<ShapeId | null, ShapeId[]>()
    for (const shape of this.store.currentShapes()) {
      const siblings = map.get(shape.parentId)
      if (siblings) siblings.push(shape.id)
      else map.set(shape.parentId, [shape.id])
    }
    return map
  }

  /** Ancestors, nearest first. */
  getAncestors(id: ShapeId): ShapeId[] {
    const out: ShapeId[] = []
    let parentId = this.store.get(id)?.parentId ?? null
    while (parentId !== null && !out.includes(parentId)) {
      out.push(parentId)
      parentId = this.store.get(parentId)?.parentId ?? null
    }
    return out
  }

  /**
   * Move shapes under a new parent without changing how they look.
   *
   * The new local transform is the old world transform expressed in the new
   * parent's space. Because the model has no scale or skew this decomposition
   * is exact, so reparenting is lossless (spec §5.3.4).
   */
  setParent(ids: readonly ShapeId[], parentId: ShapeId | null, at?: ZIndexAnchor): void {
    this.assertAlive()
    this.store.transact(() => {
      const parentWorld = parentId ? this.getWorldTransform(parentId) : null
      const parentInverse = parentWorld ? invert(parentWorld) : null

      for (const id of ids) {
        const shape = this.store.get(id)
        if (!shape || id === parentId) continue
        // Reparenting into a descendant would create a cycle.
        if (parentId && this.getAncestors(parentId).includes(id)) continue

        const world = this.getWorldTransform(id)
        if (!world) continue
        const local = parentInverse ? multiply(parentInverse, world) : world
        const placement = decomposeTransform(local, shape.width, shape.height)

        this.store.update(id, {
          parentId,
          index: this.resolveIndex(parentId, at, id),
          ...placement,
        })
      }
    })
  }

  /**
   * Reorder within the current parent.
   *
   * Exposing "before this shape" and "after this shape" is the point of using a
   * fractional index at all — it is what a layer panel needs, and it changes a
   * single shape rather than every shape after it (spec §5.3.2).
   */
  moveTo(ids: readonly ShapeId[], anchor: ZIndexAnchor): void {
    this.assertAlive()
    this.store.transact(() => {
      for (const id of ids) {
        const shape = this.store.get(id)
        if (!shape) continue
        this.store.update(id, { index: this.resolveIndex(shape.parentId, anchor, id) })
      }
    })
  }

  reorder(ids: readonly ShapeId[], to: 'front' | 'back' | 'forward' | 'backward'): void {
    this.assertAlive()
    this.store.transact(() => {
      for (const id of ids) {
        const shape = this.store.get(id)
        if (!shape) continue
        const siblings = this.getChildren(shape.parentId).filter((sibling) => sibling !== id)
        if (siblings.length === 0) continue
        const position = this.getChildren(shape.parentId).indexOf(id)

        let anchor: ZIndexAnchor
        if (to === 'front') anchor = { position: 'last' }
        else if (to === 'back') anchor = { position: 'first' }
        else if (to === 'forward') {
          const next = siblings[position]
          anchor = next ? { after: next } : { position: 'last' }
        } else {
          const previous = siblings[position - 1]
          anchor = previous ? { before: previous } : { position: 'first' }
        }
        this.store.update(id, { index: this.resolveIndex(shape.parentId, anchor, id) })
      }
    })
  }

  private resolveIndex(
    parentId: ShapeId | null,
    anchor: ZIndexAnchor | undefined,
    exclude: ShapeId,
  ): ZIndex {
    const siblings = this.getChildren(parentId)
      .filter((id) => id !== exclude)
      .map((id) => this.store.get(id)?.index)
      .filter((index): index is ZIndex => index !== undefined)

    if (!anchor || ('position' in anchor && anchor.position === 'last')) {
      return asZIndex(generateIndexBetween(siblings[siblings.length - 1] ?? null, null))
    }
    if ('position' in anchor) {
      return asZIndex(generateIndexBetween(null, siblings[0] ?? null))
    }

    const targetId = 'before' in anchor ? anchor.before : anchor.after
    const targetIndex = this.store.get(targetId)?.index
    if (!targetIndex) {
      return asZIndex(generateIndexBetween(siblings[siblings.length - 1] ?? null, null))
    }
    const position = siblings.indexOf(targetIndex)

    if ('before' in anchor) {
      return asZIndex(generateIndexBetween(siblings[position - 1] ?? null, targetIndex))
    }
    return asZIndex(generateIndexBetween(targetIndex, siblings[position + 1] ?? null))
  }

  /** Wrap shapes in a new group, leaving their appearance unchanged. */
  group(ids: readonly ShapeId[]): ShapeId | null {
    this.assertAlive()
    if (ids.length === 0) return null

    return this.store.transact(() => {
      const first = this.store.get(ids[0]!)
      if (!first) return null
      const parentId = first.parentId

      const points: Vec[] = []
      for (const id of ids) {
        const shape = this.store.get(id)
        const transform = this.getWorldTransform(id)
        if (shape && transform) points.push(...worldCorners(shape, transform))
      }
      const box = boundsFromPoints(points)
      if (!box) return null

      // The group's own box is expressed in its parent's space.
      const parentWorld = parentId ? this.getWorldTransform(parentId) : null
      const parentInverse = parentWorld ? invert(parentWorld) : null
      const topLeft = parentInverse
        ? applyToPoint(parentInverse, { x: box.x, y: box.y })
        : { x: box.x, y: box.y }

      const groupId = this.createShape({
        type: 'group',
        parentId,
        x: topLeft.x,
        y: topLeft.y,
        width: box.width,
        height: box.height,
      } as CreateShapeInput<'group'>)

      this.setParent(ids, groupId)
      this.store.setSelection([groupId])
      return groupId
    })
  }

  /** Dissolve a group; its children keep their world placement. */
  ungroup(groupId: ShapeId): ShapeId[] {
    this.assertAlive()
    return this.store.transact(() => {
      const group = this.store.get(groupId)
      if (!group) return []
      const children = this.getChildren(groupId)
      this.setParent(children, group.parentId)
      this.store.remove(groupId)
      this.store.setSelection(children)
      return children
    })
  }

  // --- serialization -------------------------------------------------------

  /**
   * The document, as a plain object to store however the application likes.
   *
   * `options.embedImages` inlines the images the shapes reference, so the
   * result stands alone. Images a loaded document already carried are written
   * back either way: dropping them because this particular save did not ask to
   * embed would destroy data the caller was handed.
   */
  toJSON(meta?: Record<string, unknown>, options: SerializeOptions = {}): HcDocument {
    const shapes = [...this.store.getSnapshot().shapes.values()]
    return serialize(
      shapes,
      this.registry,
      meta,
      this.collectResources(shapes, options.embedImages ?? false),
    )
  }

  /**
   * Images to write into the document.
   *
   * `getResources` already enumerates them per shape through the registry, so
   * this needs no knowledge of which shape types hold images or where.
   */
  private collectResources(
    shapes: readonly AnyShape[],
    embed: boolean,
  ): Record<string, string> | undefined {
    const resources: Record<string, string> = {}
    const seen = new Set<string>()
    const failed: string[] = []

    for (const shape of shapes) {
      const util = this.registry.get(shape.type)
      for (const request of util?.getResources?.(shape) ?? []) {
        if (request.kind !== 'image' || seen.has(request.src)) continue
        seen.add(request.src)
        // Already self-contained; embedding it again would only duplicate it.
        if (request.src.startsWith('data:')) continue

        const carried = this.resources.getInlined(request.src)
        if (carried !== undefined) {
          resources[request.src] = carried
          continue
        }
        if (!embed) continue

        const image = this.resources.getImage(request.src, request.crossOrigin ?? 'anonymous')
        const encoded = image ? encodeImage(image) : null
        if (encoded === null) failed.push(request.src)
        else resources[request.src] = encoded
      }
    }

    if (failed.length > 0) {
      this.notifications.emit({
        level: 'warning',
        code: 'export-failed',
        message:
          `Could not embed ${failed.length} image(s); the document references them by URL. ` +
          'They are either still loading or cross-origin without CORS headers.',
        detail: { sources: failed },
      })
    }

    return Object.keys(resources).length > 0 ? resources : undefined
  }

  /** Replace the document. */
  loadDocument(document: HcDocument): void {
    this.assertAlive()
    const { shapes } = deserialize(document, this.registry, (notification) =>
      this.notifications.emit(notification),
    )
    // Before the shapes, so the first request for an embedded image is served
    // from the document rather than starting a fetch that is then discarded.
    this.resources.resetInlined(Object.entries(document.resources ?? {}))
    this.store.transact(
      () => {
        for (const id of [...this.store.getSnapshot().shapes.keys()]) this.store.remove(id)
        for (const shape of shapes) this.store.put(shape)
        this.store.setSelection([])
      },
      { addToHistory: false },
    )
    for (const shape of shapes) this.requestResources(shape)
  }

  /** The selection as a portable document, for a clipboard implementation. */
  getSelectionAsDocument(): HcDocument {
    const childrenMap = this.buildChildrenMap()
    const wanted = new Set<ShapeId>()
    const collect = (id: ShapeId) => {
      if (wanted.has(id)) return
      wanted.add(id)
      for (const child of childrenMap.get(id) ?? []) collect(child)
    }
    for (const id of this.store.selectedIds) collect(id)

    const shapes: AnyShape[] = []
    for (const id of this.store.getSnapshot().paintOrder) {
      const shape = this.store.get(id)
      if (shape && wanted.has(id)) shapes.push(shape)
    }
    // Carries embedded images through a copy, but does not encode new ones —
    // a clipboard write should not stall on reading back every bitmap.
    return serialize(shapes, this.registry, undefined, this.collectResources(shapes, false))
  }

  /** Insert a document's shapes, giving them fresh ids. */
  insertDocument(document: HcDocument, at?: Vec): ShapeId[] {
    this.assertAlive()
    const { shapes } = deserialize(document, this.registry, (notification) =>
      this.notifications.emit(notification),
    )
    if (shapes.length === 0) return []

    // Added to, not replacing: this document joins one already open.
    for (const [src, dataUrl] of Object.entries(document.resources ?? {})) {
      this.resources.inline(src, dataUrl)
    }

    const remap = new Map<ShapeId, ShapeId>()
    for (const shape of shapes) remap.set(shape.id, asShapeId(createId()))

    const box = boundsFromPoints(
      shapes.flatMap((shape) => [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
      ]),
    )
    const offset = at && box ? { x: at.x - box.x, y: at.y - box.y } : { x: 0, y: 0 }

    const created: ShapeId[] = []
    this.store.transact(() => {
      for (const shape of shapes) {
        const id = remap.get(shape.id)!
        const parentId = shape.parentId ? (remap.get(shape.parentId) ?? null) : null
        const next = {
          ...shape,
          id,
          parentId,
          // Only root-level shapes move; children are relative to their parent.
          x: parentId === null ? shape.x + offset.x : shape.x,
          y: parentId === null ? shape.y + offset.y : shape.y,
          index: this.nextIndex(parentId),
        } as AnyShape
        this.store.put(next)
        created.push(id)
      }
      this.store.setSelection(created)
    })

    for (const id of created) {
      const shape = this.store.get(id)
      if (shape) this.requestResources(shape)
    }
    return created
  }

  // --- geometry ------------------------------------------------------------

  /** Local-to-world transform, including every ancestor. */
  getWorldTransform(id: ShapeId): Matrix | null {
    const version = this.getRenderVersion()
    if (this.transformCacheVersion !== version) {
      this.transformCache.clear()
      this.transformCacheVersion = version
    }
    const cached = this.transformCache.get(id)
    if (cached) return cached

    const shape = this.store.getResolved(id)
    if (!shape) return null
    const transform = worldTransformOf(shape, (parentId) => this.store.getResolved(parentId))
    this.transformCache.set(id, transform)
    return transform
  }

  getShapeBounds(id: ShapeId, space: 'world' | 'screen' = 'world'): OrientedBounds | null {
    const shape = this.store.getResolved(id)
    const transform = this.getWorldTransform(id)
    if (!shape || !transform) return null

    // `OrientedBounds` describes the box *before* rotation, with the rotation
    // applied about its centre. Reporting the transformed (0,0) corner instead
    // would describe a box anchored at its already-rotated corner — and every
    // consumer, from the CSS transform on the selection element to the rotate
    // handle's pivot, would then place the box half a diagonal away from the
    // shape. The two agree only at rotation 0, which is why the mismatch is
    // invisible until something is turned.
    const { x, y, rotation } = decomposeTransform(transform, shape.width, shape.height)

    if (space === 'world') {
      return { x, y, width: shape.width, height: shape.height, rotation }
    }
    const screen = worldToScreenPoint(this.camera, { x, y })
    return {
      x: screen.x,
      y: screen.y,
      width: shape.width * this.camera.z,
      height: shape.height * this.camera.z,
      rotation,
    }
  }

  private ensureIndex(): void {
    this.index.ensure(
      this.store.getSnapshot().paintOrder,
      (id) => this.store.getResolved(id),
      (id) => this.getWorldTransform(id),
    )
  }

  /** Shapes intersecting the viewport, in paint order. */
  getVisibleShapeIds(): ShapeId[] {
    this.ensureIndex()
    const view = visibleBounds(this.camera, this.size.width, this.size.height)
    const candidates = this.index.search(view)
    const out: ShapeId[] = []
    for (const id of this.store.getSnapshot().paintOrder) {
      if (!candidates.has(id)) continue
      const shape = this.store.getResolved(id)
      if (!shape?.visible || shape.type === 'group') continue
      out.push(id)
    }
    return out
  }

  /**
   * Topmost shape under a screen point.
   *
   * The broad phase narrows the candidates; the shape's own `hitTest` decides.
   * The tolerance arrives in screen pixels and is converted here, because a
   * 1px line needs a few pixels of slack regardless of zoom (spec §5.8.4).
   */
  hitTest(screenPoint: Vec): ShapeId | null {
    this.ensureIndex()
    const world = this.viewport.screenToWorld(screenPoint)
    const tolerance = this.hitTolerance / this.camera.z
    const candidates = this.index.searchPoint(world.x, world.y)
    const order = this.store.getSnapshot().paintOrder

    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i]!
      if (!candidates.has(id)) continue
      const shape = this.store.getResolved(id)
      if (!shape?.visible || shape.type === 'group') continue
      const util = this.registry.get(shape.type)
      const transform = this.getWorldTransform(id)
      if (!util || !transform) continue
      const inverse = invert(transform)
      if (!inverse) continue
      if (util.hitTest(shape, applyToPoint(inverse, world), tolerance)) {
        // Selecting a child selects its outermost group, which is what users
        // expect from a grouped object.
        const ancestors = this.getAncestors(id)
        const outermostGroup = ancestors[ancestors.length - 1]
        return outermostGroup ?? id
      }
    }
    return null
  }

  hitTestArea(screenBounds: Bounds): ShapeId[] {
    this.ensureIndex()
    const topLeft = this.viewport.screenToWorld({ x: screenBounds.x, y: screenBounds.y })
    const bottomRight = this.viewport.screenToWorld({
      x: screenBounds.x + screenBounds.width,
      y: screenBounds.y + screenBounds.height,
    })
    const area: Bounds = {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    }

    const candidates = this.index.search(area)
    const out = new Set<ShapeId>()
    for (const id of this.store.getSnapshot().paintOrder) {
      if (!candidates.has(id)) continue
      const shape = this.store.getResolved(id)
      const transform = this.getWorldTransform(id)
      if (!shape?.visible || shape.locked || !transform) continue
      if (shape.parentId !== null) continue // groups are selected as a whole
      if (boundsIntersect(worldAabb(shape, transform), area)) out.add(id)
    }
    return [...out]
  }

  // --- selection -----------------------------------------------------------

  readonly selection = ((editor: Editor) => ({
    get ids(): readonly ShapeId[] {
      return editor.store.selectedIds
    },
    set: (ids: readonly ShapeId[]): void => {
      this.store.transact(() => this.store.setSelection(ids))
    },
    add: (ids: readonly ShapeId[]): void => {
      const next = new Set(this.store.selectedIds)
      for (const id of ids) next.add(id)
      this.selection.set([...next])
    },
    remove: (ids: readonly ShapeId[]): void => {
      const removed = new Set(ids)
      this.selection.set(this.store.selectedIds.filter((id) => !removed.has(id)))
    },
    clear: (): void => this.selection.set([]),
    selectAll: (): void => this.selection.set(this.getChildren(null)),
    /**
     * A single selection reports the shape's own rotated box; a multi-selection
     * reports an axis-aligned one (spec §5.3.5).
     */
    getBounds: (): OrientedBounds | null => {
      const ids = this.store.selectedIds
      if (ids.length === 0) return null
      if (ids.length === 1) return this.getShapeBounds(ids[0]!)

      const points: Vec[] = []
      for (const id of ids) {
        const shape = this.store.getResolved(id)
        const transform = this.getWorldTransform(id)
        if (shape && transform) points.push(...worldCorners(shape, transform))
      }
      const box = boundsFromPoints(points)
      return box ? { ...box, rotation: 0 } : null
    },
  }))(this)

  // --- viewport ------------------------------------------------------------

  readonly viewport = ((editor: Editor) => ({
    get camera(): Camera {
      return { ...editor.camera }
    },
    setCamera: (next: Partial<Camera>): void => {
      const z = next.z === undefined ? this.camera.z : clampZoom(next.z, this.zoomRange)
      this.camera = { x: next.x ?? this.camera.x, y: next.y ?? this.camera.y, z }
      this.cameraVersion++
      this.requestRender()
    },
    panBy: (delta: Vec): void => {
      this.viewport.setCamera({
        x: this.camera.x + delta.x / this.camera.z,
        y: this.camera.y + delta.y / this.camera.z,
      })
    },
    /** Keeps the world point under `centerInScreen` fixed while zooming. */
    zoomTo: (z: number, centerInScreen?: Vec): void => {
      const nextZ = clampZoom(z, this.zoomRange)
      const anchor = centerInScreen ?? { x: this.size.width / 2, y: this.size.height / 2 }
      const worldBefore = screenToWorldPoint(this.camera, anchor)
      const worldAfter = screenToWorldPoint({ ...this.camera, z: nextZ }, anchor)
      this.viewport.setCamera({
        x: this.camera.x + (worldBefore.x - worldAfter.x),
        y: this.camera.y + (worldBefore.y - worldAfter.y),
        z: nextZ,
      })
    },
    zoomToFit: (ids?: readonly ShapeId[], padding = 40): void => {
      const targets = ids ?? this.store.getSnapshot().paintOrder
      const points: Vec[] = []
      for (const id of targets) {
        const shape = this.store.getResolved(id)
        const transform = this.getWorldTransform(id)
        if (shape && transform) points.push(...worldCorners(shape, transform))
      }
      const box = boundsFromPoints(points)
      if (!box || box.width === 0 || box.height === 0) return
      const z = clampZoom(
        Math.min(
          (this.size.width - padding * 2) / box.width,
          (this.size.height - padding * 2) / box.height,
        ),
        this.zoomRange,
      )
      this.viewport.setCamera({
        z,
        x: box.x + box.width / 2 - this.size.width / 2 / z,
        y: box.y + box.height / 2 - this.size.height / 2 / z,
      })
    },
    screenToWorld: (p: Vec): Vec => screenToWorldPoint(this.camera, p),
    worldToScreen: (p: Vec): Vec => worldToScreenPoint(this.camera, p),
    getVisibleBounds: (): Bounds => visibleBounds(this.camera, this.size.width, this.size.height),
  }))(this)

  // --- export --------------------------------------------------------------

  /**
   * Render to a PNG or JPEG blob.
   *
   * Rejects with `HcTaintedCanvasError` when a cross-origin image has tainted
   * the canvas — a browser rule with no workaround, so the error names the
   * responsible sources (spec §12.1).
   */
  async export(options: ExportOptions = {}): Promise<Blob> {
    this.assertAlive()
    const items = this.buildRenderItems()
    const points: Vec[] = []
    for (const item of items) points.push(...worldCorners(item.shape, item.worldTransform))
    const bounds = options.bounds ?? boundsFromPoints(points)
    if (!bounds) throw new Error('[headless-canvas] nothing to export')

    return exportToBlob({
      items,
      registry: this.registry,
      bounds,
      options,
      getImage: (src) => this.resources.getImage(src),
      crossOriginSources: () => this.resources.getCrossOriginSources(),
    })
  }

  /**
   * Serialise to an SVG document.
   *
   * Vectors rather than pixels: the result stays sharp at any size and can be
   * opened in a drawing program. Shapes contribute their own geometry through
   * `ShapeUtil.getPath` (or their own markup through `toSvg`), so an
   * application's shapes export on the same terms as the built-in ones.
   *
   * A shape that implements neither is left out and reported on the
   * notification channel — the export still succeeds, because one unexportable
   * shape should not cost the user the whole document, but it does not go
   * unmentioned either.
   */
  exportSvg(options: SvgExportOptions = {}): string {
    this.assertAlive()
    const items = this.buildRenderItems()
    const points: Vec[] = []
    for (const item of items) points.push(...worldCorners(item.shape, item.worldTransform))
    const bounds = options.bounds ?? boundsFromPoints(points)
    if (!bounds) throw new Error('[headless-canvas] nothing to export')

    return exportToSvg({
      items,
      registry: this.registry,
      bounds,
      options,
      getImage: (src) => this.resources.getImage(src),
      measureText: (text, font, letterSpacing) => this.measureText(text, font, letterSpacing),
      notify: (notification) => this.notifications.emit(notification),
    })
  }

  /** Undefined until first use, null when the environment has no 2D context. */
  private measuringContext: CanvasRenderingContext2D | null | undefined

  /**
   * Measure with the font the canvas would use.
   *
   * On its own canvas rather than the visible one: measuring means assigning
   * `font`, and doing that to the context mid-frame would leak into the drawing.
   */
  private measureText(text: string, font: string, letterSpacing: number): number | null {
    if (this.measuringContext === undefined) {
      this.measuringContext = document.createElement('canvas').getContext('2d')
    }
    const ctx = this.measuringContext
    if (!ctx) return null
    ctx.font = font
    if ('letterSpacing' in ctx) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${letterSpacing}px`
    }
    return ctx.measureText(text).width
  }

  // --- tools and input -----------------------------------------------------

  /**
   * Tool registry.
   *
   * The built-in select and hand tools are registered through exactly this
   * API, so an application-defined tool is not a second-class citizen
   * (spec §5.8.2).
   */
  readonly tools = ((editor: Editor) => ({
    register: (id: string, factory: (editor: Editor) => Tool): void => {
      editor.toolFactories.set(id, factory)
      // Replacing the tool that is already active swaps the live instance too.
      // Re-registering is how a tool gets reconfigured — a new colour for the
      // draw tool, say — and without this it would silently do nothing until
      // the user happened to switch tools and back.
      if (editor.currentToolId !== id) return
      editor.currentTool?.onExit?.()
      editor.currentTool = factory(editor)
      editor.currentTool.onEnter?.()
      editor.tools.setState('idle')
    },
    setCurrent: (id: string): void => {
      if (editor.currentToolId === id) return
      const factory = editor.toolFactories.get(id)
      if (!factory) {
        throw new Error(`[headless-canvas] no tool registered with id "${id}"`)
      }
      editor.currentTool?.onExit?.()
      editor.currentTool = factory(editor)
      editor.currentToolId = id
      editor.container.setAttribute('data-hc-tool', id)
      editor.currentTool.onEnter?.()
      editor.tools.setState('idle')
    },
    get current(): string {
      return editor.currentToolId
    },
    get instance(): Tool | null {
      return editor.currentTool
    },
    get state(): ToolState {
      return editor.toolState
    },
    /** Called by tools as they change mode; drives `data-hc-state`. */
    setState: (state: ToolState): void => {
      if (editor.toolState === state) return
      editor.toolState = state
      editor.container.setAttribute('data-hc-state', state)
      editor.requestRender()
    },
    /** Abort whatever the current tool is doing, leaving no partial state. */
    cancel: (): void => {
      editor.currentTool?.onCancel?.()
    },
  }))(this)

  private readonly toolFactories = new Map<string, (editor: Editor) => Tool>()
  private currentTool: Tool | null = null
  private currentToolId = ''
  private toolState: ToolState = 'idle'

  /** Kept for the default UI; delegates to whichever tool owns a marquee. */
  getBrush(): Bounds | null {
    return this.currentTool?.getBrush?.() ?? null
  }

  // --- text editing --------------------------------------------------------

  private editingId: ShapeId | null = null
  private editingInitialText: string | null = null
  private readonly editingListeners = new Set<() => void>()

  private notifyEditing(): void {
    for (const listener of this.editingListeners) listener()
  }

  /**
   * Text editing sessions.
   *
   * The editor owns *when* a shape is being edited and how the resulting change
   * lands in the history. It deliberately owns nothing about how the editing
   * surface looks: a modal dialog, a field in a side panel or an overlay on the
   * shape are all the same to it, and choosing between them is an application's
   * decision rather than a library's (spec §3, non-goals).
   *
   * Which shapes are editable is likewise not hard-coded — a type is editable
   * exactly when its `ShapeUtil` implements `getText` and `setText`, so a custom
   * shape qualifies on the same terms as the built-in text block.
   */
  readonly editing = ((editor: Editor) => ({
    /** The shape being edited, or null when no session is open. */
    get id(): ShapeId | null {
      return editor.editingId
    },
    /** The text as it stood when the session opened, for seeding the surface. */
    get initialText(): string | null {
      return editor.editingInitialText
    },
    /**
     * Sessions open and close outside the document, so they get their own
     * channel: they are not a state change, and the render version does not
     * move when one starts.
     */
    subscribe: (listener: () => void): (() => void) => {
      this.editingListeners.add(listener)
      return () => {
        this.editingListeners.delete(listener)
      }
    },
    canEdit: (id: ShapeId): boolean => {
      const shape = this.store.getResolved(id)
      if (!shape || shape.locked) return false
      const util = this.registry.get(shape.type)
      return typeof util?.getText === 'function' && typeof util?.setText === 'function'
    },
    /** Returns false when the shape has no editable text, or is locked. */
    begin: (id: ShapeId): boolean => {
      this.assertAlive()
      if (!this.editing.canEdit(id)) return false
      const shape = this.store.getResolved(id)
      const util = shape ? this.registry.get(shape.type) : undefined
      if (!shape || !util?.getText) return false

      this.editingId = id
      this.editingInitialText = util.getText(shape) ?? ''
      // Editing implies selecting; the selection UI would otherwise point at
      // something other than the text being changed.
      this.selection.set([id])
      this.tools.setState('editing')
      this.notifyEditing()
      return true
    },
    /**
     * Close the session, writing `text` as a single history entry.
     *
     * Text identical to what was there records nothing: opening an editor and
     * closing it again is not an edit, and should not cost an undo step.
     */
    commit: (text: string): void => {
      const id = this.editingId
      if (id === null) return
      const shape = this.store.getResolved(id)
      const util = shape ? this.registry.get(shape.type) : undefined
      this.editing.cancel()
      if (!shape || !util?.setText || util.getText?.(shape) === text) return

      const changes: Partial<AnyShape> = {}
      ;(changes as { props?: unknown }).props = {
        ...(shape.props as object),
        ...(util.setText(shape, text) as object),
      }
      this.transact(() => this.updateShape(id, changes))
    },
    /** Close the session, discarding whatever the surface was holding. */
    cancel: (): void => {
      if (this.editingId === null) return
      this.editingId = null
      this.editingInitialText = null
      if (this.toolState === 'editing') this.tools.setState('idle')
      this.notifyEditing()
    },
  }))(this)

  // --- snapping ------------------------------------------------------------

  private snapSettings: SnapSettings = { ...defaultSnapSettings }
  private snapGuides: readonly SnapGuide[] = []

  get snapping(): Readonly<SnapSettings> {
    return this.snapSettings
  }

  setSnapping(settings: Partial<SnapSettings>): void {
    this.snapSettings = { ...this.snapSettings, ...settings }
  }

  /** Active alignment guides, for the control layer to draw. */
  getSnapGuides(): readonly SnapGuide[] {
    return this.snapGuides
  }

  /**
   * Snap a proposed box against everything on screen except `exclude`.
   *
   * Only visible shapes are considered: aligning to something the user cannot
   * see is confusing, and it keeps the candidate set small for free.
   */
  computeSnap(proposed: Bounds, exclude: ReadonlySet<ShapeId>): SnapResult {
    const targets: Bounds[] = []
    for (const id of this.getVisibleShapeIds()) {
      if (exclude.has(id)) continue
      const shape = this.store.getResolved(id)
      const transform = this.getWorldTransform(id)
      if (shape && transform) targets.push(worldAabb(shape, transform))
    }
    const result = computeSnap(proposed, targets, this.snapSettings, this.camera.z)
    this.snapGuides = result.guides
    return result
  }

  clearSnapGuides(): void {
    if (this.snapGuides.length === 0) return
    this.snapGuides = []
    this.requestRender()
  }

  get interactionState(): ToolState {
    return this.toolState
  }

  private toPointerEvent(event: PointerEvent | MouseEvent): HcPointerEvent {
    const rect = this.container.getBoundingClientRect()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    return {
      screen,
      world: this.viewport.screenToWorld(screen),
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      button: event.button,
      // dblclick arrives as a plain MouseEvent, which carries no pointer type.
      pointerType: 'pointerType' in event ? event.pointerType : 'mouse',
      target: this.hitTest(screen),
      original: event,
    }
  }

  /**
   * Is this pointer event aimed at the editor's own surface?
   *
   * The container holds more than the canvas: the editing dialog, the hidden
   * shape list, and whatever the application puts there. Their pointer events
   * bubble to this handler, and claiming one would move focus off the control,
   * capture the pointer — which stops the control's `click` from ever firing —
   * and start a selection underneath whatever the user was actually pressing.
   *
   * The keyboard has the same problem and the same answer (see `isTextEntry`).
   */
  private ownsPointer(target: EventTarget | null): boolean {
    if (target === null) return true
    if (target === this.canvasElement || target === this.container) return true
    const node = target as Node
    return typeof node.nodeType === 'number' && this.overlayElement.contains(node)
  }

  private attachInput(): void {
    // Middle- and right-drag pan regardless of the active tool, the way every
    // canvas application behaves; tools never see those buttons.
    let pan: { screen: Vec; camera: Camera } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (this.disposed || !this.ownsPointer(event.target)) return
      this.container.focus({ preventScroll: true })
      this.container.setPointerCapture(event.pointerId)

      if (event.button === 1 || event.button === 2) {
        const rect = this.container.getBoundingClientRect()
        pan = {
          screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
          camera: this.viewport.camera,
        }
        this.tools.setState('panning')
        event.preventDefault()
        return
      }
      this.currentTool?.onPointerDown?.(this.toPointerEvent(event))
    }

    const onPointerMove = (event: PointerEvent) => {
      if (this.disposed) return
      if (pan) {
        const rect = this.container.getBoundingClientRect()
        this.viewport.setCamera({
          x: pan.camera.x - (event.clientX - rect.left - pan.screen.x) / pan.camera.z,
          y: pan.camera.y - (event.clientY - rect.top - pan.screen.y) / pan.camera.z,
        })
        return
      }
      this.currentTool?.onPointerMove?.(this.toPointerEvent(event))
    }

    const onPointerUp = (event: PointerEvent) => {
      if (this.disposed) return
      if (pan) {
        pan = null
        this.tools.setState('idle')
        return
      }
      this.currentTool?.onPointerUp?.(this.toPointerEvent(event))
    }

    const onPointerCancel = () => {
      pan = null
      this.currentTool?.onCancel?.()
    }

    const onWheel = (event: WheelEvent) => {
      // A textarea in the editing dialog scrolls itself; the canvas must not
      // pan out from under it.
      if (!this.ownsPointer(event.target)) return
      event.preventDefault()
      if (this.currentTool?.onWheel?.(event) === true) return
      const rect = this.container.getBoundingClientRect()
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      if (event.ctrlKey || event.metaKey) {
        this.viewport.zoomTo(this.viewport.camera.z * Math.exp(-event.deltaY * 0.01), screen)
      } else {
        this.viewport.panBy({ x: event.deltaX, y: event.deltaY })
      }
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (this.disposed || !this.ownsPointer(event.target)) return
      this.currentTool?.onDoubleClick?.(this.toPointerEvent(event))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Anything with a text caret owns the keyboard while it has focus. The
      // editing surface is usually a descendant of the container, so without
      // this a "v" typed into it would also switch tools, and ⌘Z would undo
      // the document instead of the typing.
      if (this.editingId !== null || isTextEntry(event.target)) return

      // Undo and redo are editor-level: they must work whichever tool is
      // active, and a tool has no business overriding them.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) this.history.redo()
        else this.history.undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        this.history.redo()
        return
      }

      if (this.currentTool?.onKeyDown?.(event) === true) {
        event.preventDefault()
        return
      }
      // Tool switching is an editor-level concern, so it works whatever the
      // active tool is.
      if (event.key === 'v' && !event.ctrlKey && !event.metaKey) this.tools.setCurrent('select')
      else if (event.key === 'h' && !event.ctrlKey && !event.metaKey) this.tools.setCurrent('hand')
      else if (event.key === 'd' && !event.ctrlKey && !event.metaKey) this.tools.setCurrent('draw')
      else if (event.key === 'Escape') this.tools.cancel()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      this.currentTool?.onKeyUp?.(event)
    }

    const onBlur = () => this.tools.cancel()
    const onContextMenu = (event: MouseEvent) => {
      // Suppressed over the canvas because right-drag pans. A text field in
      // the container keeps its own menu.
      if (this.ownsPointer(event.target)) event.preventDefault()
    }

    this.container.addEventListener('pointerdown', onPointerDown)
    this.container.addEventListener('dblclick', onDoubleClick)
    this.container.addEventListener('keydown', onKeyDown)
    this.container.addEventListener('keyup', onKeyUp)
    this.container.addEventListener('wheel', onWheel, { passive: false })
    this.container.addEventListener('contextmenu', onContextMenu)
    this.container.addEventListener('blur', onBlur)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)

    this.disposers.push(() => {
      this.container.removeEventListener('pointerdown', onPointerDown)
      this.container.removeEventListener('dblclick', onDoubleClick)
      this.container.removeEventListener('keydown', onKeyDown)
      this.container.removeEventListener('keyup', onKeyUp)
      this.container.removeEventListener('wheel', onWheel)
      this.container.removeEventListener('contextmenu', onContextMenu)
      this.container.removeEventListener('blur', onBlur)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    })
  }

  /** Called by `Controls.bindHandle`; routed to whichever tool can transform. */
  beginHandleInteraction(handle: HandleId, event: PointerEvent): void {
    this.container.focus({ preventScroll: true })
    this.currentTool?.onHandlePointerDown?.(handle, this.toPointerEvent(event))
  }

  /** Keyboard equivalent of dragging a handle. */
  nudgeHandle(handle: HandleId, delta: Vec): void {
    this.currentTool?.onHandleNudge?.(handle, delta)
  }

  nudgeSelection(delta: Vec): void {
    this.store.transact(
      () => {
        for (const id of this.store.selectedIds) {
          const shape = this.store.get(id)
          if (!shape || shape.locked) continue
          this.store.update(id, { x: shape.x + delta.x, y: shape.y + delta.y })
        }
      },
      // Holding an arrow key should not fill the history with one entry per
      // repeat (spec §5.9.3).
      { mergeKey: 'nudge' },
    )
  }
  // --- rendering -----------------------------------------------------------

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect()
    this.size = { width: rect.width, height: rect.height }
    this.renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)
    this.requestRender()
  }

  private requestRender(): void {
    if (this.disposed || this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.draw()
    })
  }

  private buildRenderItems(): RenderItem[] {
    const items: RenderItem[] = []
    for (const id of this.store.getSnapshot().paintOrder) {
      const shape = this.store.getResolved(id)
      const worldTransform = this.getWorldTransform(id)
      if (!shape || !worldTransform) continue
      items.push({
        shape,
        worldTransform,
        opacity: inheritedOpacity(shape, (parentId) => this.store.getResolved(parentId)),
      })
    }
    return items
  }

  private draw(): void {
    this.renderer.render({
      items: this.buildRenderItems(),
      camera: this.camera,
      width: this.size.width,
      height: this.size.height,
      isInteracting: (shape) => this.store.getEphemeral().has(shape.id),
      getImage: (src) => this.resources.getImage(src),
    })

    // Two writes per frame, independent of how many controls exist
    // (invariants 3 and 4).
    this.overlayElement.style.transform = toCssMatrix(cameraMatrix(this.camera))
    this.overlayElement.style.setProperty('--hc-zoom', String(this.camera.z))

    for (const render of this.overlayRenderers) render()
  }

  private readonly overlayRenderers = new Set<() => void>()

  /**
   * Register a callback that runs once per frame, after the camera transform is
   * applied. The default UI uses this to position its elements; so can anything
   * else drawing into the overlay.
   */
  onFrame(render: () => void): () => void {
    this.overlayRenderers.add(render)
    this.requestRender()
    return () => this.overlayRenderers.delete(render)
  }

  /** Diagnostics for the benchmarks. */
  getRenderStats(): { drawn: number; culled: number; indexed: number } {
    return {
      drawn: this.renderer.lastDrawnCount,
      culled: this.renderer.lastCulledCount,
      indexed: this.index.size,
    }
  }

  // --- misc ----------------------------------------------------------------

  message(key: keyof Messages, params?: Record<string, string | number>): string {
    return formatMessage(this.messages, key, params)
  }

  notify(notification: Notification): void {
    this.notifications.emit(notification)
  }
}

/**
 * Does this event target have a text caret?
 *
 * The editing surface and any application controls live inside the container,
 * so their key events bubble to the editor's own handler. Without this check
 * typing into a field would also drive the canvas.
 */
function isTextEntry(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null
  if (!element || typeof element.tagName !== 'string') return false
  if (element.isContentEditable === true) return true
  return (
    element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
  )
}
