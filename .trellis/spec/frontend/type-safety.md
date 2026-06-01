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
