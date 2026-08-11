import {
  Editor,
  type EditorOptions,
  type HandleDescriptor,
  type SelectionBoxDescriptor,
  type ShapeId,
  type ShapeRegistry,
  type ShapeType,
  type StoreSnapshot,
} from '@headless-canvas/core'
import {
  createDefaultControls,
  createTextEditor,
  type DefaultControlsOptions,
  type TextEditorOptions,
} from '@headless-canvas/ui'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) {
    throw new Error('[headless-canvas] useEditor must be called inside <HcCanvas>')
  }
  return editor
}

export interface HcCanvasProps extends Omit<EditorOptions, 'container'> {
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
  onMount?: (editor: Editor) => void
}

/**
 * Mounts an editor into a container element.
 *
 * Nothing is constructed during render, so this is safe on the server: the
 * markup is just the container, the overlay is empty, and there is no
 * hydration mismatch to reconcile (spec §14.6).
 */
export function HcCanvas({ children, className, style, onMount, ...options }: HcCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const onMountRef = useRef(onMount)
  onMountRef.current = onMount

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const instance = new Editor({ container, ...optionsRef.current })
    setEditor(instance)
    onMountRef.current?.(instance)
    return () => {
      setEditor(null)
      instance.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    >
      {editor ? <EditorContext.Provider value={editor}>{children}</EditorContext.Provider> : null}
    </div>
  )
}

/**
 * Subscribe to a derived value.
 *
 * The result is cached against the editor's render version because
 * `useSyncExternalStore` compares snapshots by identity — returning a freshly
 * built object on every read would spin forever.
 */
export function useValue<T>(selector: (snapshot: StoreSnapshot) => T): T {
  const editor = useEditor()
  const cache = useRef<{ version: number; selector: unknown; value: T } | null>(null)

  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribeCommitted = editor.subscribe(onChange)
      const unsubscribeEphemeral = editor.subscribeEphemeral(onChange)
      return () => {
        unsubscribeCommitted()
        unsubscribeEphemeral()
      }
    },
    [editor],
  )

  const getSnapshot = useCallback(() => {
    const version = editor.getRenderVersion()
    const cached = cache.current
    if (cached && cached.version === version && cached.selector === selector) return cached.value
    const value = selector(editor.getSnapshot())
    cache.current = { version, selector, value }
    return value
  }, [editor, selector])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSelectedIds(): readonly ShapeId[] {
  const editor = useEditor()
  return useValue(useCallback(() => editor.selection.ids, [editor]))
}

export function useShape<K extends ShapeType = ShapeType>(
  id: ShapeId,
): ShapeRegistry[K] | undefined {
  const editor = useEditor()
  return useValue(
    useCallback(() => editor.getResolvedShape(id) as ShapeRegistry[K] | undefined, [editor, id]),
  )
}

export function useZoom(): number {
  const editor = useEditor()
  return useValue(useCallback(() => editor.viewport.camera.z, [editor]))
}

export interface UseSelectionBoxResult {
  descriptor: SelectionBoxDescriptor | null
  getHandleProps(handle: HandleDescriptor): {
    ref: (element: HTMLElement | null) => void
    'data-hc-handle': string
    style: React.CSSProperties
  }
}

/**
 * Level 3: everything needed to draw the selection UI yourself.
 *
 * The pointer, keyboard and ARIA behaviour comes from `editor.controls`, so a
 * hand-built React UI behaves identically to the stock one and to a vanilla
 * implementation — there is one copy of that logic, not three (spec §6.2).
 *
 * `getHandleProps` returns a ref rather than event handlers, which keeps React's
 * synthetic event types out of the core's public surface.
 */
export function useSelectionBox(): UseSelectionBoxResult {
  const editor = useEditor()
  const descriptor = useValue(useCallback(() => editor.controls.getSelectionBox(), [editor]))
  const bindings = useRef(new Map<string, () => void>())

  useEffect(() => {
    const current = bindings.current
    return () => {
      for (const unbind of current.values()) unbind()
      current.clear()
    }
  }, [])

  const getHandleProps = useCallback(
    (handle: HandleDescriptor) => ({
      ref: (element: HTMLElement | null) => {
        const existing = bindings.current.get(handle.id)
        if (existing) {
          existing()
          bindings.current.delete(handle.id)
        }
        if (element) {
          bindings.current.set(handle.id, editor.controls.bindHandle(element, handle.id))
        }
      },
      'data-hc-handle': handle.id,
      style: {
        position: 'absolute' as const,
        left: `${handle.position.x * 100}%`,
        top: `${handle.position.y * 100}%`,
        cursor: handle.cursor,
      },
    }),
    [editor],
  )

  return { descriptor, getHandleProps }
}

/** Level 1: the stock controls, mounted for you. */
export function HcDefaultControls(props: DefaultControlsOptions = {}): null {
  const editor = useEditor()
  const { accessibleList } = props
  useEffect(() => {
    const controls = createDefaultControls(editor, { accessibleList })
    return () => controls.dispose()
  }, [editor, accessibleList])
  return null
}

/** The stock text editing dialog. Opens on double-click, Enter or F2. */
export function HcTextEditor(props: TextEditorOptions = {}): null {
  const editor = useEditor()
  const { submitOnEnter } = props
  useEffect(() => {
    const surface = createTextEditor(editor, { submitOnEnter })
    return () => surface.dispose()
  }, [editor, submitOnEnter])
  return null
}

/**
 * The current editing session, for building an editing surface of your own.
 *
 * `commit` and `cancel` come from the editor rather than this hook, so a
 * hand-written surface ends a session exactly the way the stock dialog does.
 */
export function useEditingSession(): { id: ShapeId | null; initialText: string | null } {
  const editor = useEditor()
  const cache = useRef<{ id: ShapeId | null; initialText: string | null } | null>(null)

  const subscribe = useCallback(
    (onChange: () => void) => editor.editing.subscribe(onChange),
    [editor],
  )

  // `useSyncExternalStore` compares by identity, so the same session has to
  // return the same object — a fresh one each read would never settle.
  const getSnapshot = useCallback(() => {
    const id = editor.editing.id
    const initialText = editor.editing.initialText
    const cached = cache.current
    if (cached && cached.id === id && cached.initialText === initialText) return cached
    const next = { id, initialText }
    cache.current = next
    return next
  }, [editor])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export type { DefaultControlsOptions, TextEditorOptions }
