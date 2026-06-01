# validation: reject unsafe ids at loader boundary

## Goal

Move shell-safe id validation from the standalone assembler into loader semantic validation while keeping assembler defense in depth.

## Problem

Generated bash requires ids matching `^[A-Za-z0-9_-]+$`. Today this is enforced late in standalone assembly, so other consumers can accept unsafe ids until build time.

## Scope

Allowed source changes:

- `src/loader/loader.ts`
- `src/loader/schema.ts`
- `src/generator/standalone/ids.ts`
- focused tests in `tests/schema.test.ts`, `tests/planner.test.ts`, `tests/assembler.test.ts`, and `tests/cli.test.ts`

Avoid touching Studio visualization files unless a test requires only reading output.

## Requirements

- Loader semantic validation must reject unsafe ids for every menu node.
- Error messages must name the offending id and accepted character set.
- Assembler id validation remains as a defensive check.
- Existing configs must pass unchanged.

## Acceptance Criteria

- [ ] Unsafe ids fail during `loadConfig`/semantic validation.
- [ ] Tests cover spaces, dots, semicolons, brackets, quotes, and leading/trailing valid ids.
- [ ] Planner/build behavior remains unchanged for valid ids.
- [ ] Relevant tests and generated script syntax checks pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/shell-safe-id-loader-validation` and branch `task/shell-safe-id-loader-validation`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
