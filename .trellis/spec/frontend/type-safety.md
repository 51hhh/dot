# Type Safety

> Type safety patterns for CLI/menu and generated-script UI data.

## Overview

TypeScript is the source of truth for config and menu data shapes. Runtime config validation uses Zod in `src/loader/schema.ts`.

## Type Organization

- Define config/menu schemas in `src/loader/schema.ts`.
- Export inferred `Config` type from Zod schema.
- Keep UI result types close to the UI module, e.g. `RenderOptions` and render result unions in `src/menu/render.ts`.

## Validation

- Validate external config at load time with Zod.
- Add semantic validation after structural validation.
- Generated bash data should only be emitted from validated config.

## Scenario: InstallationPlan structure edge contract

### 1. Scope / Trigger

- Trigger: changing `buildInstallationPlan`, `InstallationPlan`, Plan Canvas layout, or `dot plan` rendering.
- Applies to `src/planner/*`, `src/studio/main.tsx`, `src/studio/studio.css`, and related tests.

### 2. Signatures

```ts
export type PlanEdgeType = "child" | "single" | "multi" | "dependency" | "flow" | "post";
export type PlanStructureEdgeType = Extract<PlanEdgeType, "single" | "multi" | "flow" | "post">;

export interface PlanEdge {
  from: string;
  to: string;
  type: PlanEdgeType;
}

export interface InstallationPlan {
  version: 1;
  root: string;
  nodes: Record<string, PlanNode>;
  edges: PlanEdge[];
  execution: {
    normalSteps: PlanExecutionStep[];
    postSteps: PlanExecutionStep[];
  };
  diagnostics: PlanDiagnostic[];
}
```

### 3. Contracts

- `single`: parent-to-option branch for mutually exclusive choices.
- `multi`: parent-to-option branch for independently selectable choices.
- `flow`: visible non-hidden, non-post children are a linear chain. The first visible step starts from the flow parent; later visible steps start from the previous visible non-post step.
- `post`: post nodes attach to the current structural parent/previous visible non-post step but do not advance the flow spine.
- `dependency`: dependency edge from prerequisite to dependent item. It is auxiliary and must not drive Studio layout or `renderPlanTree` nesting.
- `child`: legacy edge type only. New Plan Canvas and plan tree logic must not depend on it.
- Hidden nodes still exist as plan nodes and may appear in dependency/execution metadata, but hidden children do not enter visible flow chains.
- Studio nodes must keep `targetPosition: Position.Left` and `sourcePosition: Position.Right`.
- Standalone generator metadata must serialize node `mode` after parent inheritance, matching `buildInstallationPlan`; omitted child modes do not fall back to `"multi"`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Flow parent has visible steps A, B, C | Edges are `parent -> A`, `A -> B`, `B -> C` with type `flow` |
| Flow parent has hidden child H before A | H does not receive a `flow` structure edge; A still starts from parent |
| Flow parent has post child P between A and B | Edge is `A -> P` with type `post`; B still starts from A |
| Single parent has options A and B | Edges are `parent -> A`, `parent -> B` with type `single` |
| Multi parent has options A and B | Edges are `parent -> A`, `parent -> B` with type `multi` |
| Dependency edge exists | It renders as auxiliary dependency and is excluded from structure traversal |
| Legacy `child` edge appears | Studio layout and `renderPlanTree` ignore it |
| Child omits `mode` under a `flow` parent | Plan node mode and generated `DOT_MODES[id]` both serialize as `flow` |

### 5. Good/Base/Bad Cases

- Good: real `tmux` flow renders as `tmux -> tmux-install -> tmux-github-mirror -> tmux-prefix -> tmux-plugins -> tmux-status -> tmux-options -> tmux-finalize`.
- Base: `tmux-prefix` is `single`, so its prefix choices branch from `tmux-prefix`.
- Base: `tmux-options` is `multi`, so its option choices branch from `tmux-options`.
- Base: `tmux-github-mirror` omits `mode` in YAML but inherits `flow` in both Plan JSON and generated `dot.sh`.
- Bad: a flow parent fans out directly to all visible steps.
- Bad: a post child becomes the previous step for later flow nodes.
- Bad: Studio layout filters for `edge.type === "child"`.
- Bad: `DOT_MODES[id] = node.mode ?? "multi"` diverges from Planner mode inheritance.

### 6. Tests Required

