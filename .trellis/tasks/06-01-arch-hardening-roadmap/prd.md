# roadmap: Plan/Studio/Generator architecture hardening

## Goal

Turn the current review findings into an ordered architecture hardening program. The goal is to stabilize the core contract between config, plan, overlay, Studio, and generated `dot.sh` before adding larger product features.

## What I Already Know

- Current architecture is: YAML config -> schema/semantic validation -> dependency graph -> `InstallationPlan` -> Studio Canvas/overlay -> standalone bash output.
- The first hardening wave has already landed:
  - `41eeb79`: resolved plan pipeline and Studio overlay API hardening.
  - `71feaa7`: standalone assembler split and generated `--dry-run-plan`.
  - `9a84660`: Studio flow-spine projection.
  - `34f0c9d`: README, architecture docs, release docs, and CI workflow.
- Remaining risk is concentrated in generated runtime input safety, template trust boundaries, overlay v2 semantics, and test hardening.

## Architecture Direction

Use this source-of-truth contract:

```text
Config is source authoring input.
Overlay is a constrained patch layer.
Resolved InstallationPlan is the compiled contract for preview, Studio, validation, and build.
Standalone assembler consumes the resolved plan and config-backed script/template metadata.
```

Practical rule:

```text
load config -> load/apply overlay -> validate config -> buildInstallationPlan -> validateInstallationPlan -> assembleStandalone({ config, plan })
```

## Child Tasks

- `06-01-build-plan-source`: make build/plan/studio use a validated resolved plan consistently.
- `06-01-modularize-standalone-assembler`: reduce assembler maintenance risk by separating runtime template, data serialization, and snippet rendering.
- `06-01-harden-studio-api`: make Studio overlay write path robust and schema-validated.
- `06-01-generated-script-smoke-tests`: add noninteractive generated-script test mode and smoke coverage.
- `06-01-docs-release-pipeline`: update README/docs and release artifact flow to match current architecture.
- `06-01-plan-canvas-editor-roadmap`: define the next-stage editable Canvas model without destabilizing the current viewer.
- `06-01-prompt-substitution-safety`: make prompt-backed template values shell-safe.
- `06-01-template-trust-boundary`: document and enforce trusted template path policy.
- `06-01-shell-safe-id-loader-validation`: reject unsafe ids at config semantic validation.
- `06-01-generated-header-metadata-safety`: protect generated script header metadata.
- `06-01-bash-runtime-second-split`: split the large bash runtime template into focused modules.
- `06-01-overlay-v2-implementation`: implement v2 overlay migration, diagnostics, conflicts, and normalized model.
- `06-01-github-mirror-integrity-policy`: document third-party mirror trust and integrity policy.
- `06-01-studio-diagnostics-conflict-ux`: surface diagnostics and save conflicts in Studio.
- `06-01-behavior-test-hardening`: replace brittle source-string checks with behavior tests where practical.

## Execution Strategy

Wave 0: completed.

Wave 1: completed.

- `build-plan-source`
- `harden-studio-api`
- `docs-release-pipeline`
- `ci-release-workflow`
- `agent-worktree-protocol`

Wave 2: completed.

- `generated-script-smoke-tests`
- `modularize-standalone-assembler`
- `studio-flow-spine`

Wave 3: completed design/audit.

- `plan-canvas-editor-roadmap`
- `runtime-security-audit`
- `overlay-v2-migration-design`

Wave 4 starts now. These can run in parallel only if write scopes do not overlap:

- `prompt-substitution-safety`
- `shell-safe-id-loader-validation`
- `generated-header-metadata-safety`
- `github-mirror-integrity-policy`

Wave 5 starts after Wave 4 safety contracts settle:

- `template-trust-boundary`
- `bash-runtime-second-split`
- `behavior-test-hardening`

Wave 6 starts after overlay v2 implementation design is reviewed against Wave 4/5:

- `overlay-v2-implementation`
- `studio-diagnostics-conflict-ux`

## Agent Coordination Rules

- Each external agent must work in its own worktree/forked workspace.
- External agents must execute directly. Do not ask them to call subagents or spawn more agents.
- Each implementation task must declare its write set before editing.
- Agents must not revert or overwrite existing uncommitted changes from the main workspace or other agents.
- Avoid concurrent edits to `src/generator/standalone-assembler.ts`; only one agent owns it at a time.
- Avoid concurrent edits to `src/generator/standalone/bash-runtime.ts` unless the task is explicitly the runtime split owner.
- Avoid concurrent edits to `src/studio/*` and `tests/studio.test.ts`.
- Main agent reviews each result for architecture fit before integration.

## Global Acceptance Criteria

- [ ] `Config -> Overlay -> InstallationPlan -> validation -> build` contract is documented and enforced.
- [ ] `build`, `plan`, and `studio` share the same resolved-plan validation path or a clearly factored equivalent.
- [ ] Studio API rejects malformed overlay writes with stable error responses.
- [ ] Generated `dot.sh` has at least one deterministic noninteractive smoke path.
- [ ] Assembler refactor reduces file-level complexity without changing generated behavior.
- [ ] README describes `build`, `plan`, `studio`, overlay, and release artifact workflow.
- [ ] Full quality gate passes after integration: lint, typecheck, unit tests, build, generated script syntax check.

## Out of Scope

- Building a full editable Canvas in this roadmap's first implementation wave.
- Adding remote template/plugin marketplace support.
- Replacing bash runtime with Node, Go, Rust, or a binary TUI.
- Rewriting all tests in one pass.

## Review Checklist For Main Agent

- Does the change reduce source-of-truth drift?
- Does it preserve current `dot.sh` behavior unless the task explicitly changes it?
- Does it avoid increasing the assembler's coupling?
- Does it keep overlay edits constrained and validated?
- Does it add behavior tests where string assertions were previously carrying too much risk?
