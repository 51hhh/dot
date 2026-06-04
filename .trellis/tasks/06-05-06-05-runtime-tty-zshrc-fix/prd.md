# fix: runtime tty input and zshrc reliability

## Goal

Fix the current generated bash runtime regression where interactive tests fail after input reads were moved to `/dev/tty`, while keeping the intended interactive behavior for scripts launched with redirected stdin. Also harden Zsh zshrc writing so users cannot easily create a broken `~/.zshrc` after choosing to skip Oh My Zsh.

## What I already know

- Current working tree has uncommitted changes in `src/generator/standalone/runtime/dry-run.ts`, `prompt.ts`, and `terminal.ts`.
- `npm test` currently fails in `tests/assembler.test.ts` because tests inject input through stdin, but runtime reads keys and prompts from `/dev/tty`.
- `npm run typecheck` and `npm run lint` passed during review.
- `npm run build` passes outside the sandbox and regenerates `dist/dot.sh`; sandboxed build fails because generated script validation spawns `bash`.
- Zsh flow allows `zsh-oh-my-zsh-skip` followed by `zsh-zshrc-recommended` or `zsh-zshrc-minimal`; these scripts can write an Oh My Zsh `source` line without ensuring the file exists.

## Requirements

- Preserve `/dev/tty` as the default interactive input source for real generated scripts.
- Provide a deterministic test input path so generated bash interaction tests can run without a real TTY.
- Make key, text, and number prompt reads use one consistent runtime helper or input-device policy.
- Harden recommended and minimal zshrc writes against missing Oh My Zsh.
- Add or update tests for the runtime input policy and Zsh zshrc guard.
- Do not revert existing uncommitted changes unless they are directly superseded by the fix.

## Acceptance Criteria

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes when run with required non-sandbox permission.
- [x] `bash -n dist/dot.sh` passes.
- [x] Generated interactive tests can still inject keys deterministically.
- [x] Zsh recommended/minimal zshrc does not write an unguarded Oh My Zsh source line when Oh My Zsh is missing.

## Out of Scope

- Reworking Studio layout.
- Changing release/CI command structure.
- Adding a full PTY test harness unless a smaller input-device hook is insufficient.

## Technical Notes

- Relevant files: `src/generator/standalone/runtime/terminal.ts`, `src/generator/standalone/runtime/prompt.ts`, `tests/assembler.test.ts`, `templates/zsh/zshrc-recommended.sh`, `templates/zsh/zshrc-minimal.sh`, and generated-script assertions in `tests/cli.test.ts`.
