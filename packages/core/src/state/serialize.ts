import type { ShapeUtilRegistry } from '../shape/shape-util'
import type { AnyShape } from '../shape/types'
import type { Notification } from './notifications'

/**
 * The document schema version.
 *
 * Present from the first release because it cannot be added later: a file
 * written without one is indistinguishable from a future file whose version
 * happens to be missing (spec §11.1).
 */
export const SCHEMA_VERSION = 1

export interface HcDocument {
  schemaVersion: number
  shapes: AnyShape[]
  /** Per-type `props` versions, so custom shapes can migrate independently. */
  propsVersions?: Record<string, number>
  /**
   * Images carried inside the document, as data URIs keyed by the URL the
   * shapes reference.
   *
   * A side table rather than rewritten `props`: the shapes keep saying where
   * their images came from, and no shape type has to know where its own URLs
   * live — which would be per-type knowledge of exactly the kind the registry
   * exists to keep out (spec §5.4).
   */
  resources?: Record<string, string>
  meta?: Record<string, unknown>
}

/**
 * Whole-document migrations, applied in order for versions below the current
 * one. Each entry upgrades from its index version to the next.
 */
const documentMigrations: Array<(doc: HcDocument) => HcDocument> = [
  // 0 -> 1 does not exist; version 1 is the first published format.
]

export interface SerializeOptions {
  /**
   * Inline the images the shapes reference into `resources`, so the document
   * stands alone. Off by default: a document is usually stored next to the
   * assets it references, and embedding them multiplies its size.
   *
   * Images that cannot be read back — still loading, or cross-origin without
   * CORS headers — are reported and left as URL references.
   */
  embedImages?: boolean
}

export interface DeserializeResult {
  shapes: AnyShape[]
  /** Types present in the file that no `ShapeUtil` is registered for. */
  unknownTypes: string[]
}

export function serialize(
  shapes: Iterable<AnyShape>,
  registry: ShapeUtilRegistry,
  meta?: Record<string, unknown>,
  resources?: Record<string, string>,
): HcDocument {
  const list = [...shapes]
  const propsVersions: Record<string, number> = {}

  for (const shape of list) {
    if (propsVersions[shape.type] !== undefined) continue
    const util = registry.get(shape.type)
    // Unknown types keep whatever version they arrived with, recorded on the
    // shape's meta, so a round trip does not silently downgrade them.
    const recorded = shape.meta.__propsVersion
    propsVersions[shape.type] = util?.propsVersion ?? (typeof recorded === 'number' ? recorded : 1)
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    shapes: list,
    propsVersions,
    ...(resources && Object.keys(resources).length > 0 ? { resources } : {}),
    ...(meta ? { meta } : {}),
  }
}

/**
 * Read a document, migrating it forward as needed.
 *
 * Shapes whose type is not registered are **kept, not discarded**. Removing a
 * plugin should not destroy the data it authored — they simply are not drawn,
 * and serialising again writes them back unchanged (spec §5.4.3).
 */
export function deserialize(
  document: HcDocument,
  registry: ShapeUtilRegistry,
  notify: (notification: Notification) => void,
): DeserializeResult {
  let doc = document

  if (typeof doc.schemaVersion !== 'number') {
    notify({
      level: 'error',
      code: 'schema-migration-failed',
      message: 'Document is missing schemaVersion',
    })
    return { shapes: [], unknownTypes: [] }
  }

  if (doc.schemaVersion > SCHEMA_VERSION) {
    notify({
      level: 'error',
      code: 'schema-migration-failed',
      message:
        `Document schema version ${doc.schemaVersion} is newer than this build ` +
        `supports (${SCHEMA_VERSION})`,
      detail: { documentVersion: doc.schemaVersion, supported: SCHEMA_VERSION },
    })
    return { shapes: [], unknownTypes: [] }
  }

  for (let version = doc.schemaVersion; version < SCHEMA_VERSION; version++) {
    const migrate = documentMigrations[version]
    if (!migrate) break
    doc = migrate(doc)
  }

  const unknownTypes = new Set<string>()
  const shapes: AnyShape[] = []

  for (const raw of doc.shapes ?? []) {
    const util = registry.get(raw.type)
    if (!util) {
      unknownTypes.add(raw.type)
      shapes.push({
        ...raw,
        meta: {
          ...raw.meta,
          __propsVersion: doc.propsVersions?.[raw.type] ?? 1,
        },
      } as AnyShape)
      continue
    }

    const fileVersion = doc.propsVersions?.[raw.type] ?? 1
    const currentVersion = util.propsVersion ?? 1

    if (fileVersion === currentVersion) {
      shapes.push(raw)
      continue
    }

    if (fileVersion > currentVersion) {
      notify({
        level: 'warning',
        code: 'schema-migration-failed',
        message: `Shape type "${raw.type}" was written by a newer version and is kept as-is`,
        detail: { type: raw.type, fileVersion, currentVersion },
      })
      shapes.push(raw)
      continue
    }

    if (!util.migrateProps) {
      notify({
        level: 'warning',
        code: 'schema-migration-failed',
        message: `Shape type "${raw.type}" needs migration but declares no migrateProps`,
        detail: { type: raw.type, fileVersion, currentVersion },
      })
      shapes.push(raw)
      continue
    }

    try {
      shapes.push({ ...raw, props: util.migrateProps(raw.props, fileVersion) } as AnyShape)
    } catch (error) {
      notify({
        level: 'error',
        code: 'schema-migration-failed',
        message: `Migration failed for shape type "${raw.type}"`,
        detail: error,
      })
      shapes.push(raw)
    }
  }

  if (unknownTypes.size > 0) {
    notify({
      level: 'warning',
      code: 'unknown-shape-type',
      message:
        `Document contains unregistered shape types: ${[...unknownTypes].join(', ')}. ` +
        'They are preserved but not rendered.',
      detail: { types: [...unknownTypes] },
    })
  }

  return { shapes, unknownTypes: [...unknownTypes] }
}
