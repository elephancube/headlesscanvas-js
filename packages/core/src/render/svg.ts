import { type Bounds, boundsIntersect } from '../math/bounds'
import type { Matrix } from '../math/matrix'
import { encodeImage, imageSize } from '../resource/inline'
import type { ShapeUtilRegistry } from '../shape/shape-util'
import type { Fill, Shadow, Stroke } from '../shape/types'
import type { Notification } from '../state/notifications'
import { formatNumber } from '../util/format'
import { worldAabb } from './canvas2d'
import type { RenderItem } from './renderer'

/**
 * SVG back end.
 *
 * Unlike the canvas renderer this one cannot ask a shape to draw itself: there
 * is no context to draw into, only markup to produce. Shapes therefore describe
 * their geometry (`ShapeUtil.getPath`) or their markup (`ShapeUtil.toSvg`), and
 * everything shared — fills, gradients, strokes, shadows, transforms — is
 * translated here, once, with the same semantics `paint.ts` gives the canvas.
 *
 * Note what is *not* here: any knowledge of a particular shape type. A `switch`
 * on `shape.type` in this file would be exactly the cross-cutting branch the
 * registry exists to prevent (spec §5.4), and it would leave application shapes
 * unable to export at all.
 */

export interface SvgNode {
  tag: string
  /** `undefined` values are dropped; numbers are formatted, not stringified. */
  attrs?: Record<string, string | number | undefined>
  children?: readonly SvgNode[]
  /** Character data. Escaped on serialisation; not combined with children. */
  text?: string
}

/**
 * What a `ShapeUtil` is given when asked for its SVG.
 *
 * These are the parts a shape cannot work out for itself: ids are unique to the
 * document being written, gradients have to land in `<defs>`, text measurement
 * needs a canvas, and whether an image can be inlined depends on where it came
 * from.
 */
export interface SvgRenderInfo {
  /** Add a `<defs>` entry and get back the id to reference it by. */
  define(node: SvgNode): string
  /** A fill as an SVG paint value: a colour, `none`, or `url(#id)`. */
  resolveFill(fill: Fill, width: number, height: number): string
  /** Width in px under `font`, or null where no measuring context exists. */
  measureText(text: string, font: string, letterSpacing: number): number | null
  /** A data URI when the image can be inlined, otherwise the original URL. */
  resolveImage(src: string): string
}

export interface SvgExportOptions {
  /** World-space region. Defaults to the bounds of everything drawn. */
  bounds?: Bounds
  background?: string | null
  padding?: number
  /**
   * Multiplier for the `width`/`height` attributes. The `viewBox` is unchanged,
   * so this sets the default display size without resampling anything — the
   * output is vector and stays sharp at any size.
   */
  scale?: number
  /** Inline images as data URIs so the file stands alone. Defaults to true. */
  embedImages?: boolean
}

export interface SvgExportParams {
  items: readonly RenderItem[]
  registry: ShapeUtilRegistry
  bounds: Bounds
  options: SvgExportOptions
  getImage?(src: string): CanvasImageSource | null
  /** Measures with the same font the canvas would use. */
  measureText?(text: string, font: string, letterSpacing: number): number | null
  notify?(notification: Notification): void
}

const NO_FILL: Fill = { type: 'none' }

/** Fill, stroke and shadow, read structurally rather than per shape type. */
interface PaintLike {
  fill?: Fill
  stroke?: Stroke | null
  shadow?: Shadow | null
  fillRule?: 'nonzero' | 'evenodd'
  blendMode?: string
}

/**
 * Blend modes canvas and CSS agree on. The remaining composite operations
 * (`source-in`, `copy`, …) have no `mix-blend-mode` equivalent and are dropped
 * rather than approximated.
 */
const CSS_BLEND_MODES = new Set([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])

/** Far larger than any document, for the even-odd clip an outside stroke needs. */
const OUTER_RECT = 'M-1000000,-1000000H1000000V1000000H-1000000Z'

