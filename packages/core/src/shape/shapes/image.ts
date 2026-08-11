import type { ShapeUtil } from '../shape-util'
import type { ImageShape } from '../types'

export const imageShapeUtil: ShapeUtil<ImageShape> = {
  type: 'image',
  propsVersion: 1,

  getDefaultProps: () => ({
    src: '',
    crossOrigin: 'anonymous',
    naturalSize: null,
    crop: null,
  }),

  render(shape, ctx, info) {
    const image = shape.props.src ? info.getImage?.(shape.props.src) : null

    if (!image) {
      // Placeholder while loading or after a failure. Drawing nothing would
      // make a broken image indistinguishable from an empty canvas.
      ctx.fillStyle = 'rgb(0 0 0 / 6%)'
      ctx.fillRect(0, 0, shape.width, shape.height)
      return
    }

    const crop = shape.props.crop
    const natural = shape.props.naturalSize

    if (crop && natural) {
      ctx.drawImage(
        image,
        crop.x * natural.width,
        crop.y * natural.height,
        crop.width * natural.width,
        crop.height * natural.height,
        0,
        0,
        shape.width,
        shape.height,
      )
    } else {
      ctx.drawImage(image, 0, 0, shape.width, shape.height)
    }
  },

  toSvg(shape, info) {
    const { src, crop, naturalSize } = shape.props
    // Same placeholder the canvas draws, so the export matches the screen.
    if (!src) {
      return {
        tag: 'rect',
        attrs: { x: 0, y: 0, width: shape.width, height: shape.height, fill: 'rgb(0 0 0 / 6%)' },
      }
    }

    const href = info.resolveImage(src)
    // `drawImage` stretches to the box; SVG would letterbox without this.
    const box = { width: shape.width, height: shape.height, preserveAspectRatio: 'none' }
    if (!crop || !naturalSize) {
      return { tag: 'image', attrs: { x: 0, y: 0, ...box, href } }
    }

    // A nested viewport crops: it clips to its own bounds, and the viewBox picks
    // the source rectangle out of the full image.
    return {
      tag: 'svg',
      attrs: {
        x: 0,
        y: 0,
        ...box,
        viewBox: [
          crop.x * naturalSize.width,
          crop.y * naturalSize.height,
          crop.width * naturalSize.width,
          crop.height * naturalSize.height,
        ].join(' '),
      },
      children: [
        {
          tag: 'image',
          attrs: {
            x: 0,
            y: 0,
            width: naturalSize.width,
            height: naturalSize.height,
            preserveAspectRatio: 'none',
            href,
          },
        },
      ],
    }
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
    if (!shape.props.src) return []
    return [
      {
        kind: 'image' as const,
        src: shape.props.src,
        crossOrigin: shape.props.crossOrigin ?? 'anonymous',
      },
    ]
  },

  preserveAspectRatio: false,

  getAccessibleLabel: (shape) => {
    const alt = typeof shape.meta.alt === 'string' ? shape.meta.alt : null
    return alt ?? 'Image'
  },
}
