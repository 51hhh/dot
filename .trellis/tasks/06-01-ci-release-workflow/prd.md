# ci release workflow hardening

## Goal

Add or design a minimal CI/release workflow that verifies the current generator pipeline and publishes the generated `dist/dot.sh` artifact safely.

## Problem

Docs now describe a release artifact flow, but `.github/workflows/` does not yet contain the actual CI/release automation. The project needs a reproducible quality gate that builds the CLI, runs tests, generates `dist/dot.sh`, validates it with `bash -n`, and runs the dry-run smoke path.

## Requirements

- Add a minimal GitHub Actions workflow, or if implementation is blocked, write a detailed workflow design doc.
- CI should run:
  - `npm ci`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet`
  - `bash -n dist/dot.sh`
  - `bash dist/dot.sh --dry-run-plan --select tmux-plugin-resurrect tmux-tpm-finalize`
- Release path should upload `dist/dot.sh` as an artifact at minimum.
- Do not edit application source.

## Suggested Write Set

- `.github/workflows/ci.yml` or `.github/workflows/release.yml`
- optionally `docs/release.md` if a tiny alignment note is needed

## Avoid Touching

- `src/`
- `tests/`
- Studio visualization files
- existing README unless unavoidable

## Acceptance Criteria

- [ ] Workflow is syntactically plausible and uses maintained GitHub Actions.
- [ ] Workflow does not require secrets for normal CI.
- [ ] Artifact path is `dist/dot.sh`.
- [ ] Workflow includes generated script dry-run smoke.
- [ ] No source code changes.
