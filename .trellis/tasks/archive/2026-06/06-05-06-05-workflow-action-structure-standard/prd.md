# brainstorm: workflow action structure standard

## Goal

Define a stable structure for future one-click workflows and one-shot actions so zsh, tmux, ssh, and similar script sets can be modeled consistently without breaking the current generator pipeline.

## What I already know

- Current config uses nested menu nodes with `mode: single | multi | flow`, plus `deps`, `post`, and `endFlow`.
- `src/planner/build-plan.ts` turns config into `InstallationPlan`; `src/studio/projection.ts` only projects that plan for display.
- Overlay v2 already exists, but this task is about the source-level structure standard, not overlay migration.
- Existing script families split naturally into two shapes:
  - one-click configuration workflows with multiple paths and setup phases
  - one-shot actions for config, modify, delete, diagnose, cleanup, recovery
- Current docs/specs already require strict type safety, cross-layer contracts, and one-way data flow.

## Assumptions (temporary)

- This should be an additive standard first, not a big-bang replacement of the current YAML model.
- Existing `single/multi/flow/post` behavior should keep working during migration.
- The new structure should clarify meaning, not add runtime complexity too early.
- User preference is to avoid a large refactor and optimize the current single/multi/flow architecture first.

## Open Questions

- Should the new structure introduce explicit `workflow` / `action` node types, or stay as metadata on top of the current menu tree?
  - Option A: keep the current DSL and only add tags/validation.
  - Option B: add first-class `workflow` / `action` types, but compile them down to the current runtime model first.
  - Option C: replace the current menu model outright.
- Should workflow phases be required, optional, or inferred from current `mode` groups?
- Should dependency relationships stay as authored YAML edges, or become part of a higher-level contract first?

## Requirements (evolving)

- Distinguish long-form installation/configuration workflows from one-shot actions.
- Keep current script generation compatible while the new structure is introduced.
- Make debug and validation clearer for multi-step flows.
- Preserve a clean path for Studio and generated script consumers to read the same semantics.
- Treat top-level multi-step tool entries as `flow` by standard, not arbitrary `multi` groups.
- Add authoring diagnostics before changing runtime behavior.
- Provide a Studio draft editor so users can describe desired structure through node and edge changes before source YAML is modified.

## Acceptance Criteria (evolving)

- The team can describe each script as either a workflow or an action without ambiguity.
- The structure supports current tmux/zsh/ssh use cases.
- The migration path does not require a full retest of unrelated scripts.
- Ambiguous or unsafe graph shapes are detectable before generation.
- The recommended path avoids introducing first-class runtime `workflow` / `action` types in the first phase.
- Studio can export node and edge structure drafts as an agent handoff prompt without saving semantic changes to the plan overlay.

## Definition of Done

- Tests added or updated where behavior changes.
- Lint / typecheck / build remain green for touched code.
- Docs and task notes updated if the structure changes.

## Out of Scope

- Full execution-layer refactor in this task.
- Studio redesign details.
- Overlay v2 migration work.

## Technical Notes

- Current config: `configs/dot.yaml`
- Loader schema: `src/loader/schema.ts`
- Planner: `src/planner/build-plan.ts`
- Studio projection: `src/studio/projection.ts`
- Detailed architecture notes: `.trellis/tasks/06-05-06-05-workflow-action-structure-standard/architecture.md`
- Relevant specs:
  - `.trellis/spec/frontend/type-safety.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