- Planner unit test: `single`, `multi`, `flow`, and `post` edge shapes are distinct.
- Planner unit test: real `configs/dot.yaml` has the seven visible `tmux` flow steps as a continuous chain.
- Planner unit test: post nodes inside flow do not advance the flow spine.
- Plan tree test: `renderPlanTree` traverses structure edges and ignores legacy `child` edges.
- Studio test: layout uses `single` / `multi` / `flow` / `post` structure edges, not `child`.
- Studio test: legend and edge colors cover `single`, `multi`, `flow`, `dependency`, and `post`.
- Assembler test: omitted child modes serialize using inherited parent mode in `DOT_MODES`.
- Generated script check: build `dist/dot.sh` and run `bash -n dist/dot.sh` when graph semantics affect output.

### 7. Wrong vs Correct

#### Wrong

```ts
for (const child of flow.children) {
  edges.push({ from: flow.id, to: child.id, type: "flow" });
}
```

#### Correct

```ts
let previousVisibleId = flow.id;
for (const child of flow.children) {
  if (child.hidden) continue;
  edges.push({ from: previousVisibleId, to: child.id, type: child.post ? "post" : "flow" });
  if (!child.post) previousVisibleId = child.id;
}
```

## Scenario: Studio flow spine projection contract

### 1. Scope / Trigger

- Trigger: changing Plan Canvas layout, visible structure projection, dependency visibility, or nested flow expansion.
- Applies to `src/studio/projection.ts`, `src/studio/main.tsx`, `src/studio/studio.css`, and `tests/studio.test.ts`.

### 2. Signatures

```ts
export function buildStudioGraph(
  plan: InstallationPlan,
  options?: {
    showDependencies?: boolean;
    expandedNodeIds?: ReadonlySet<string>;
    focusedNodeId?: string;
  }
): StudioGraph;
```

### 3. Contracts

- `InstallationPlan` remains the semantic source of truth; Studio may project it into a display-specific graph without changing generator behavior.
- Primary `flow` chains render as horizontal spines.
- `single` children render as real visible draggable nodes in a local lane near their parent, connected by visible `single` edges.
- `multi` children render as real visible draggable nodes in a local lane near their parent, connected by visible `multi` edges.
- Post children render as real visible draggable nodes near their owning step, connected by visible `post` edges, but they do not enter or advance the main flow spine.
- Dependency edges are hidden by default and only appear when `showDependencies` is enabled.
- Collapsed nested-flow dependency endpoints are mapped to their visible owner node when dependencies are shown.
- Nested flows such as `tmux-plugins` are collapsed by default and expand only when their id is present in `expandedNodeIds`.
- Expanded nested-flow nodes and their single/multi/post children render as real visible draggable nodes and edges.
- Studio nodes must keep `targetPosition: Position.Left` and `sourcePosition: Position.Right`.
- When `focusedNodeId` is omitted, Studio projection may render the full graph for tests and diagnostics.
- When `focusedNodeId` is the plan root, Studio must render a compact tool-selection view containing the root and top-level tool nodes only.
- When `focusedNodeId` belongs to a top-level tool subtree, Studio must expand only that top-level tool and keep sibling tools collapsed.
- Local single/multi/post branch columns must not visually intrude into the next primary flow column.
- Root-level tool modules must occupy separate vertical bands when expanded; preventing node overlap alone is not enough.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Real tmux plan is projected | `primarySpines.tmux` is the seven visible tmux macro steps |
| Single/multi children exist under a visible step | Children appear as projected nodes and visible `single` / `multi` edges |
| `showDependencies` is false or omitted | No projected edge has `type === "dependency"` |
| `showDependencies` is true | Dependency edges are dashed/low emphasis and connect visible owner nodes |
| Flow child has its own local flow | It is collapsed by default and represented by `data.nestedFlow` |
| Flow child is expanded | Its local flow nodes render below/near the parent with `nested: true` edges |
| Post children exist under a step | They appear as projected nodes and visible `post` edges, outside `primarySpines` |
| `focusedNodeId` is the root | Only root-level tool choices are visible; child install/config steps are compacted |
| `focusedNodeId` is a descendant such as `zsh-plugin-autosuggestions` | Only the owning top-level module, `zsh`, expands |
| Local branch node sits before the next flow step | Its right edge plus node gap is less than or equal to the next flow column x position |
| Multiple top-level modules are expanded | The next module's top bound starts after the previous module's bottom bound plus gap |

### 5. Good/Base/Bad Cases

