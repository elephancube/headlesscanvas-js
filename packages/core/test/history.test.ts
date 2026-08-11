import { describe, expect, it, vi } from 'vitest'
import { type AnyShape, asShapeId, asZIndex } from '../src/shape/types'
import { History } from '../src/state/history'
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

/** A fixed clock keeps the merge-window behaviour deterministic. */
function createHistory(store: Store, mergeWindowMs = 1000) {
  let time = 0
  const history = new History(store, { mergeWindowMs, now: () => time })
  return { history, advance: (ms: number) => (time += ms) }
}

describe('undo and redo', () => {
  it('reverses a change and puts it back', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))

    store.transact(() => store.update(shape.id, { x: 100 }))
    expect(store.get(shape.id)!.x).toBe(100)

    history.undo()
    expect(store.get(shape.id)!.x).toBe(0)

    history.redo()
    expect(store.get(shape.id)!.x).toBe(100)
  })

  it('unwinds a whole sequence and rebuilds it', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))

    for (let i = 1; i <= 5; i++) {
      store.transact(() => store.update(shape.id, { x: i * 10 }))
    }

    for (let i = 0; i < 5; i++) history.undo()
    expect(store.get(shape.id)!.x).toBe(0)

    for (let i = 0; i < 5; i++) history.redo()
    expect(store.get(shape.id)!.x).toBe(50)
  })

  it('restores creation and deletion', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape()

    store.transact(() => store.put(shape))
    expect(store.getSnapshot().shapes.size).toBe(1)

    history.undo()
    expect(store.getSnapshot().shapes.size).toBe(0)

    history.redo()
    expect(store.getSnapshot().shapes.size).toBe(1)

    store.transact(() => store.remove(shape.id))
    history.undo()
    expect(store.get(shape.id)).toBeDefined()
  })

  it('reports what is available', () => {
    const store = new Store()
    const { history } = createHistory(store)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)

    store.transact(() => store.put(makeShape()))
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    history.undo()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('discards the redo branch once a new edit lands', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    store.transact(() => store.update(shape.id, { x: 50 }))

    history.undo()
    expect(history.canRedo).toBe(true)

    store.transact(() => store.update(shape.id, { x: 99 }))
    expect(history.canRedo).toBe(false)
  })

  it('does nothing when there is nothing to undo', () => {
    const store = new Store()
    const { history } = createHistory(store)
    expect(() => history.undo()).not.toThrow()
    expect(() => history.redo()).not.toThrow()
  })
})

describe('selection handling', () => {
  it('restores the selection that was in effect before the change', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const a = makeShape()
    const b = makeShape()
    store.transact(() => {
      store.put(a)
      store.put(b)
    })

    store.transact(() => store.setSelection([a.id]))
    store.transact(() => {
      store.setSelection([b.id])
      store.update(b.id, { x: 40 })
    })

    history.undo()

    // The user needs to see what just changed, so undo puts the selection back
    // where it was rather than leaving it alone (spec §5.9.2).
    expect(store.getSnapshot().selectedIds).toEqual([a.id])
  })

  it('does not record a selection change on its own', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape()
    store.transact(() => store.put(shape))

    const before = history.getSize().undo
    store.transact(() => store.setSelection([shape.id]))

    expect(history.getSize().undo).toBe(before)
  })
})

describe('merging', () => {
  it('folds consecutive changes that share a merge key', () => {
    const store = new Store()
    const { history, advance } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    for (let i = 1; i <= 10; i++) {
      advance(16)
      store.transact(() => store.update(shape.id, { x: i }), { mergeKey: 'nudge' })
    }

    // Holding an arrow key is one undo step, not ten (spec §5.9.3).
    expect(history.getSize().undo).toBe(before + 1)

    history.undo()
    expect(store.get(shape.id)!.x).toBe(0)
  })

  it('starts a new entry once the merge window lapses', () => {
    const store = new Store()
    const { history, advance } = createHistory(store, 500)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    store.transact(() => store.update(shape.id, { x: 1 }), { mergeKey: 'nudge' })
    advance(2000)
    store.transact(() => store.update(shape.id, { x: 2 }), { mergeKey: 'nudge' })

    expect(history.getSize().undo).toBe(before + 2)
  })

  it('does not merge across different keys', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    store.transact(() => store.update(shape.id, { x: 1 }), { mergeKey: 'nudge' })
    store.transact(() => store.update(shape.id, { width: 5 }), { mergeKey: 'resize' })

    expect(history.getSize().undo).toBe(before + 2)
  })

  it('breaks the run on mark()', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    store.transact(() => store.update(shape.id, { x: 1 }), { mergeKey: 'nudge' })
    history.mark()
    store.transact(() => store.update(shape.id, { x: 2 }), { mergeKey: 'nudge' })

    expect(history.getSize().undo).toBe(before + 2)
  })
})

describe('exclusions', () => {
  it('skips changes made inside ignore()', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape()
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    history.ignore(() => store.transact(() => store.update(shape.id, { x: 42 })))

    expect(history.getSize().undo).toBe(before)
    expect(store.get(shape.id)!.x).toBe(42)
  })

  it('skips changes flagged as not user-made', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape()
    store.transact(() => store.put(shape))
    const before = history.getSize().undo

    // Resource loads and external patches arrive this way (spec §5.6).
    store.transact(() => store.update(shape.id, { x: 7 }), { addToHistory: false })

    expect(history.getSize().undo).toBe(before)
  })

  it('does not record its own replays', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))
    store.transact(() => store.update(shape.id, { x: 10 }))

    const size = history.getSize()
    history.undo()
    history.redo()

    expect(history.getSize()).toEqual(size)
  })
})

describe('bookkeeping', () => {
  it('drops the oldest entry past the limit', () => {
    const store = new Store()
    const history = new History(store, { limit: 3 })
    const shape = makeShape({ x: 0 })
    store.transact(() => store.put(shape))

    for (let i = 1; i <= 10; i++) {
      store.transact(() => store.update(shape.id, { x: i }))
    }

    expect(history.getSize().undo).toBe(3)
  })

  it('notifies subscribers when the stacks change', () => {
    const store = new Store()
    const { history } = createHistory(store)
    const listener = vi.fn()
    history.subscribe(listener)

    store.transact(() => store.put(makeShape()))
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    history.undo()
    expect(listener).toHaveBeenCalled()
  })

  it('stops recording after dispose', () => {
    const store = new Store()
    const { history } = createHistory(store)
    history.dispose()

    store.transact(() => store.put(makeShape()))

    expect(history.canUndo).toBe(false)
  })
})
