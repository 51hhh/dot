# planner: implement overlay v2 migration

## Goal

Implement the overlay v2 parser, migration, normalized model, and conflict diagnostics described in the overlay v2 design task.

## Problem

Overlay v1 can store positions, disabled ids, and basic overrides, but cannot represent enabling, dependency patches, ordering patches, base config conflict detection, or stale id diagnostics. It also collapses `disabled` and `hidden` intent.

## Scope

Allowed source changes:

- `src/planner/overlay.ts`
- `src/planner/resolve-plan.ts`
- `src/planner/validate-plan.ts`
- `src/studio/server.ts` only for API compatibility and diagnostics return shape
- focused tests in `tests/planner.test.ts` and `tests/cli.test.ts`
- docs updates only if required to explain new overlay format

Avoid touching Studio visualization layout files unless absolutely required.

## Requirements

- Support v1 parser compatibility and v1-to-normalized migration.
- Add v2 schema with base config hash, node patches, dependency patches, ordering patches, and distinct `disabled` vs `hidden`.
- Detect stale node ids and surface diagnostics instead of silently ignoring them.
- Add atomic write or backup policy for save-as-v2.
- Preserve existing v1 overlays and current Studio save behavior during migration.
- Re-resolve config plus normalized overlay before build/studio responses.

## Acceptance Criteria

- [ ] v1 overlays still load.
- [ ] v2 overlays load, validate, and normalize.
- [ ] stale ids produce diagnostics.
- [ ] base config hash conflicts are detectable.
- [ ] save path does not corrupt an existing overlay on write failure.
- [ ] Relevant tests pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/overlay-v2-implementation` and branch `task/overlay-v2-implementation`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