- Good: `tmux -> tmux-install -> tmux-github-mirror -> tmux-prefix -> tmux-plugins -> tmux-status -> tmux-options -> tmux-finalize` reads as one horizontal spine.
- Base: `tmux-prefix` displays Ctrl+A/Ctrl+B/custom choices as draggable option nodes near the prefix step.
- Base: `tmux-options` displays option choices as draggable option nodes near the options step.
- Base: `tmux-plugins` shows a collapsed nested-flow summary until expanded.
- Base: selecting the plan root shows compact tool entries instead of expanding every tool's full workflow.
- Base: selecting a Zsh child in the tree expands the Zsh module while Tmux and SSH stay collapsed.
- Bad: dependency edges are visible by default and cross the main canvas.
- Bad: single/multi choices are compacted into text-only card data.
- Bad: post nodes create normal flow branches that suggest they run before the next macro step.
- Bad: the root tool-selection view expands all tool flows into one huge canvas by default.
- Bad: local option cards overlap or occupy the same visual column as the next flow step.

### 6. Tests Required

- Studio projection test: real tmux primary spine is the seven macro steps.
- Studio projection test: single/multi options render as visible nodes with typed edges.
- Studio projection test: dependencies are hidden by default and toggled on explicitly.
- Studio projection test: nested `tmux-plugins` flow is collapsed by default and expands locally.
- Studio projection test: post nodes render visibly but stay out of the main spine.
- Studio projection test: root focus keeps only top-level tools visible.
- Studio projection test: descendant focus expands only the owning top-level module.
- Studio projection test: branch columns stay clear of the next primary flow column.
- Studio projection test: expanded top-level modules occupy separate vertical bands.
- Build check: `npm run build` must still produce the Studio bundle.

### 7. Wrong vs Correct

#### Wrong

```ts
setEdges(plan.edges.map(edgeToReactFlowEdge));
setNodes(Object.values(plan.nodes).map(planNodeToReactFlowNode));
```

#### Correct

```ts
const graph = buildStudioGraph(plan, { showDependencies, expandedNodeIds });
setNodes(graph.nodes.map(projectedNodeToReactFlowNode));
setEdges(graph.edges.map(projectedEdgeToReactFlowEdge));
```

## Scenario: Studio draft edge handoff contract

### 1. Scope / Trigger

- Trigger: adding local edge editing, deleting, or export affordances in Plan Canvas Studio.
- Applies to `src/studio/main.tsx`, `src/studio/studio.css`, `tests/studio.test.ts`, and any future Studio export API.

### 2. Signatures

```ts
type EditableEdgeType = "single" | "multi" | "flow" | "dependency" | "post";

type DraftEdgeChange = {
  action: "add" | "remove";
  from: string;
  to: string;
  type: EditableEdgeType;
};

type AgentDraftExport = {
  changedOperations: Array<DraftEdgeChange & {
    fromLabel?: string;
    toLabel?: string;
  }>;
  overlayPatchDraft: {
    version: 2;
    dependencies?: {
      add?: Array<{ from: string; to: string }>;
      remove?: Array<{ from: string; to: string }>;
    };
  };
  sourceOnlyOperations: DraftEdgeChange[];
};
```

### 3. Contracts

- Studio may let users add/delete edges locally for planning, but those semantic changes must not be sent to `PUT /api/plan`.
- `Save layout` remains positions-only and must continue to send `patch: { version: 1, positions }`.
- Draft export must include only changed operations, never a full plan dump.
- Draft edge types must be explicit; never infer `single`, `multi`, `flow`, `dependency`, or `post` from node coordinates.
- `dependency` add/remove operations can be represented in `overlayPatchDraft.dependencies`.
- `single`, `multi`, `flow`, and `post` structure edge changes are source-only handoff items. They require `configs/*.yaml` edits and tests, not just overlay writes.
- Generated agent prompts must tell the agent to modify true source config, update tests, and run project checks.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| User connects node A to node B | Add one local `DraftEdgeChange` with the selected explicit edge type |
| User connects A to A | Reject the draft edge and keep current changes unchanged |
| User deletes an existing edge | Add one `remove` draft operation for that typed edge |
| User deletes a newly added draft edge | Remove the matching `add` draft operation instead of adding a `remove` |
| User exports with no draft changes | Produce an empty changed-operation prompt or a clear no-change status |
| User saves layout after draft edits | Persist positions only; semantic draft operations are not saved |

### 5. Good/Base/Bad Cases

- Good: deleting `zsh-plugins -> zsh-plugin-autosuggestions` as `flow` exports a `remove` operation and tells the agent to edit YAML.
- Good: adding `tmux-tpm -> tmux-plugin-catppuccin` as `dependency` appears under `overlayPatchDraft.dependencies.add`.
- Base: dragging a node changes only layout positions.
- Bad: exporting the full `InstallationPlan` when only one edge changed.
- Bad: writing `flow`/`single`/`multi` edge edits directly into sidecar overlay and assuming build output changed safely.
- Bad: inferring order from x/y coordinates after a drag.