export function exportToSvg(params: SvgExportParams): string {
  const { items, registry, bounds, options } = params
  const padding = options.padding ?? 0
  const scale = options.scale ?? 1
  const embedImages = options.embedImages ?? true

  const view: Bounds = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }

  const defs: SvgNode[] = []
  let ids = 0
  const define = (node: SvgNode): string => {
    const id = `hc-${++ids}`
    defs.push({ ...node, attrs: { ...node.attrs, id } })
    return id
  }

  const hrefs = new Map<string, string>()
  const notEmbedded = new Set<string>()
  const resolveImage = (src: string): string => {
    const cached = hrefs.get(src)
    if (cached !== undefined) return cached
    const image = embedImages ? (params.getImage?.(src) ?? null) : null
    const url = image ? encodeImage(image) : null
    if (embedImages && image !== null && url === null) notEmbedded.add(src)
    const href = url ?? src
    hrefs.set(src, href)
    return href
  }

  const info: SvgRenderInfo = {
    define,
    resolveFill: (fill, width, height) =>
      fillToPaint(fill, width, height, define, params.getImage, resolveImage),
    measureText: (text, font, letterSpacing) =>
      params.measureText?.(text, font, letterSpacing) ?? null,
    resolveImage,
  }

  const body: SvgNode[] = []
  const unsupported = new Set<string>()

  for (const item of items) {
    const { shape } = item
    if (!shape.visible || item.opacity === 0) continue
    // Unregistered types are preserved in the document but not drawn, exactly as
    // on the canvas — removing a plugin must not alter what the file contains.
    const util = registry.get(shape.type)
    if (!util) continue
    if (!boundsIntersect(worldAabb(shape, item.worldTransform), view)) continue

    const paint = shape.props as PaintLike
    let nodes = util.toSvg?.(shape, info) ?? null
    if (nodes === null) {
      const d = util.getPath?.(shape)
      nodes = d ? paintedPath(d, paint, shape.width, shape.height, info) : null
    }

    if (nodes === null) {
      unsupported.add(shape.type)
      continue
    }

    const children = Array.isArray(nodes) ? nodes : [nodes]
    if (children.length === 0) continue

    const blend = paint.blendMode
    body.push({
      tag: 'g',
      attrs: {
        transform: matrixAttr(item.worldTransform),
        opacity: item.opacity === 1 ? undefined : item.opacity,
        style: blend && CSS_BLEND_MODES.has(blend) ? `mix-blend-mode:${blend}` : undefined,
      },
      children,
    })
  }

  if (unsupported.size > 0) {
    const types = [...unsupported]
    params.notify?.({
      level: 'warning',
      code: 'export-failed',
      message:
        `SVG export skipped ${types.join(', ')}: no vector representation. ` +
        'Implement getPath or toSvg on the shape util.',
      detail: { types },
    })
  }
  if (notEmbedded.size > 0) {
    const sources = [...notEmbedded]
    params.notify?.({
      level: 'warning',
      code: 'export-failed',
      message:
        `Could not inline ${sources.length} image(s); the SVG references them by URL. ` +
        'Cross-origin images without CORS headers cannot be read back.',
      detail: { sources },
    })
  }

  const root: SvgNode = {
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      width: view.width * scale,
      height: view.height * scale,
      viewBox: [view.x, view.y, view.width, view.height].map((v) => formatNumber(v)).join(' '),
    },
    children: [
      ...(defs.length > 0 ? [{ tag: 'defs', children: defs }] : []),
      ...(options.background
        ? [{ tag: 'rect', attrs: { ...boxAttrs(view), fill: options.background } }]
        : []),
      ...body,
    ],
  }

  const out: string[] = []
  serialise(root, 0, out)
  return out.join('\n')
}

// --- painting --------------------------------------------------------------

