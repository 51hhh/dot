# brainstorm: Studio flow spine layout

## Goal

Improve Plan Canvas Studio so workflow structure is readable without losing graph semantics. Flow steps should form a left-to-right macro process, while `single`, `multi`, `post`, and optional `dependency` relationships remain visible as real draggable nodes/edges instead of being collapsed into text-only card metadata.

## What I Already Know

- The current Studio uses React Flow and renders most Plan nodes and edges directly.
- The real `tmux` flow should read as seven macro steps: install, GitHub mirror, prefix, plugins, status, options, finalize.
- The existing Plan semantics and standalone generator should not be changed for this UI iteration.
- The previous compact-card projection was too lossy: it hid selectable/post nodes, removed per-node dragging, and made the canvas unable to explain `single`, `multi`, `flow`, `dependency`, and `post` at a glance.
- There are existing uncommitted overlay validation changes in `src/planner/overlay.ts`, `src/index.ts`, `src/loader/loader.ts`, `tests/planner.test.ts`, and `tests/cli.test.ts`; this work must preserve them.

## Requirements

- Add or revise the Studio-specific projection layer so it preserves graph semantics while improving layout.
- Render primary `flow` steps on a horizontal spine.
- Render `single` option nodes as a local vertical lane above or below their parent step, connected by visible `single` edges.
- Render `multi` option nodes as a local vertical lane above or below their parent step, connected by visible `multi` edges.
- Render `post` nodes as visible secondary nodes near the owning step, connected by visible `post` edges, but keep them out of the main flow spine.
- Keep dependency edges hidden by default; expose a toolbar toggle to show low-emphasis dashed dependency edges.
- Nested flow sections such as `tmux-plugins` may remain collapsed by default, but the collapsed parent must clearly expose that a subflow exists and expansion must render the nested flow as real draggable nodes/edges.
- Preserve left target/right source handles and layout save behavior for every visible node.
- Do not convert default `single`, `multi`, or `post` nodes into non-draggable chips. Chips/summary text may supplement the graph, but not replace the default visible nodes.
- Avoid edge chaos through placement, edge styling, and dependency toggles, not by deleting structure information.

## Acceptance Criteria

- [ ] `buildStudioGraph` exposes the real tmux seven-step primary spine.
- [ ] Default Studio graph omits dependency edges.
- [ ] Dependency toggle renders dependency edges with low visual emphasis.
- [ ] Single option nodes render as visible draggable nodes with `single` edges.
- [ ] Multi option nodes render as visible draggable nodes with `multi` edges.
- [ ] Post nodes render as visible draggable nodes with `post` edges and do not enter the main flow spine.
- [ ] `tmux-plugins` is collapsed by default and expandable into visible draggable nested-flow nodes/edges.
- [ ] Saving layout includes visible option/post/nested nodes, not only macro flow nodes.
- [ ] `npm test -- --run tests/studio.test.ts tests/planner.test.ts tests/cli.test.ts` passes.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Out of Scope

- Changing YAML schema semantics.
- Changing generated `dot.sh` execution behavior.
- Full visual end-to-end screenshot automation.
- Rewriting saved overlay file format beyond preserving existing support.

## Technical Notes

- Primary files: `src/studio/main.tsx`, `src/studio/studio.css`, `src/studio/projection.ts`, `tests/studio.test.ts`.
- Existing Plan contracts live in `.trellis/spec/frontend/type-safety.md` and runtime/state contracts in `.trellis/spec/frontend/state-management.md`.
