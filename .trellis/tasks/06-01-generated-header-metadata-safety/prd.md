# security: sanitize generated header metadata

## Goal

Prevent config metadata from breaking generated script headers or injecting confusing shell/comment content.

## Problem

The generated standalone header includes config `name`, `version`, and optional `description`. These are trusted project metadata today, but newline/control characters can produce misleading generated headers and make audits harder.

## Scope

Allowed source changes:

- `src/generator/standalone/header.ts`
- `src/loader/schema.ts`
- `src/loader/loader.ts`
- focused tests in `tests/assembler.test.ts`, `tests/schema.test.ts`, and `tests/cli.test.ts`

Avoid touching Studio visualization files.

## Requirements

- Header metadata must be normalized or rejected consistently.
- Generated shebang and header comment block must remain valid and readable.
- Preserve normal Unicode/Chinese labels where the repo already uses them in user-facing text.
- Do not over-sanitize menu labels used inside TUI metadata unless tests show the same issue there.

## Acceptance Criteria

- [ ] Header metadata with newlines/control characters is rejected or safely rendered.
- [ ] Normal config metadata still builds.
- [ ] Tests cover newline, carriage return, ANSI escape, and normal descriptions.
- [ ] `bash -n dist/dot.sh` passes.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/generated-header-metadata-safety` and branch `task/generated-header-metadata-safety`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
