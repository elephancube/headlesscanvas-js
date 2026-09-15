# Sample applications

The [demos](/demos) take one feature at a time. These are small but whole applications, which is where the parts have to work together — and where the difference between "the library supports it" and "you can ship it" shows up.

Each one runs the library from source on its own page, with the complete source underneath. None of them is more than a few hundred lines, because the toolbar is usually the longest part.

<div class="hc-gallery">
  <a class="hc-gallery-card" href="./sketchpad">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <path d="M8 42 C 24 8, 40 8, 52 34 S 78 56, 92 20" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" />
      <path d="M84 46 l10 -12 8 8 -10 12 z" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round" />
    </svg>
    <strong>Sketchpad</strong>
    <span>Freehand drawing that exports to PNG and SVG, and hands the result to the share sheet.</span>
  </a>
  <a class="hc-gallery-card" href="./graph-paper">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g fill="#cbd5e1">
        <circle cx="20" cy="14" r="2" /><circle cx="45" cy="14" r="2" /><circle cx="70" cy="14" r="2" /><circle cx="95" cy="14" r="2" />
        <circle cx="20" cy="32" r="2" /><circle cx="45" cy="32" r="2" /><circle cx="70" cy="32" r="2" /><circle cx="95" cy="32" r="2" />
        <circle cx="20" cy="50" r="2" /><circle cx="45" cy="50" r="2" /><circle cx="70" cy="50" r="2" /><circle cx="95" cy="50" r="2" />
      </g>
      <path d="M20 50 L45 14 L70 32 L95 32" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="45" cy="14" r="4.5" fill="#fff" stroke="#2563eb" stroke-width="2.5" />
    </svg>
    <strong>Graph paper</strong>
    <span>Segments from lattice point to lattice point. Drag a vertex and everything meeting it follows — in one undo.</span>
  </a>
  <a class="hc-gallery-card" href="./pixel-art">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <rect x="24" y="6" width="72" height="48" fill="#fff" stroke="#e2e8f0" />
      <g fill="#22c55e">
        <rect x="36" y="6" width="12" height="12" /><rect x="72" y="6" width="12" height="12" />
        <rect x="36" y="18" width="12" height="12" /><rect x="48" y="18" width="12" height="12" />
        <rect x="60" y="18" width="12" height="12" /><rect x="72" y="18" width="12" height="12" />
        <rect x="24" y="30" width="12" height="12" /><rect x="36" y="30" width="12" height="12" />
        <rect x="72" y="30" width="12" height="12" /><rect x="84" y="30" width="12" height="12" />
        <rect x="24" y="42" width="12" height="12" /><rect x="48" y="42" width="12" height="12" />
        <rect x="60" y="42" width="12" height="12" /><rect x="84" y="42" width="12" height="12" />
      </g>
    </svg>
    <strong>Pixel editor</strong>
    <span>A 32×32 board where one cell is one shape — so undo, erase and export were already written.</span>
  </a>
  <a class="hc-gallery-card" href="./tangram">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#fff" stroke-width="1.2">
        <path d="M32,2 L88,2 L60,30 Z" fill="#ef4444" />
        <path d="M32,2 L60,30 L32,58 Z" fill="#3b82f6" />
        <path d="M88,30 L88,58 L60,58 Z" fill="#22c55e" />
        <path d="M88,2 L88,30 L74,16 Z" fill="#f59e0b" />
        <path d="M74,16 L88,30 L74,44 L60,30 Z" fill="#14b8a6" />
        <path d="M60,30 L74,44 L46,44 Z" fill="#a855f7" />
        <path d="M32,58 L60,58 L74,44 L46,44 Z" fill="#ec4899" />
      </g>
    </svg>
    <strong>Tangram</strong>
    <span>Seven pieces, one silhouette, and a tool that makes the illegal moves unreachable.</span>
  </a>
  <a class="hc-gallery-card" href="./amidakuji">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#334155" stroke-width="2" stroke-linecap="round">
        <path d="M20 8 V52" /><path d="M45 8 V52" /><path d="M70 8 V52" /><path d="M95 8 V52" />
      </g>
      <g stroke="#0f766e" stroke-width="2.5" stroke-linecap="round">
        <path d="M20 20 H45" /><path d="M70 28 H95" /><path d="M45 38 H70" />
      </g>
      <path d="M20 8 V20 H45 V38 H70 V52" fill="none" stroke="#e11d48" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="70" cy="52" r="4" fill="#e11d48" stroke="#fff" stroke-width="1.5" />
    </svg>
    <strong>Amidakuji</strong>
    <span>Ladder lottery. A ball rolls down the rungs — the ladder is a drawing, the ball is not.</span>
  </a>
  <a class="hc-gallery-card" href="./polaroid">
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <g stroke="#e2e8f0">
        <g transform="rotate(-7 30 30)">
          <rect x="14" y="10" width="32" height="40" fill="#fff" />
          <rect x="17" y="13" width="26" height="26" fill="#fb923c" stroke="none" />
        </g>
        <g transform="rotate(4 60 30)">
          <rect x="44" y="8" width="32" height="40" fill="#fff" />
          <rect x="47" y="11" width="26" height="26" fill="#2dd4bf" stroke="none" />
        </g>
        <g transform="rotate(-3 92 32)">
          <rect x="74" y="12" width="32" height="40" fill="#fff" />
          <rect x="77" y="15" width="26" height="26" fill="#a3e635" stroke="none" />
        </g>
      </g>
    </svg>
    <strong>Photo collage</strong>
    <span>Drop photographs; they land as tilted prints. Save the lot, pictures included, as one file.</span>
  </a>
</div>

## What to look at

| | The thing worth reading the source for |
|---|---|
| [Sketchpad](./sketchpad) | A stroke is an ordinary `path` shape, so almost nothing in the application is about drawing. |
| [Graph paper](./graph-paper) | Moving one vertex rewrites every segment touching it, and stays one entry in the history. |
| [Pixel editor](./pixel-art) | A whole drag is one undo, without deferring a single write. |
| [Tangram](./tangram) | The pieces snap home inside the same commit that moved them. |
| [Amidakuji](./amidakuji) | Sixty frames a second of animation, and not one of them touches the document. |
| [Photo collage](./polaroid) | Pictures are saved beside the shapes, never written over them. |

All six are plain TypeScript modules — no framework, no build step of their own. The same code would run inside React, Vue or nothing at all.
