# refresh docs and release pipeline

## Goal

Update user/developer documentation and release flow so the project description matches the current `build`, `plan`, `studio`, and self-contained `dot.sh` architecture.

## Problem

README still describes the older numeric menu/generate workflow. Current project behavior includes standalone build, plan rendering, Studio Canvas, overlay files, and release artifact expectations.

## Requirements

- Update README to describe:
  - project purpose
  - architecture overview
  - `dot build`
  - `dot plan`
  - `dot studio`
  - sidecar `.plan.json` overlay behavior
  - generated `dist/dot.sh` usage
  - development quality commands
- Add or update release artifact notes:
  - build package
  - generate `dist/dot.sh`
  - syntax check
  - smoke test when available
- If `.github` workflow files exist or are intended, add a minimal CI/release workflow plan or implementation consistent with existing repo style.

## Suggested Write Set

- `README.md`
- `docs/`
- `.github/workflows/` if adding CI/release automation

## Avoid Touching

- `src/`
- `tests/` unless adding docs-only checks

## Acceptance Criteria

- [ ] README no longer centers old hidden `generate` behavior.
- [ ] Commands in README match actual CLI.
- [ ] Docs explain the Config -> Overlay -> Plan -> Build contract.
- [ ] Release flow documents `dist/dot.sh` as the user-facing artifact.
- [ ] No code behavior changes.

## Notes

This task can run in parallel with most implementation work because its write set is mostly docs. It should be reviewed after core contracts settle to avoid documenting a moving target.
