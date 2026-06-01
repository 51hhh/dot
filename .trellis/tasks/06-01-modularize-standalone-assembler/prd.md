# modularize standalone bash assembler

## Goal

Reduce maintenance risk in `src/generator/standalone-assembler.ts` by separating the generated bash runtime, data serialization, snippet rendering, and behavior tests while preserving generated `dot.sh` behavior.

## Problem

The current standalone assembler is over 1100 lines and mixes multiple responsibilities:

- bash runtime string
- TypeScript data serialization
- shell-safe IDs and function names
- template rendering
- prompt value replacement
- flow/post/dependency behavior
- execution summary

This makes small fixes risky and makes code review difficult.

## Requirements

- Split the file in small, behavior-preserving steps.
- Keep public `assembleStandalone(opts)` API stable unless a coordinated plan-source task changes it.
- Move bash runtime into a dedicated module or template file with clear snapshot/golden coverage.
- Move data serialization into a testable TypeScript function.
- Move snippet function rendering into a separate helper.
- Add tests around serialization output and generated script syntax.
- Do not change TUI behavior in this task unless needed to preserve current behavior after split.

## Suggested Write Set

- `src/generator/standalone-assembler.ts`
- new files under `src/generator/standalone/` or equivalent
- `tests/assembler.test.ts`
- optionally focused snapshot/golden fixtures under `tests/fixtures/`

## Avoid Touching

- Studio files
- overlay API files
- README/release workflow files
- large config semantics changes

## Acceptance Criteria

- [ ] `standalone-assembler.ts` becomes an orchestration layer rather than the home of all runtime logic.
- [ ] Generated `dist/dot.sh` remains bash-syntax valid.
- [ ] Existing assembler tests pass.
- [ ] New tests cover data serialization separately from runtime string assembly.
- [ ] No user-facing generated-script behavior intentionally changes.

## Sequencing

Start after `build-plan-source` lands or coordinate directly with it. This task owns `standalone-assembler.ts`, so avoid concurrent generator edits.
