import { resolveFill } from '../paint'
import type { ShapeUtil } from '../shape-util'
import type { TextProps, TextShape } from '../types'

/**
 * A single-style text block.
 *
 * Mixed styles, bidi and vertical writing are out of scope for v1.0. The
 * limitation is deliberate: overlaying a `<textarea>` for editing already
 * cannot match canvas text metrics exactly, and widening the model would make
 * that mismatch worse rather than better (spec §8.5).
 */

export function fontString(props: TextProps): string {
  return `${props.fontStyle} ${props.fontWeight} ${props.fontSize}px ${props.fontFamily}`
}

/** Break opportunities: spaces, and between CJK characters. */
const CJK = /[　-鿿豈-﫿＀-￯]/

/**
 * `measure` is injected rather than taking a context, because the SVG exporter
 * has to break the lines identically and has no context to draw into. One
 * implementation, two back ends.
 */
function wrapText(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }

    let line = ''
    let pending = ''

    const flush = () => {
      if (line !== '') lines.push(line)
      line = ''
    }

    for (let i = 0; i < paragraph.length; i++) {
      const char = paragraph[i]!
      pending += char

      const breakable =
        char === ' ' || CJK.test(char) || (paragraph[i + 1] && CJK.test(paragraph[i + 1]!))
      if (!breakable && i < paragraph.length - 1) continue

      if (line === '') {
        line = pending
      } else if (measure(line + pending) <= maxWidth) {
        line += pending
      } else {
        flush()
        line = pending.replace(/^ +/, '')
      }
      pending = ''
    }

    if (pending !== '') {
      if (line !== '' && measure(line + pending) > maxWidth) flush()
      line += pending
    }
    flush()
  }

  return lines.length > 0 ? lines : ['']
}

interface TextLayout {
  lines: string[]
  lineHeight: number
  /** Top of the first line box. */
  top: number
}

/** Line breaking and vertical placement, shared by the canvas and SVG paths. */
function layoutText(shape: TextShape, measure: (text: string) => number): TextLayout {
  const props = shape.props
  const lines = props.wrap ? wrapText(measure, props.text, shape.width) : props.text.split('\n')
  const lineHeight = props.fontSize * props.lineHeight
  const blockHeight = lines.length * lineHeight

  let top = 0
  if (props.verticalAlign === 'middle') top = (shape.height - blockHeight) / 2
  else if (props.verticalAlign === 'bottom') top = shape.height - blockHeight

  return { lines, lineHeight, top }
}

export const textShapeUtil: ShapeUtil<TextShape> = {
  type: 'text',
  propsVersion: 1,

  getDefaultProps: () => ({
    text: 'Text',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: 1.4,
    letterSpacing: 0,
    align: 'left',
    verticalAlign: 'top',
    wrap: true,
    fill: { type: 'solid', color: '#111827' },
    stroke: null,
  }),

  render(shape, ctx, info) {
    const props = shape.props
    ctx.font = fontString(props)
    ctx.textBaseline = 'alphabetic'
    if ('letterSpacing' in ctx && props.letterSpacing !== 0) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${props.letterSpacing}px`
    }

    const { lines, lineHeight, top } = layoutText(shape, (text) => ctx.measureText(text).width)
    const fillStyle = resolveFill(ctx, props.fill, shape.width, shape.height, info)

    lines.forEach((line, index) => {
      const metrics = ctx.measureText(line)
      let x = 0
      if (props.align === 'center') x = (shape.width - metrics.width) / 2
      else if (props.align === 'right') x = shape.width - metrics.width
      // Offset to the alphabetic baseline within the line box.
      const y = top + index * lineHeight + props.fontSize

      if (fillStyle !== null) {
        ctx.fillStyle = fillStyle
        ctx.fillText(line, x, y)
      }
      if (props.stroke && props.stroke.width > 0) {
        ctx.strokeStyle = props.stroke.color
        ctx.lineWidth = props.stroke.width
        ctx.strokeText(line, x, y)
      }
    })
  },

  /**
   * Real `<text>` elements rather than outlines.
   *
   * The text stays selectable, searchable and editable in whatever opens the
   * file, which is most of the reason to want SVG at all. The cost is that
   * glyphs are laid out by the viewer: the line breaks are ours, computed with
   * the same measurements the canvas used, but a viewer without the font will
   * space the glyphs within a line differently. Converting to outlines would
   * remove that at the price of everything else, and needs font data the
   * browser does not expose.
   */
  toSvg(shape, info) {
    const props = shape.props
    const font = fontString(props)
    const { lines, lineHeight, top } = layoutText(
      shape,
      (text) => info.measureText(text, font, props.letterSpacing) ?? 0,
    )

    // Anchoring beats positioning: the viewer aligns each line against its own
    // metrics, so alignment survives a font substitution that would leave a
    // pre-computed x wrong.
    const anchor = props.align === 'center' ? 'middle' : props.align === 'right' ? 'end' : undefined
    const x = props.align === 'center' ? shape.width / 2 : props.align === 'right' ? shape.width : 0
    const fill = info.resolveFill(props.fill, shape.width, shape.height)
    const stroke = props.stroke && props.stroke.width > 0 ? props.stroke : null

    return lines
      .map((line, index) => ({
        tag: 'text',
        attrs: {
          x,
          y: top + index * lineHeight + props.fontSize,
          'font-family': props.fontFamily,
          'font-size': props.fontSize,
          'font-weight': props.fontWeight === 400 ? undefined : props.fontWeight,
          'font-style': props.fontStyle === 'normal' ? undefined : props.fontStyle,
          'letter-spacing': props.letterSpacing === 0 ? undefined : props.letterSpacing,
          'text-anchor': anchor,
          'xml:space': 'preserve',
          fill,
          stroke: stroke?.color,
          'stroke-width': stroke?.width,
        },
        text: line,
      }))
      .filter((node) => node.text !== '')
  },

  hitTest(shape, point, tolerance) {
    return (
      point.x >= -tolerance &&
      point.y >= -tolerance &&
      point.x <= shape.width + tolerance &&
      point.y <= shape.height + tolerance
    )
  },

  getResources(shape) {
    // Declaring the font means the first paint waits for it; measuring against
    // a fallback face and repainting would shift the layout under the user.
    return [{ kind: 'font' as const, src: shape.props.fontFamily }]
  },

  getAccessibleLabel: (shape) => {
    const text = shape.props.text.trim()
    return text.length > 0 ? `Text: ${text.slice(0, 80)}` : 'Empty text'
  },

  getText: (shape) => shape.props.text,
  setText: (_shape, text) => ({ text }),
}
