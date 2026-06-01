# harden build plan as source of truth

## Goal

Make `InstallationPlan` the explicit resolved contract used by CLI preview, Studio, validation, and standalone build.

## Problem

`assembleStandalone` already accepts `plan?: InstallationPlan`, but `runBuild` currently applies overlay to config and then generates from config/allNodes without passing the resolved plan. This works for current overlay fields, but it creates long-term drift risk once Studio edits order, dependencies, edge metadata, or execution diagnostics.

## Requirements

- Add or reuse a single helper that resolves a config path into:
  - loaded config
  - loaded overlay
  - overlay-applied config
  - flattened nodes
  - built `InstallationPlan`
  - plan validation diagnostics
- `build` must pass the resolved plan into `assembleStandalone`.
- `plan` output should validate the plan and surface diagnostics consistently.
- `studio` should start from the same resolved-plan path or a clearly shared helper.
- Plan validation errors should fail hard in build; warnings should be surfaced but not necessarily fail.
- Preserve current overlay constraints: no script edits from overlay, `disabled` wins over `hidden: false`, config semantics revalidate after overlay.

## Suggested Write Set

- `src/index.ts`
- `src/planner/validate-plan.ts`
- optionally `src/planner/resolve-plan.ts` or similar new helper
- `tests/cli.test.ts`
- `tests/planner.test.ts`

## Avoid Touching

- `src/studio/main.tsx`
- `src/studio/projection.ts`
- `tests/studio.test.ts`
- large `standalone-assembler.ts` refactors

## Acceptance Criteria

- [ ] `runBuild` passes `plan` into `assembleStandalone`.
- [ ] A shared plan-resolution path avoids duplicated overlay/config/validation logic.
- [ ] A plan validation error causes `dot build` to exit non-zero.
- [ ] Existing overlay build tests continue to pass.
- [ ] New regression test proves build and plan use the same overlay-applied metadata.
- [ ] `npm test -- tests/cli.test.ts tests/planner.test.ts` passes.
- [ ] `npm run typecheck` passes.

## Notes

This task should be completed before major Canvas editing features. It defines the contract other tasks should rely on.
