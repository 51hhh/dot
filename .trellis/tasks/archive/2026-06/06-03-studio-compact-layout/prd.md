# fix: 压缩 Studio Canvas 布局连线

## Goal

Make the fully expanded Plan Canvas readable at a practical zoom level by reducing excessive projection spacing and long edges.

## What I Already Know

- The current low zoom is now sufficient to see the whole graph, but text becomes unreadable because the graph is too spread out.
- `src/studio/projection.ts` uses large fixed layout constants, including a `SPINE_SPACING` of 1060 and a `NESTED_FLOW_OFFSET` of 1700.
- Existing tests already cover no overlap, branch wrapping, root-level bands, and primary/local edge crossing.

## Requirements

- Keep all nodes visible by default; do not solve this by collapsing modules.
- Compress horizontal spine spacing so flow edges are materially shorter.
- Compress expanded nested-flow placement so expanded groups stay visually near their parent.
- Keep local branch nodes clear of the next primary flow column.
- Keep existing no-overlap and no-crossing behavior.
- Keep low zoom support, but avoid relying on extreme zoom for basic readability.

## Acceptance Criteria

- [x] The default real `configs/dot.yaml` Studio projection width is bounded by a test.
- [x] Root-to-module and adjacent spine edge lengths are bounded by tests.
- [x] Existing Studio projection overlap, branch-clearance, wrapping, and crossing tests still pass.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Out of Scope

- Replacing React Flow.
- Adding a new graph layout engine.
- Changing plan semantics, YAML config, or generated bash behavior.
- Collapsing top-level tools to reduce graph size.

## Technical Notes

- Main target: `src/studio/projection.ts`.
- Tests target: `tests/studio.test.ts`.
- Relevant specs: frontend component guidelines and Studio flow spine projection contract.
