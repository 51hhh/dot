# plan canvas editor roadmap

## Goal

Define the next-stage editable Plan Canvas model without destabilizing the current Studio viewer/layout work.

## Problem

Current Studio is closer to a plan viewer plus layout saver. A true editor needs stronger contracts before allowing users or AI to modify nodes, dependencies, order, post flags, and modes.

## Requirements

- Produce an implementation roadmap for editable Canvas features:
  - node metadata editing
  - edge/dependency editing
  - order/flow editing
  - post/end-flow editing
  - undo/redo
  - invalid plan diagnostics display
  - overlay migration/versioning
  - conflict/save failure handling
- Define which edits belong in overlay versus source YAML.
- Define a permission/safety model for what Studio may edit.
- Identify what must wait until the source-of-truth task is complete.
- No production code changes unless a small doc or spec update is clearly needed.

## Suggested Write Set

- `.trellis/tasks/06-01-plan-canvas-editor-roadmap/architecture.md`
- `docs/` if useful
- `.trellis/spec/frontend/` only if new durable frontend conventions are discovered

## Avoid Touching

- Runtime source code
- generated scripts
- Studio implementation files

## Acceptance Criteria

- [ ] Roadmap distinguishes viewer, layout editor, constrained plan editor, and full source editor phases.
- [ ] Roadmap defines overlay schema evolution risks.
- [ ] Roadmap defines validation and diagnostics UX.
- [ ] Roadmap identifies which future tasks can run independently.

## Notes

This is intentionally design-first. It should inform later tasks, not race the current Studio implementation.
