# bug: Studio draft editor layout fix

## Goal

Fix the Plan Canvas page so the graph remains the primary visible surface. The draft structure editor must not consume the canvas height by default, and valid saved root positions must not produce stale overlay warnings.

## What I already know

- The current Studio page renders the draft editor as the second child of `#canvas-panel`.
- `#canvas-panel` uses `grid-template-rows: auto 1fr`, so the draft editor receives the only flexible row and pushes React Flow below the viewport.
- `configs/dot.plan.json` stores a valid `__root` position.
- Overlay diagnostics currently validate positions only against config menu item ids, so `__root` is incorrectly reported as stale.

## Requirements

- Keep the Plan Canvas graph visible by default.
- Keep draft node editing available, but behind a compact toggle.
- Preserve existing draft add/update/remove/export behavior.
- Do not save draft-only nodes to the sidecar overlay.
- Treat `__root` as a valid overlay position id.

## Acceptance Criteria

- [ ] Studio opens with the graph viewport visible instead of draft forms filling the page.
- [ ] A toolbar toggle opens/closes the draft node editor.
- [ ] The stale warning for saved `__root` position is gone.
- [ ] Studio tests cover the layout guard and root overlay diagnostic behavior.
- [ ] Typecheck, lint, relevant tests, and build pass.

## Out of Scope

- Changing real YAML workflow structure.
- Reworking React Flow projection or routing.
- Direct semantic writes from Studio to `configs/dot.yaml`.

## Technical Notes

- Frontend files: `src/studio/main.tsx`, `src/studio/studio.css`, `tests/studio.test.ts`
- Overlay files: `src/planner/overlay.ts`, `tests/planner.test.ts`
- Existing local unrelated changes must be left alone: README/docs tasks and generated docs assets.
