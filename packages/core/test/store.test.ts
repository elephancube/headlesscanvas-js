import { describe, expect, it, vi } from 'vitest'
import { type AnyShape, asShapeId, asZIndex, type ShapeId } from '../src/shape/types'
import { invertPatches } from '../src/state/patch'
import { Store } from '../src/state/store'
import { generateIndexBetween } from '../src/util/fractional-index'

let counter = 0
function makeShape(overrides: Partial<AnyShape> = {}): AnyShape {
  counter++
  return {
    id: asShapeId(`shape-${counter}`),
    type: 'rect',
    parentId: null,
    index: asZIndex(generateIndexBetween(null, null)),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    meta: {},
    props: { fill: { type: 'solid', color: '#000' }, stroke: null, cornerRadius: 0 },
    ...overrides,
  } as AnyShape
}

describe('transactions', () => {
  it('reads back writes made earlier in the same transaction', () => {
    const store = new Store()
    const shape = makeShape({ x: 10 })
    store.transact(() => store.put(shape))

    store.transact(() => {
      store.update(shape.id, { x: 50 })
      // Without read-your-writes a tool that updates several shapes in sequence
      // would keep seeing stale values (spec §5.2.3).
      expect(store.get(shape.id)?.x).toBe(50)
      store.update(shape.id, { x: store.get(shape.id)!.x + 5 })
    })

    expect(store.get(shape.id)?.x).toBe(55)
  })

  it('hides uncommitted state from getSnapshot', () => {
    const store = new Store()
    const shape = makeShape({ x: 10 })
    store.transact(() => store.put(shape))
    const before = store.getSnapshot()

    store.transact(() => {
      store.update(shape.id, { x: 999 })
      expect(store.getSnapshot()).toBe(before)
      expect(store.getSnapshot().shapes.get(shape.id)?.x).toBe(10)
    })

    expect(store.getSnapshot().shapes.get(shape.id)?.x).toBe(999)
  })

  it('notifies once per outermost transaction, however deeply nested', () => {
    const store = new Store()
    const listener = vi.fn()
    store.subscribe(listener)

    store.transact(() => {
      store.put(makeShape())
      store.transact(() => {
        store.put(makeShape())
        store.transact(() => store.put(makeShape()))
      })
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when nothing actually changed', () => {
    const store = new Store()
    const shape = makeShape({ x: 10 })
    store.transact(() => store.put(shape))

    const listener = vi.fn()
    store.subscribe(listener)
    store.transact(() => store.update(shape.id, { x: 10 }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('rolls back when the transaction throws', () => {
    const store = new Store()
    const shape = makeShape({ x: 1 })
    store.transact(() => store.put(shape))

    expect(() =>
      store.transact(() => {
        store.update(shape.id, { x: 2 })
        throw new Error('boom')
      }),
    ).toThrow('boom')

    expect(store.get(shape.id)?.x).toBe(1)
  })

  it('advances the version on every committed change', () => {
    const store = new Store()
    const v0 = store.getSnapshot().version
    store.transact(() => store.put(makeShape()))
    expect(store.getSnapshot().version).toBeGreaterThan(v0)
  })
})

describe('paint order', () => {
  it('sorts root children by fractional index', () => {
    const store = new Store()
    const first = generateIndexBetween(null, null)
    const third = generateIndexBetween(first, null)
    const second = generateIndexBetween(first, third)

    const a = makeShape({ index: asZIndex(third) })
    const b = makeShape({ index: asZIndex(first) })
    const c = makeShape({ index: asZIndex(second) })
    store.transact(() => {
      store.put(a)
      store.put(b)
      store.put(c)
    })

    expect(store.getSnapshot().rootChildren).toEqual([b.id, c.id, a.id])
  })

  it('walks children depth-first', () => {
    const store = new Store()
    const parent = makeShape()
    const child = makeShape({ parentId: parent.id })
    const sibling = makeShape({ index: asZIndex(generateIndexBetween(parent.index, null)) })
    store.transact(() => {
      store.put(parent)
      store.put(child)
      store.put(sibling)
    })

    expect(store.getSnapshot().paintOrder).toEqual([parent.id, child.id, sibling.id])
  })
})

describe('ephemeral layer', () => {
  it('changes what is resolved without touching committed state', () => {
    const store = new Store()
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))

    store.setEphemeral(new Map([[shape.id, { x: 250 }]]))

    expect(store.getResolved(shape.id)?.x).toBe(250)
    expect(store.get(shape.id)?.x).toBe(0)
    expect(store.getSnapshot().shapes.get(shape.id)?.x).toBe(0)
  })

  it('notifies ephemeral subscribers only', () => {
    const store = new Store()
    const shape = makeShape()
    store.transact(() => store.put(shape))

    const committed = vi.fn()
    const ephemeral = vi.fn()
    store.subscribe(committed)
    store.subscribeEphemeral(ephemeral)

    store.setEphemeral(new Map([[shape.id, { x: 1 }]]))

    expect(ephemeral).toHaveBeenCalledTimes(1)
    expect(committed).not.toHaveBeenCalled()
  })

  it('commits the whole overlay as a single transaction', () => {
    const store = new Store()
    const a = makeShape()
    const b = makeShape()
    store.transact(() => {
      store.put(a)
      store.put(b)
    })

    const commits: number[] = []
    store.subscribeCommit((event) => commits.push(event.patches.length))

    store.setEphemeral(
      new Map([
        [a.id, { x: 10 }],
        [b.id, { x: 20 }],
      ]),
    )
    store.commitEphemeral()

    // One entry covering both shapes — a drag has to be one undo step, not one
    // per moved shape or one per frame (spec §5.2.4).
    expect(commits).toEqual([2])
    expect(store.get(a.id)?.x).toBe(10)
    expect(store.get(b.id)?.x).toBe(20)
    expect(store.hasEphemeral()).toBe(false)
  })

  it('discards the overlay on clear', () => {
    const store = new Store()
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))

    store.setEphemeral(new Map([[shape.id, { x: 99 }]]))
    store.clearEphemeral()

    expect(store.getResolved(shape.id)?.x).toBe(0)
  })
})

describe('patches', () => {
  it('returns to the initial state when inverse patches are applied', () => {
    const store = new Store()
    const shape = makeShape({ x: 0, y: 0 })
    store.transact(() => store.put(shape))
    const initial = store.getSnapshot().shapes.get(shape.id)!

    // One inverse batch per commit — that is exactly what an undo stack holds.
    const undoStack: ReturnType<typeof invertPatches>[] = []
    store.subscribeCommit((event) => undoStack.push(invertPatches(event.patches)))

    store.transact(() => store.update(shape.id, { x: 100, y: 50 }))
    store.transact(() => store.update(shape.id, { width: 300 }))

    for (const batch of [...undoStack].reverse()) {
      store.applyPatches(batch, { addToHistory: false })
    }

    const restored = store.getSnapshot().shapes.get(shape.id)!
    expect(restored.x).toBe(initial.x)
    expect(restored.y).toBe(initial.y)
    expect(restored.width).toBe(initial.width)
  })

  it('records before and after values for updates', () => {
    const store = new Store()
    const shape = makeShape({ x: 5 })
    store.transact(() => store.put(shape))

    const events: unknown[] = []
    store.subscribeCommit((event) => events.push(event.patches[0]))
    store.transact(() => store.update(shape.id, { x: 7 }))

    expect(events[0]).toMatchObject({ op: 'update', before: { x: 5 }, after: { x: 7 } })
  })

  it('skips the history for changes the user did not make', () => {
    const store = new Store()
    const commit = vi.fn()
    store.subscribeCommit(commit)
    store.transact(() => store.put(makeShape()), { addToHistory: false })
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('selection', () => {
  it('drops ids that no longer exist', () => {
    const store = new Store()
    const shape = makeShape()
    store.transact(() => store.put(shape))
    store.transact(() => store.setSelection([shape.id, asShapeId('ghost') as ShapeId]))

    expect(store.getSnapshot().selectedIds).toEqual([shape.id])
  })

  it('clears the selection when the shape is removed', () => {
    const store = new Store()
    const shape = makeShape()
    store.transact(() => store.put(shape))
    store.transact(() => store.setSelection([shape.id]))
    store.transact(() => store.remove(shape.id))

    expect(store.getSnapshot().selectedIds).toEqual([])
  })
})
