# overlay v2 migration design

## Goal

Design the overlay v2 schema and migration strategy needed before Plan Canvas becomes a constrained semantic editor.

## Problem

Overlay v1 supports positions, disabled ids, and limited node overrides. It is not expressive enough for dependency edits, ordering edits, enable/disable toggles, base conflict detection, or future `endFlow` edits.

## Requirements

- Produce a design doc for overlay v2.
- Reuse the Plan Canvas roadmap decisions.
- Define:
  - v1 compatibility
  - v2 schema
  - normalized internal model
  - migration from v1 to v2
  - atomic write and backup behavior
  - base config hash/conflict detection
  - validation and diagnostics
  - explicit enable/disable semantics
  - dependency and ordering patch model
  - how `endFlow` should be represented once plan model supports it
- Do not implement code yet.

## Suggested Write Set

- `.trellis/tasks/06-01-overlay-v2-migration-design/architecture.md`

## Avoid Touching

- `src/`
- `tests/`
- Studio visualization files
- generated scripts

## Acceptance Criteria

- [ ] Design includes concrete TypeScript-style schema.
- [ ] Design explains v1 parser compatibility and v2 save behavior.
- [ ] Design explains conflicts and stale node ids.
- [ ] Design identifies implementation subtasks.
- [ ] No source code changes.
