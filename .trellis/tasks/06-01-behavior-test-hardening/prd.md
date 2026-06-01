# testing: behavior tests replacing source string assertions

## Goal

Replace brittle source-string assertions with behavior-oriented tests where the project already has stable public contracts.

## Problem

Several tests inspect source text for function names or snippets. These tests are useful as guardrails during rapid development, but they create friction during refactors and do not always prove behavior.

## Scope

Allowed test changes:

- `tests/assembler.test.ts`
- `tests/cli.test.ts`
- `tests/planner.test.ts`
- `tests/studio.test.ts`
- small test helpers under `tests/` if useful

Allowed source changes only when needed to expose pure functions for testing:

- `src/generator/standalone/*`
- `src/studio/projection.ts`
- `src/planner/*`

Avoid feature changes.

## Requirements

- Prefer generated-script execution, exported pure helpers, and plan/projection outputs over `source.includes(...)` checks.
- Keep a few source-string checks only where they protect emitted bash function names or CLI contract text that has no better test seam.
- Do not reduce coverage of dry-run plan, overlay validation, or Studio projection behavior.

## Acceptance Criteria

- [ ] At least one brittle source-string test is replaced by a behavioral assertion.
- [ ] No behavior coverage is lost.
- [ ] Relevant tests pass.
- [ ] Any new helper exports are justified and focused.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/behavior-test-hardening` and branch `task/behavior-test-hardening`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