/**
 * A shape's outline with its fill and stroke, mirroring `paintPath`.
 *
 * Two of its details are why this returns a list rather than one element. SVG
 * has no stroke alignment, so inside and outside are emulated with a clip and a
 * doubled width — the same trick the canvas uses. And a shadow belongs to the
 * fill alone: applying it to a single element carrying both would darken the
 * stroke as well.
 */
function paintedPath(
  d: string,
  paint: PaintLike,
  width: number,
  height: number,
  info: SvgRenderInfo,
): SvgNode[] {
  // A shape that implements `getPath` need not use the standard paint props at
  // all, so what is read out of them is checked rather than assumed. Anything
  // unrecognised paints nothing, which is visible; `fill="undefined"` is not.
  const declared = paint.fill
  const fill = info.resolveFill(
    declared && typeof declared === 'object' && typeof declared.type === 'string'
      ? declared
      : NO_FILL,
    width,
    height,
  )
  const fillRule = paint.fillRule === 'evenodd' ? 'evenodd' : undefined
  const stroke = paint.stroke && paint.stroke.width > 0 ? paint.stroke : null
  const align = stroke?.align ?? 'center'
  const filter = paint.shadow ? shadowFilter(paint.shadow, info.define) : undefined

  const separate =
    align !== 'center' || (filter !== undefined && stroke !== null && fill !== 'none')
  if (!separate) {
    return [
      {
        tag: 'path',
        attrs: {
          d,
          fill,
          'fill-rule': fillRule,
          filter,
          ...(stroke ? strokeAttrs(stroke) : {}),
        },
      },
    ]
  }

  const nodes: SvgNode[] = []
  if (fill !== 'none') {
    nodes.push({ tag: 'path', attrs: { d, fill, 'fill-rule': fillRule, filter } })
  }
  if (stroke) {
    const strokeAttributes = {
      ...strokeAttrs(stroke),
      // Half of a doubled stroke falls outside the clip; the visible half is
      // the full width on the side that was asked for.
      'stroke-width': align === 'center' ? stroke.width : stroke.width * 2,
    }
    let clipPath: string | undefined
    if (align !== 'center') {
      const clipId = info.define({
        tag: 'clipPath',
        children: [
          align === 'outside'
            ? { tag: 'path', attrs: { d: `${OUTER_RECT}${d}`, 'clip-rule': 'evenodd' } }
            : { tag: 'path', attrs: { d, 'clip-rule': fillRule } },
        ],
      })
      clipPath = `url(#${clipId})`
    }
    nodes.push({
      tag: 'path',
      attrs: {
        d,
        fill: 'none',
        'clip-path': clipPath,
        ...strokeAttributes,
        filter: fill === 'none' ? filter : undefined,
      },
    })
  }
  return nodes
}

function strokeAttrs(stroke: Stroke): Record<string, string | number | undefined> {
  return {
    stroke: stroke.color,
    'stroke-width': stroke.width,
    // SVG and canvas share the same defaults, so only differences are written.
    'stroke-linecap': stroke.cap === undefined || stroke.cap === 'butt' ? undefined : stroke.cap,
    'stroke-linejoin':
      stroke.join === undefined || stroke.join === 'miter' ? undefined : stroke.join,
    'stroke-dasharray':
      stroke.dash && stroke.dash.length > 0
        ? stroke.dash.map((value) => formatNumber(value)).join(' ')
        : undefined,
  }
}

/** Canvas blur is a Gaussian of sigma = blur / 2 (HTML spec, §canvas shadows). */
function shadowFilter(shadow: Shadow, define: (node: SvgNode) => string): string {
  const id = define({
    tag: 'filter',
    // The default filter region clips a wide blur, so it is widened here.
    attrs: { x: '-50%', y: '-50%', width: '200%', height: '200%' },
    children: [
      {
        tag: 'feDropShadow',
        attrs: {
          dx: shadow.offsetX,
          dy: shadow.offsetY,
          stdDeviation: shadow.blur / 2,
          'flood-color': shadow.color,
        },
      },
    ],
  })
  return `url(#${id})`
}

