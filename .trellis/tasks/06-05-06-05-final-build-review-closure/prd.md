# PRD: Final Build and Review Closure

## Goal

Close the current implementation cycle by running the complete verification gate, reviewing the latest repository state, and recording the outcome in Trellis.

## Scope

- Verify the current `master` working tree after the recent runtime input and Zsh reliability fixes.
- Run type checking, linting, tests, package build, generated script validation, and focused generated-script dry-runs.
- Review changed files and recent commits for remaining correctness or consistency issues.
- Record verification results and completion status in this task.

## Non-goals

- Do not add new product behavior unless verification exposes a blocking defect.
- Do not call subagents.
- Do not change unrelated worktree branches or revert other users' changes.

## Acceptance Criteria

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes with the requested permission path.
- `dist/dot.sh` is regenerated and passes `bash -n`.
- Focused dry-run checks cover Tmux, Zsh, and ambiguous single-choice selection behavior.
- Final review reports either concrete findings or explicitly states that no blocking issues were found.
- Task metadata is marked complete after verification.

## Verification Results

- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 11 files / 161 tests.
- `npm run build`: passed with requested elevated permission path.
- `bash -n dist/dot.sh`: passed.
- `bash dist/dot.sh --dry-run-plan --select tmux-plugin-resurrect tmux-tpm-finalize`: passed and preserved normal-before-post ordering.
- `bash dist/dot.sh --dry-run-plan --select zsh-install-apt zsh-oh-my-zsh-install zsh-zshrc-minimal`: passed.
- `bash dist/dot.sh --dry-run-plan --select zsh`: failed as expected with the explicit single-choice ambiguity error.

## Review Outcome

Review found related reliability issues in execution-time confirmation and generated prompt value handling:

- `templates/zsh/uninstall-apt-remove.sh`, `templates/ssh/disable-password.sh`, and `templates/ssh/limit-users.sh` read confirmations from stdin before consulting the standalone runtime input source. A real `curl | bash` session could navigate the TUI from `/dev/tty` but fail or misclassify later confirmation prompts.
- Prompt-backed templates with empty defaults, such as SSH `allowed_users`, `pubkey_path`, and `github_user`, compiled to static empty strings and could ignore values collected into `DOT_VARS`.

The issues were fixed by reading through `dot_read_line` when the standalone runtime helper exists, falling back to `/dev/tty`, and using stdin only as a final local-script fallback. Standalone snippet rendering now emits `dot_get_var_or_default` for prompt placeholders even when the fallback is empty. Regression tests cover Zsh and SSH confirmation reads through `DOT_INPUT_FD=0`, plus generated SSH prompt-value serialization. The contracts were recorded in `.trellis/spec/frontend/state-management.md` and `.trellis/spec/frontend/type-safety.md`.
