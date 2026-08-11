import type { Editor } from '@headless-canvas/core'
import {
  HcCanvas,
  HcDefaultControls,
  HcTextEditor,
  useEditor,
  useSelectedIds,
  useSelectionBox,
  useValue,
  useZoom,
} from '@headless-canvas/react'
import { type ReactNode, StrictMode, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import '@headless-canvas/ui/styles.css'

const palette = ['#4f7cff', '#22c55e', '#ef4444', '#a855f7', '#14b8a6']

/**
 * Control UI has to live inside the overlay, because that is the element
 * carrying the viewport transform — children positioned in world coordinates
 * stay pinned to their shapes for the cost of one style write per frame
 * (invariant 3).
 */
function OverlayPortal({ children }: { children: ReactNode }) {
  const editor = useEditor()
  return createPortal(children, editor.overlayElement)
}

/**
 * Level 3: a hand-written selection UI.
 *
 * Note what is *not* here — no pointer maths, no keyboard handling, no ARIA
 * wiring. `getHandleProps` binds the element to the same core primitive the
 * stock UI uses, which is what lets the default UI stay framework-agnostic
 * without the two implementations drifting apart (spec §6.2).
 */
function CustomControls() {
  const { descriptor, getHandleProps } = useSelectionBox()
  const zoom = useZoom()
  if (!descriptor) return null

  const { bounds } = descriptor
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: bounds.width,
        height: bounds.height,
        transform: `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotation}rad)`,
        border: `${2 / zoom}px dashed #7c3aed`,
        background: 'rgb(124 58 237 / 8%)',
        boxSizing: 'border-box',
      }}
    >
      {descriptor.handles.map((handle) => {
        const { style, ...props } = getHandleProps(handle)
        return (
          <div
            key={handle.id}
            {...props}
            style={{
              ...style,
              width: 14 / zoom,
              height: 14 / zoom,
              marginLeft: -7 / zoom,
              marginTop: handle.id === 'rotate' ? -32 / zoom : -7 / zoom,
              background: '#fff',
              border: `${2 / zoom}px solid #7c3aed`,
              borderRadius: handle.id === 'rotate' ? '50%' : 2 / zoom,
              boxSizing: 'border-box',
            }}
          />
        )
      })}
    </div>
  )
}

function Toolbar({ custom, onToggle }: { custom: boolean; onToggle: () => void }) {
  const editor = useEditor()
  const selected = useSelectedIds()
  const zoom = useZoom()
  const count = useValue((snapshot) => snapshot.shapes.size)

  const add = () => {
    const view = editor.viewport.getVisibleBounds()
    editor.createShape({
      type: 'rect',
      x: view.x + view.width / 2 - 70 + Math.random() * 100,
      y: view.y + view.height / 2 - 45 + Math.random() * 100,
      width: 140,
      height: 90,
      props: {
        fill: { type: 'solid', color: palette[Math.floor(Math.random() * palette.length)]! },
        cornerRadius: 10,
      },
    })
  }

  return (
    <header style={{ position: 'absolute', inset: '0 0 auto 0', zIndex: 1 }}>
      <button type="button" onClick={add}>
        Add rectangle
      </button>
      <button type="button" onClick={() => editor.viewport.zoomToFit()}>
        Zoom to fit
      </button>
      <button
        type="button"
        onClick={() => editor.deleteShapes([...selected])}
        disabled={selected.length === 0}
      >
        Delete selected
      </button>
      <button type="button" aria-pressed={custom} onClick={onToggle}>
        {custom ? 'Level 3: custom controls' : 'Level 1: default controls'}
      </button>
      <span className="stat">
        {count} shapes · {selected.length} selected · zoom {Math.round(zoom * 100)}%
      </span>
    </header>
  )
}

function App() {
  const [custom, setCustom] = useState(false)

  const seed = (editor: Editor) => {
    editor.createShape({ type: 'rect', x: 80, y: 90, width: 160, height: 110 })
    editor.createShape({
      type: 'rect',
      x: 320,
      y: 170,
      width: 130,
      height: 130,
      rotation: 0.3,
      props: { fill: { type: 'solid', color: '#22c55e' } },
    })
    editor.createShape({
      type: 'text',
      x: 80,
      y: 230,
      width: 300,
      height: 50,
      props: { text: 'Double-click to edit', fontSize: 22 },
    })
  }

  return (
    <HcCanvas onMount={seed} style={{ flex: 1 }}>
      <Toolbar custom={custom} onToggle={() => setCustom((value) => !value)} />
      {custom ? (
        <OverlayPortal>
          <CustomControls />
        </OverlayPortal>
      ) : (
        <HcDefaultControls />
      )}
      {/* The editing dialog is independent of which controls are mounted. */}
      <HcTextEditor />
    </HcCanvas>
  )
}

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
