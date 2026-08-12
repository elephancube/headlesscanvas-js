# @headless-canvas/react

## 0.1.1

### Patch Changes

- bfc1de3: Published with provenance. The code is identical to 0.1.0.

  The 0.1.0 tarballs carry only npm's registry signature: the release workflow
  asked for provenance through an environment variable that pnpm does not read.
  An attestation cannot be added to a version after it is published, so this
  release exists to carry one — npm will show which commit and workflow built
  each tarball, and the packages are now published without any long-lived token.

- Updated dependencies [bfc1de3]
  - @headless-canvas/core@0.1.1
  - @headless-canvas/ui@0.1.1

## 0.1.0

### Minor Changes

- d65a4c2: First public preview.

  A canvas editor engine whose selection handles are DOM elements: they can be
  restyled with CSS, replaced entirely with your own markup, and reached by
  assistive technology — none of which is possible when the controls are painted
  into the canvas.

  - **Shapes** — rectangle, ellipse, line, path, text, image and group, all
    registered through the same `ShapeUtil` interface available to applications.
  - **Editing** — select, move, resize, rotate, marquee select, group and reorder,
    with undo/redo, grid and object snapping. Freehand drawing produces ordinary
    paths, simplified and smoothed on release.
  - **Documents** — JSON serialisation with a schema version and per-shape props
    migrations, optionally carrying its images inline so a file stands alone.
    Unregistered shape types are preserved rather than discarded, so removing a
    plugin never destroys data.
  - **Export** — PNG and JPEG at any scale, with a typed error naming the
    cross-origin images responsible when the canvas has been tainted; and SVG,
    where each shape contributes its own outline through the same registry, so
    application shapes export on the same terms as the built-in ones.
  - **Customisation** — use the default UI, restyle it with CSS, or build your own
    controls on the same primitives the default UI uses.
  - **Accessibility** — keyboard-operable handles, a virtualised shape list that
    can be navigated without a pointer, and live-region announcements.

  `@headless-canvas/core` and `@headless-canvas/ui` have no runtime dependencies.

### Patch Changes

- Updated dependencies [d65a4c2]
  - @headless-canvas/core@0.1.0
  - @headless-canvas/ui@0.1.0
