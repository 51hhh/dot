# add generated script noninteractive smoke tests

## Goal

Make generated `dot.sh` behavior testable in CI without requiring manual terminal interaction.

## Problem

Current tests mostly verify generated output with string assertions and `bash -n`. That catches syntax and presence of runtime sections, but not enough real behavior: flow navigation, plan building, post ordering, prompt defaults, and preset-like execution are hard to validate.

## Requirements

- Add a deterministic noninteractive mode for generated scripts.
- Keep normal interactive behavior unchanged.
- Preferred interface:
  - `bash dot.sh --dry-run-plan --select <ids...>` or
  - environment-driven equivalent such as `DOT_PRESET=... bash dot.sh --dry-run-plan`
- The mode should print the resolved execution plan and exit before running installation snippets.
- Include dependencies and post steps in the output.
- Add CI-friendly tests that build a script, run the noninteractive path, and assert ordering.

## Suggested Write Set

- `src/generator/standalone-assembler.ts` or modularized runtime files
- `tests/cli.test.ts`
- `tests/assembler.test.ts`
- optionally `tests/integration/`

## Avoid Touching

- Studio UI files
- overlay API files
- README except minimal usage note if docs task has not started

## Acceptance Criteria

- [ ] Generated script supports a noninteractive plan preview path.
- [ ] Normal `bash dot.sh` interactive entry remains unchanged.
- [ ] Smoke test proves dependency inclusion.
- [ ] Smoke test proves post steps print after normal steps.
- [ ] Generated script still passes `bash -n`.

## Sequencing

This should start after or in coordination with the assembler modularization task. If both run in parallel, only one agent should own runtime code and the other should focus on test design.
