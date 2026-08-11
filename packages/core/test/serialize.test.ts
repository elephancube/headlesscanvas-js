import { describe, expect, it, vi } from 'vitest'
import { type ShapeUtil, ShapeUtilRegistry } from '../src/shape/shape-util'
import { rectShapeUtil } from '../src/shape/shapes/rect'
import { type AnyShape, asShapeId, asZIndex } from '../src/shape/types'
import { deserialize, type HcDocument, SCHEMA_VERSION, serialize } from '../src/state/serialize'
import { generateIndexBetween } from '../src/util/fractional-index'

let counter = 0
function makeShape(type: string, props: unknown, meta: Record<string, unknown> = {}): AnyShape {
  counter++
  return {
    id: asShapeId(`shape-${counter}`),
    type,
    parentId: null,
    index: asZIndex(generateIndexBetween(null, null)),
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    meta,
    props,
  } as unknown as AnyShape
}

const rectProps = { fill: { type: 'solid', color: '#f00' }, stroke: null, cornerRadius: 4 }

describe('serialize', () => {
  it('stamps the schema version and per-type props versions', () => {
    const registry = new ShapeUtilRegistry([rectShapeUtil])
    const doc = serialize([makeShape('rect', rectProps)], registry)

    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.propsVersions?.rect).toBe(rectShapeUtil.propsVersion)
  })

  it('round-trips a document unchanged', () => {
    const registry = new ShapeUtilRegistry([rectShapeUtil])
    const shape = makeShape('rect', rectProps)
    const notify = vi.fn()

    const restored = deserialize(serialize([shape], registry), registry, notify)

    expect(restored.shapes).toHaveLength(1)
    expect(restored.shapes[0]).toEqual(shape)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('unknown shape types', () => {
  const registry = new ShapeUtilRegistry([rectShapeUtil])

  it('keeps them instead of discarding them', () => {
    const document: HcDocument = {
      schemaVersion: SCHEMA_VERSION,
      shapes: [makeShape('wall', { thickness: 8 })],
      propsVersions: { wall: 3 },
    }
    const notify = vi.fn()
    const result = deserialize(document, registry, notify)

    // Removing a plugin must not destroy the data it authored (spec §5.4.3).
    expect(result.shapes).toHaveLength(1)
    expect(result.unknownTypes).toEqual(['wall'])
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'unknown-shape-type', level: 'warning' }),
    )
  })

  it('writes them back with their original props version', () => {
    const document: HcDocument = {
      schemaVersion: SCHEMA_VERSION,
      shapes: [makeShape('wall', { thickness: 8 })],
      propsVersions: { wall: 3 },
    }
    const loaded = deserialize(document, registry, vi.fn())
    const rewritten = serialize(loaded.shapes, registry)

    expect(rewritten.propsVersions?.wall).toBe(3)
    expect((rewritten.shapes[0] as { props: unknown }).props).toEqual({ thickness: 8 })
  })
})

describe('props migration', () => {
  interface OldProps {
    colour: string
  }

  const migratingUtil: ShapeUtil<any> = {
    ...rectShapeUtil,
    type: 'rect',
    propsVersion: 2,
    migrateProps(props, fromVersion) {
      if (fromVersion < 2) {
        const old = props as OldProps
        return { fill: { type: 'solid', color: old.colour }, stroke: null, cornerRadius: 0 }
      }
      return props as never
    },
  }

  it('upgrades props written by an older version', () => {
    const registry = new ShapeUtilRegistry([migratingUtil])
    const document: HcDocument = {
      schemaVersion: SCHEMA_VERSION,
      shapes: [makeShape('rect', { colour: '#0f0' })],
      propsVersions: { rect: 1 },
    }

    const result = deserialize(document, registry, vi.fn())
    expect((result.shapes[0] as { props: { fill: { color: string } } }).props.fill.color).toBe(
      '#0f0',
    )
  })

  it('warns rather than throwing when a migration is missing', () => {
    const registry = new ShapeUtilRegistry([{ ...rectShapeUtil, propsVersion: 5 }])
    const document: HcDocument = {
      schemaVersion: SCHEMA_VERSION,
      shapes: [makeShape('rect', rectProps)],
      propsVersions: { rect: 1 },
    }
    const notify = vi.fn()

    const result = deserialize(document, registry, notify)

    expect(result.shapes).toHaveLength(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'schema-migration-failed', level: 'warning' }),
    )
  })

  it('keeps a shape written by a newer props version', () => {
    const registry = new ShapeUtilRegistry([rectShapeUtil])
    const document: HcDocument = {
      schemaVersion: SCHEMA_VERSION,
      shapes: [makeShape('rect', rectProps)],
      propsVersions: { rect: 99 },
    }
    const notify = vi.fn()

    expect(deserialize(document, registry, notify).shapes).toHaveLength(1)
    expect(notify).toHaveBeenCalled()
  })
})

describe('document version handling', () => {
  const registry = new ShapeUtilRegistry([rectShapeUtil])

  it('refuses a document from the future rather than misreading it', () => {
    const notify = vi.fn()
    const result = deserialize({ schemaVersion: SCHEMA_VERSION + 1, shapes: [] }, registry, notify)

    expect(result.shapes).toEqual([])
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'schema-migration-failed', level: 'error' }),
    )
  })

  it('refuses a document with no version at all', () => {
    const notify = vi.fn()
    const result = deserialize({ shapes: [] } as unknown as HcDocument, registry, notify)

    expect(result.shapes).toEqual([])
    expect(notify).toHaveBeenCalled()
  })
})
