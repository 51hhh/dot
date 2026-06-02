# fix: docker smoke standalone runtime helpers

## Goal

Restore the Docker integration smoke test so it exercises the current generated runtime contract instead of the deprecated `dot --dry-run --select` snippet path.

## What I already know

* `npm run test:docker` runs `tests/integration/docker-test.sh`.
* The test matrix currently generates scripts via `tests/integration/generate.mjs`.
* `generate.mjs` calls `node dist/index.js --config configs/tmux.yaml --select ... --quiet --dry-run`.
* The generated snippet script fails in Ubuntu with `dot_sudo: command not found`.
* Current template snippets are intended to run inside the standalone generated runtime, which defines helpers such as `dot_sudo`.
* The standalone script path already supports `--dry-run-plan --select ...` for noninteractive plan validation, but Docker smoke needs noninteractive execution of selected snippets.

## Requirements

* Docker smoke must run selected tmux snippets inside the current standalone runtime helpers.
* The fix must keep the generated script self-contained.
* The test should keep validating real execution in an Ubuntu container, not just dry-run planning.
* Avoid changing user-facing interactive TUI behavior.
* Keep the change focused on integration generation/runtime entry behavior.

## Acceptance Criteria

* `npm run test:docker` exits 0 when Docker and network are available.
* `npm run test:coverage` continues to pass under elevated permissions.
* `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.
* `bash dist/dot.sh --dry-run-plan --select tmux-plugin-resurrect tmux-tpm-finalize` remains noninteractive and passes.

## Out of Scope

* Reworking all Docker test assertions.
* Adding rollback/retry behavior to the generated installer.
* Changing tmux template contents beyond what is necessary for the smoke test path.

## Technical Notes

* Likely files:
  * `tests/integration/generate.mjs`
  * `src/generator/standalone/runtime/*`
  * `tests/integration/docker-test.sh` if assertion wiring needs adjustment
* Failure observed:
  * `/tmp/setup.sh: line 36: dot_sudo: command not found`
  * `/tmp/setup.sh: line 38: return: can only 'return' from a function or sourced script`
