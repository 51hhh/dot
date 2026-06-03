# fix: 修复 Studio Canvas 节点交融布局

## Goal

Improve Plan Canvas automatic layout so real install plan structure is readable without overlapping or visually intermixing unrelated branches. The screenshot shows Tmux and Zsh nodes occupying the same visual region, with long cross-canvas edges making the graph hard to read.

## What I already know

- The issue is visible in Studio Plan Canvas.
- The best first metric is not only edge crossing count. The layout must first prevent node overlap, keep top-level tool flows in separate lanes, and keep local single/multi/post branches near their owner.
- `InstallationPlan` remains the semantic source of truth; this task should not change YAML menu semantics or generated script behavior.
- Studio projection/layout tests already exist and should be extended.

## Requirements

- Keep root-level tool projects visually separated in vertical lanes.
- Keep each primary flow as a readable left-to-right spine.
- Keep local option/post branches near the owning parent without colliding with other tool lanes.
- Reduce long vertical/cross-canvas edges where practical.
- Do not persist semantic changes through layout or overlay.
- Add or update regression tests for layout bounds/overlap behavior.

## Acceptance Criteria

- [ ] No automatic layout overlap between projected nodes in the real `configs/dot.yaml` Studio graph.
- [ ] Root-level sections such as Tmux, Zsh, and SSH use distinct vertical bands.
- [ ] Existing Plan Canvas projection semantics still pass.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- [ ] Studio can be opened locally to inspect the improved layout.

## Out of Scope

- Editing YAML structure or generated script behavior.
- Implementing a full graph layout library migration unless the current layout cannot be fixed locally.
- Persisting semantic edge edits.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/type-safety.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
- Likely files:
  - `src/studio/projection.ts`
  - `src/studio/main.tsx`
  - `src/studio/studio.css`
  - `tests/studio.test.ts`
