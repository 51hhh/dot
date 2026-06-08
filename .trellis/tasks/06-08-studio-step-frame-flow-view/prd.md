# implement: Studio step-frame flow view

## Goal

Change Studio's default flow visualization from a generic node-link graph into a workflow-oriented step-frame view. Ordered workflow steps should be shown as framed stages, and each stage should contain its single/multi/post options instead of turning every option into a primary flow node.

## Requirements

- Keep YAML and generated runtime behavior unchanged in this task.
- Keep React Flow as the rendering surface.
- Render tool workflows as ordered step frames.
- Render single/multi/post options inside their owning step frame.
- Keep dependency edges hidden by default and available for diagnostics/debugging.
- Keep existing draft node/edge export controls usable.
- Avoid direct semantic writes to `configs/dot.yaml`.

## Acceptance Criteria

- [ ] The default Studio view shows tool workflows as step frames, not long chains of option nodes.
- [ ] Flow edges connect major steps, while option nodes are visually grouped inside the step frame.
- [ ] Large option sets wrap inside the frame instead of forming long vertical node lists.
- [ ] Existing draft export and layout save behavior still works.
- [ ] Studio tests cover the step-frame projection and layout contract.
- [ ] Typecheck, lint, tests, build, and generated script syntax checks pass.

## Out of Scope

- Runtime branching or scenario engine changes.
- New YAML schema for workflow/action/precheck.
- Direct source editing from Studio.
- Full precheck/conflict model.

## Technical Notes

- Primary files: `src/studio/projection.ts`, `src/studio/main.tsx`, `src/studio/studio.css`, `tests/studio.test.ts`.
- Current projection already derives primary flow spines and local option lanes.
- This task should alter Studio projection/presentation first, then later tasks can standardize authoring and runtime prechecks.
