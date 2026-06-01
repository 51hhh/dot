# refactor: split bash runtime modules

## Goal

Split `src/generator/standalone/bash-runtime.ts` into smaller runtime template modules without changing generated script behavior.

## Problem

The first assembler refactor moved the large bash runtime string out of `standalone-assembler.ts`, but `bash-runtime.ts` still mixes terminal TUI, prompt handling, GitHub download helpers, plan construction, execution, summary, and dry-run behavior.

## Scope

Allowed source changes:

- `src/generator/standalone/bash-runtime.ts`
- new files under `src/generator/standalone/runtime/`
- `src/generator/standalone/index` style exports only if needed
- focused tests in `tests/assembler.test.ts` and `tests/cli.test.ts`

Avoid changing generated runtime behavior except for formatting that is invisible to users and covered by tests.

## Requirements

- Extract runtime sections into clear modules such as terminal, github, prompt, selection, planning, execution, dry-run.
- Keep `generateBashRuntime()` as the public assembly function.
- Preserve current generated script behavior and `--dry-run-plan` output.
- Keep runtime snippets centralized under `src/generator/standalone/`.

## Acceptance Criteria

- [ ] `bash-runtime.ts` becomes a small orchestrator.
- [ ] Tests prove generated runtime still contains required functions.
- [ ] `npm test -- tests/assembler.test.ts tests/cli.test.ts` passes.
- [ ] Full generated build and `bash -n dist/dot.sh` pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/bash-runtime-second-split` and branch `task/bash-runtime-second-split`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