### 6. Tests Required

- Studio source test: local draft controls exist (`draft-edge-type`, `export-draft`, `clear-draft`).
- Studio source test: `onConnect` is wired and node connection is enabled.
- Studio source test: delete key removes edges while node deletion remains blocked by `onNodesChange` filtering.
- Studio source test: layout save still contains `patch: { version: 1, positions }`.
- Studio source test: export text includes `changedOperations`, `overlayPatchDraft`, and `sourceOnlyOperations`.
- Build check: `npm run build` must still produce the Studio bundle.

### 7. Wrong vs Correct

#### Wrong

```ts
await fetch("/api/plan", {
  method: "PUT",
  body: JSON.stringify({ patch: { version: 2, ordering: inferredFromNodePositions } }),
});
```

#### Correct

```ts
const change = { action: "add", from, to, type: selectedEdgeType };
setDraftEdgeChanges((current) => [...current, change]);
setExportText(buildAgentPrompt([change]));
```

## Scenario: Generated prompt type contract

### 1. Scope / Trigger

- Trigger: adding or changing `prompt.type` values in YAML config, TypeScript schema, or generated `dot.sh` prompt dispatch.
- Applies to config loading, generated bash metadata, runtime prompt collection, and tests.

### 2. Signatures

```yaml
prompt:
  type: "key" | "key-compose" | "text"
  var: string
  label: string
```

```ts
export const PromptSchema = z.object({
  type: z.enum(["key", "key-compose", "text"]),
  var: z.string().min(1),
  label: z.string().min(1),
});
```

Generated runtime metadata:

```bash
DOT_PROMPT_TYPES['<item-id>']='<prompt-type>'
DOT_PROMPT_VARS['<item-id>']='<var-name>'
DOT_PROMPT_LABELS['<item-id>']='<label>'
```

### 3. Contracts

- `key` records the next key sequence directly and stores the tmux-compatible value in `DOT_VARS[var]`.
- `key-compose` opens the manual tmux prefix composer and stores the composed value in `DOT_VARS[var]`.
- `text` is reserved for text prompts; do not emit it without a runtime handler.
- Prompt dispatch happens after the user selects the item and before plan preview/execution.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Unknown `prompt.type` in config | Zod rejects config during load |
| Empty `prompt.var` | Zod rejects config during load |
| Empty `prompt.label` | Zod rejects config during load |
| Runtime item has no prompt | Prompt dispatch is skipped |
| Runtime prompt returns back/cancel | Selection step returns to the previous menu without executing |

### 5. Good/Base/Bad Cases

- Good: a `key-compose` config item emits `DOT_PROMPT_TYPES['id']='key-compose'` and generated runtime calls `dot_compose_tmux_key_prompt` for that item.
- Base: a `key` config item emits `DOT_PROMPT_TYPES['id']='key'` and generated runtime calls `dot_record_key_prompt` for that item.
- Bad: adding a new prompt type to YAML without updating Zod, TypeScript types, generated metadata tests, and runtime dispatch.

### 6. Tests Required

- Schema test: accepted prompt types are parsed and exposed through `Config`.
- Assembler test: generated `DOT_PROMPT_TYPES`, vars, labels, and dispatch helper names are present.
- CLI build test: sample config includes representative prompt items and generated output contains them.
- Generated script test: `bash -n` passes after building the sample config.
- Generated prompt runtime test: source generated prompt runtime with the entrypoint disabled, run representative prompt handlers under `set -euo pipefail`, and assert captured `DOT_VARS` values are consumed by generated snippets.

### 7. Wrong vs Correct

#### Wrong

```ts
if (DOT_PROMPT_TYPES[id] === "key") {
  // Also opens manual composition from inside the direct recorder.
}
```

#### Correct

```ts
case "key":
  dot_record_key_prompt(id)
  break
case "key-compose":
  dot_compose_tmux_key_prompt(id)
  break
```

## Common Patterns

Use discriminated unions for menu actions:

```ts
| { action: "select"; ids: string[] }
| { action: "enter"; childIndex: number }
| { action: "back" }
| { action: "quit" }
| { action: "confirm" }
```

Use `unknown` at error boundaries and narrow before reading properties.

## Forbidden Patterns

- Do not use `any` for caught errors.
- Do not cast unvalidated YAML directly to project types.
- Do not let bash-unsafe ids pass into generated function names without normalization.
