# security: enforce template trust boundary

## Goal

Make the executable template boundary explicit and enforce the chosen trusted-template policy.

## Problem

Configs can reference local files through `script` paths, and those files are embedded into generated bash. This is intentional for trusted local templates, but the current boundary is undocumented and not enforced beyond file existence.

## Scope

Allowed source/docs changes:

- `src/loader/schema.ts`
- `src/loader/loader.ts`
- `src/generator/template.ts`
- `src/generator/standalone/snippets.ts`
- `docs/architecture.md`
- `README.md`
- focused tests in `tests/assembler.test.ts`, `tests/cli.test.ts`, and loader tests

Avoid touching Studio visualization files.

## Requirements

- Decide and document whether `script` paths may resolve outside configured template roots.
- If enforcement is added, preserve existing `configs/dot.yaml` behavior through an explicit allowed root policy.
- Error messages must include the rejected resolved path and the allowed template root decision.
- Legacy dry-run behavior must not accidentally disclose arbitrary local files if configs are treated as untrusted.

## Acceptance Criteria

- [ ] Template trust model is documented in README or architecture docs.
- [ ] Loader/generator rejects or clearly warns on paths outside the allowed policy.
- [ ] Existing tmux templates still build.
- [ ] Tests cover allowed relative template paths and rejected arbitrary local-file paths.

## Worktree Prompt

Use `/home/rick/desktop/dot/.worktrees/template-trust-boundary` and branch `task/template-trust-boundary`.

Rules: execute directly, do not call subagents, modify only allowed files, and report worktree path, branch, modified files, checks, and diff or commit hash.
