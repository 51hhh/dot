# security: document GitHub mirror integrity policy

## Goal

Make third-party GitHub mirror trust and future integrity verification explicit in generated installer UX and project docs.

## Problem

The generated runtime can use hard-coded mirror prefixes for GitHub downloads/clones. This improves connectivity but treats mirror endpoints as trust roots for archives and git content.

## Scope

Allowed changes:

- `src/generator/standalone/bash-runtime.ts`
- `templates/tmux/github-mirror-select.sh`
- `README.md`
- `docs/architecture.md`
- `docs/release.md`
- focused tests in `tests/assembler.test.ts` and `tests/cli.test.ts`

Avoid changing mirror ordering or network behavior unless needed for the warning/policy.

## Requirements

- Add concise user-facing warning when selecting or using third-party mirrors.
- Document that mirrors can observe/serve content and checksums/signatures are a future hardening direction.
- Do not remove mirror support.
- Keep generated script output usable for normal users.

## Acceptance Criteria

- [ ] Generated runtime or mirror-selection template communicates mirror trust tradeoff.
- [ ] README/docs explain current integrity policy.
- [ ] Tests assert warning text or helper presence without coupling to long localized paragraphs.
- [ ] Generated build and `bash -n dist/dot.sh` pass.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/github-mirror-integrity-policy` and branch `task/github-mirror-integrity-policy`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