/** The gradient geometry here matches `resolveFill` in paint.ts exactly. */
function fillToPaint(
  fill: Fill,
  width: number,
  height: number,
  define: (node: SvgNode) => string,
  getImage: ((src: string) => CanvasImageSource | null) | undefined,
  resolveImage: (src: string) => string,
): string {
  switch (fill.type) {
    case 'none':
      return 'none'
    case 'solid':
      return fill.color
    case 'linear': {
      const cx = width / 2
      const cy = height / 2
      const length =
        Math.abs(width * Math.cos(fill.angle)) + Math.abs(height * Math.sin(fill.angle))
      const dx = (Math.cos(fill.angle) * length) / 2
      const dy = (Math.sin(fill.angle) * length) / 2
      return `url(#${define({
        tag: 'linearGradient',
        attrs: {
          gradientUnits: 'userSpaceOnUse',
          x1: cx - dx,
          y1: cy - dy,
          x2: cx + dx,
          y2: cy + dy,
        },
        children: stopNodes(fill.stops),
      })})`
    }
    case 'radial': {
      return `url(#${define({
        tag: 'radialGradient',
        attrs: {
          gradientUnits: 'userSpaceOnUse',
          cx: width / 2,
          cy: height / 2,
          r: Math.max(width, height) / 2,
        },
        children: stopNodes(fill.stops),
      })})`
    }
    case 'pattern': {
      const image = getImage?.(fill.src) ?? null
      const size = image ? imageSize(image) : null
      // Nothing to paint until the image loads, same as the canvas.
      if (!size) return 'none'
      // SVG patterns always tile in both axes, so the non-repeating direction is
      // given a tile large enough that the second copy falls outside the shape.
      const tileWidth =
        fill.repeat === 'repeat' || fill.repeat === 'repeat-x' ? size.width : Math.max(width, 1)
      const tileHeight =
        fill.repeat === 'repeat' || fill.repeat === 'repeat-y' ? size.height : Math.max(height, 1)
      return `url(#${define({
        tag: 'pattern',
        attrs: { patternUnits: 'userSpaceOnUse', width: tileWidth, height: tileHeight },
        children: [
          {
            tag: 'image',
            attrs: {
              x: 0,
              y: 0,
              width: size.width,
              height: size.height,
              href: resolveImage(fill.src),
            },
          },
        ],
      })})`
    }
  }
}

const stopNodes = (stops: ReadonlyArray<{ offset: number; color: string }>): SvgNode[] =>
  stops.map((stop) => ({
    tag: 'stop',
    attrs: { offset: Math.min(1, Math.max(0, stop.offset)), 'stop-color': stop.color },
  }))

// --- serialisation ---------------------------------------------------------

const boxAttrs = (bounds: Bounds) => ({
  x: bounds.x,
  y: bounds.y,
  width: bounds.width,
  height: bounds.height,
})

function matrixAttr(m: Matrix): string | undefined {
  const values = [m.a, m.b, m.c, m.d, m.e, m.f]
  const identity = [1, 0, 0, 1, 0, 0]
  if (values.every((value, i) => value === identity[i])) return undefined
  return `matrix(${values.map((value) => formatNumber(value, 4)).join(' ')})`
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] as string)

function serialise(node: SvgNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth)
  let open = `${indent}<${node.tag}`
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    if (value === undefined) continue
    const text = typeof value === 'number' ? formatNumber(value) : value
    open += ` ${name}="${escapeXml(text)}"`
  }

  const children = node.children ?? []
  if (children.length === 0) {
    // Character data stays on one line: indenting inside a <text> element would
    // put that whitespace on the page.
    if (node.text === undefined) out.push(`${open}/>`)
    else out.push(`${open}>${escapeXml(node.text)}</${node.tag}>`)
    return
  }

  out.push(`${open}>`)
  for (const child of children) serialise(child, depth + 1, out)
  out.push(`${indent}</${node.tag}>`)
}
