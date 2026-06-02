# security: make generated prompt substitution shell-safe

## Goal

Make runtime prompt values in generated `dot.sh` behave as data, not generated shell syntax.

## Problem

The runtime security audit found that prompt-backed template values are currently emitted through shell parameter expansion inside rendered snippets. This is fragile because runtime input can contain shell metacharacters, quotes, command substitutions, or newline/control characters.

## Scope

Allowed source changes:

- `src/generator/standalone/snippets.ts`
- `src/generator/standalone/bash-runtime.ts`
- `src/loader/schema.ts`
- `src/loader/loader.ts`
- focused tests in `tests/assembler.test.ts`, `tests/cli.test.ts`, and schema/loader tests if needed

Avoid touching Studio visualization files.

## Requirements

- Prompt values must be substituted into snippets through a shell-safe data path.
- Prompt variable names must be validated before generation.
- Existing `key` and `key-compose` behavior must keep working.
- Unsupported or unsafe prompt types must fail before `dist/dot.sh` is written.
- Tests must cover prompt fallbacks containing `$()`, backticks, single quotes, double quotes, semicolons, spaces, and newlines.

## Acceptance Criteria

- [ ] Generated bash remains valid under `bash -n`.
- [ ] A malicious prompt fallback cannot execute as shell code.
- [ ] Runtime prompt values are consumed safely by generated snippet functions.
- [ ] `npm run typecheck`, `npm run lint`, and relevant tests pass.
- [ ] `node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet` and `bash -n dist/dot.sh` pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/prompt-substitution-safety` and branch `task/prompt-substitution-safety`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
