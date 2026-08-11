# Contributing

Thanks for your interest. [日本語版](./CONTRIBUTING.ja.md)

## Getting set up

```bash
pnpm install
pnpm test        # Vitest, including property-based tests
pnpm typecheck
pnpm lint        # Biome; pnpm lint:fix to apply
pnpm build
pnpm size        # gzip report against the size targets

pnpm dev:vanilla # the framework-free example
pnpm dev:react   # the React example
pnpm docs:dev    # the documentation site, running the packages from source
```

Node 20 or newer, and pnpm. Tests resolve the workspace packages to their
sources, so you never need to build before running them.

## The four invariants

Before changing anything in `core` or `ui`, know these. They are not style
preferences — the library's performance and accessibility claims rest on them,
and a change that breaks one is a change to what the library is.

1. **The canvas never draws UI.** Selection boxes, handles and guides are DOM
   elements. Drawing them into the canvas would make them impossible to restyle
   and invisible to assistive technology.
2. **Unselected shapes get no control DOM.** Ten thousand shapes still means a
   handful of control elements. Anything that scales DOM nodes with document
   size breaks this.
3. **The viewport transform is written once per frame, to one element.** The
   overlay container carries it; children are positioned in world coordinates.
4. **Handle sizes are corrected through the `--hc-zoom` CSS variable**, not by
   writing a size onto each element from JavaScript — which would undo the point
   of invariant 3.

There are tests for all four in `packages/ui/test/invariants.test.ts`. If a
change makes them fail, the change is wrong, not the tests.

## What is deliberately out of scope

Please open an issue to discuss before building any of these:

- Feature parity with Fabric.js
- A rich-text editing engine
- Image filters and effects
- Application chrome: toolbars, colour pickers, layer panels

HeadlessCanvas is an engine, not an application. The line is drawn at "does this
belong in every editor built on top of it?"

## Adding a shape

Shapes are registered, and the built-ins use exactly the same mechanism — there
is no privileged path. Implement `ShapeUtil` and register it:

```ts
const wallUtil: ShapeUtil<WallShape> = {
  type: 'wall',
  propsVersion: 1,
  getDefaultProps: () => ({ thickness: 8 }),
  render(shape, ctx, info) { /* ... */ },
  hitTest(shape, point, tolerance) { /* ... */ },
}
```

`hitTest` must not use a 2D context — the hit tester does not have one. Test
geometry directly, as `packages/core/src/shape/shapes/path.ts` does.

Give the shape a `propsVersion` from the start. Once it ships, its props will
change, and a migration path added afterwards cannot rescue documents already
written.

## Adding a tool

Tools own an interaction mode. Implement `Tool` and register it:

```ts
editor.tools.register('place', (editor) => new PlaceTool(editor))
```

Anything a tool changes during a gesture should go through
`editor.setEphemeral()` and land with `editor.commitEphemeral()`. Writing to the
document on every pointer move rebuilds the state tree per frame and turns one
gesture into hundreds of undo steps.

## Style

- Biome handles formatting and linting. `pnpm lint:fix` before pushing.
- `core` has **no runtime dependencies**. Adding one needs a strong argument.
- Comments explain *why*, not *what*. If a piece of code looks odd, say what
  goes wrong without it.
- Everything in this repository is written in English: identifiers, comments,
  commit messages, and documentation. Japanese translations live alongside the
  English originals with a `.ja` suffix, and both are updated in the same commit.

## Tests

- Maths and ordering are covered by property-based tests (`fast-check`). Prefer
  a property over a handful of examples where one exists.
- Interaction is tested through real pointer and keyboard events, not by calling
  internals. See `packages/ui/test/tools.test.ts`.
- Performance guards assert the *shape* of the work — that culling drops
  off-screen shapes, that dragging does not touch committed state — rather than
  wall-clock times, which are not reproducible in CI.

## Releases

Changesets. Add one with `pnpm changeset` describing the change from a user's
point of view.

The public API includes the CSS contract: class names, `data-hc-*` attributes
and the documented custom properties. Renaming one is a breaking change.

## Code of conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
