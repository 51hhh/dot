# studio: diagnostics and conflict UX

## Goal

Show plan/overlay diagnostics and save conflicts in Studio without corrupting overlay state.

## Problem

The server now validates overlay writes, but Studio UI does not yet present diagnostics, stale id warnings, or save conflicts in a structured way. Overlay v2 will make this more important.

## Scope

Allowed source changes:

- `src/studio/server.ts`
- `src/studio/main.tsx`
- `src/studio/studio.css`
- `src/studio/projection.ts` only if diagnostics affect projection metadata
- focused tests in `tests/planner.test.ts` and `tests/studio.test.ts`

Coordinate carefully with any active visualization work. Do not run this in parallel with another task touching the same Studio files.

## Requirements

- GET `/api/plan` should expose diagnostics already present in the resolved plan.
- Save failures should produce actionable UI status without mutating local UI state as saved.
- Conflict/stale diagnostics should be visible without blocking read-only plan inspection.
- Keep the current flow-spine projection behavior intact.

## Acceptance Criteria

- [ ] Invalid save response renders a visible error/status.
- [ ] Plan diagnostics are visible in Studio.
- [ ] Successful save status remains clear.
- [ ] Existing Studio projection tests still pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/studio-diagnostics-conflict-ux` and branch `task/studio-diagnostics-conflict-ux`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
