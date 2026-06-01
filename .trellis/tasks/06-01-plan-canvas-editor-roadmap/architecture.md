# Plan Canvas Editor Architecture Roadmap

## Purpose

This roadmap defines how Plan Canvas can move from a viewer and layout saver into a genuinely editable plan editor without making Studio the source of truth for executable behavior.

The core contract must remain:

```text
Config YAML + Plan Overlay -> Resolved Config -> InstallationPlan -> Studio projection/build output
```

Studio may request constrained overlay patches. It must not directly edit generated plans, execution arrays, generated scripts, or node `script` content.

## Current Boundaries

Studio currently behaves as a viewer plus layout editor:

- `src/studio/server.ts` loads config, loads the sibling `.plan.json` overlay, resolves the plan, and serves `GET /api/plan`.
- `PUT /api/plan` accepts a plan overlay patch, merges it with the current overlay, resolves a fresh plan, and saves the overlay.
- `src/planner/overlay.ts` defines overlay version `1` with `positions`, `disabled`, and node `overrides` for metadata-like fields.
- `src/planner/resolve-plan.ts` applies overlay edits to config before building the plan, then applies positions to the built `InstallationPlan`.
- `src/studio/projection.ts` converts the semantic `InstallationPlan` into a display graph. The projection collapses single/multi choices, post items, nested flows, and dependency edges differently from the semantic plan.
- `src/studio/main.tsx` lets users drag React Flow nodes and save the resulting `positions` overlay.

Those boundaries are good and should be preserved. The next editor should deepen the overlay contract and the validation UI before expanding the edit surface.

## Phase Model

### Phase 1: Viewer

The viewer renders a resolved `InstallationPlan` and its diagnostics. It can project the plan for readability, but it does not persist edits. Projection choices such as compacting choices or hiding dependency edges by default are display concerns only.

This phase must not mutate source YAML or overlay files.

### Phase 2: Layout Editor

The layout editor persists only display geometry:

- Allowed overlay writes: `positions[id] = { x, y }`.
- Not allowed: node metadata, edge semantics, flow order, post state, disabled state, prompt fields, scripts, or source YAML.
- Validation: positions for unknown ids are ignored or reported as stale overlay entries, but they must not create nodes.

This is the current production boundary and should remain the fallback mode when a plan has blocking diagnostics.

### Phase 3: Constrained Plan Editor

The constrained editor allows safe semantic edits through explicit overlay fields. It should only expose edits that can be validated, migrated, and represented as non-script overlay patches.

Initial edit surface:

- Node metadata: `label`, `description`, `hidden`, `mode`, `post` where safe.
- Dependency edits: add/remove non-structural dependency relationships.
- Order edits: reorder existing siblings within a parent or flow spine.
- Post edits: move existing nodes between normal and post placement within a known parent or flow context.
- `endFlow` edits: toggle whether selecting an existing flow choice exits the containing flow, once the plan model exposes that field.
- Disable/enable: keep as overlay state but surface diagnostics when disabling breaks dependencies.

The constrained editor must re-resolve and revalidate the plan after every committed patch. Invalid edits should either be blocked before save or saved only if the UI clearly marks the plan invalid and build/execution remains gated.

### Phase 4: Full Source Editor

The full source editor is a separate phase and should wait until the source-of-truth work is complete. It may edit YAML directly, including fields that cannot be safely represented in overlay.

Full source editor scope includes:

- Creating or deleting YAML nodes.
- Editing `script`, `prompt`, package manager commands, or generated runtime behavior.
- Moving nodes across arbitrary YAML trees when the source location cannot be expressed as a constrained overlay patch.
- Repairing complex invalid YAML/config shapes.

Plan Canvas should be able to link to or launch this phase, but it should not silently become it.

## Source Of Truth Contract

Config YAML is the durable semantic source. Overlay is a constrained patch layer. InstallationPlan is derived. Build output is derived from the resolved plan/config and must never read Studio UI state directly.

Required invariants:

- The same `Config + Overlay` pair must produce the same resolved config and plan in CLI, Studio, tests, and build.
- Studio must always save overlay patches, then reload or receive a freshly resolved plan. It must not locally mutate plan semantics and assume success.
- Build and generated script logic should consume resolved config/plan APIs, not raw Studio projection state.
- Projection is lossy by design. It may group nodes, map compact dependency endpoints to visible owners, and hide dependency edges by default. Projection must not become the edit source for semantic writes.
- Overlay writes must reference stable node ids and stable edge identity, not React Flow edge ids.

## Overlay Versus YAML

Use overlay for local, reviewable, reversible edits that do not change executable script content.

Use YAML source for canonical authoring and executable behavior.

| Change | Overlay | YAML Source | Notes |
| --- | --- | --- | --- |
| Node position | Yes | No | Display-only layout data. |
| Label/description override | Yes | Preferred for canonical docs | Overlay is acceptable for local editing; YAML is canonical. |
| Hidden/disabled state | Yes | Yes | Overlay can disable without deleting source. |
| Mode change between `single`, `multi`, `flow` | Yes, constrained | Yes | Must validate child edge shape and execution effects. |
| Post flag or post placement | Yes, constrained | Yes | Must preserve post execution ordering. |
| `endFlow` flow-control flag | Yes, after plan model support | Yes | Separate from `post`; affects generated navigation, not execution ordering. |
| Dependency add/remove | Yes, constrained | Yes | Requires stable overlay schema for dependency overrides. |
| Sibling/flow order | Yes, constrained | Yes | Overlay needs an explicit order model; positions must not imply order. |
| Create/delete node | No for initial editor | Yes | Can be added later with source editing or a richer source patch model. |
| Prompt fields | No for initial editor | Yes | Prompt behavior affects runtime collection and generated metadata. |
| Script content | Never in Studio constrained editor | Yes only | Studio must not edit executable script. |

## Next Overlay Schema Direction

Overlay version `1` is enough for layout and basic node overrides, but not enough for a real editor. The next editor should introduce an explicit versioned schema instead of overloading current fields.

Candidate version `2` shape:

```ts
interface PlanOverlayV2 {
  version: 2;
  base?: {
    configPath?: string;
    configHash?: string;
    loadedAt?: string;
  };
  positions?: Record<string, { x: number; y: number }>;
  nodes?: Record<string, {
    label?: string;
    description?: string;
    hidden?: boolean;
    disabled?: boolean;
    post?: boolean;
    endFlow?: boolean;
    mode?: "single" | "multi" | "flow";
  }>;
  dependencies?: {
    add?: Array<{ from: string; to: string }>;
    remove?: Array<{ from: string; to: string }>;
  };
  ordering?: Record<string, {
    children?: string[];
    flow?: string[];
    post?: string[];
  }>;
}
```

Schema principles:

- Keep `positions` independent from semantic ordering.
- Split `disabled` from `hidden` in the UI model even if the current YAML/plan representation shares behavior. Hidden is presentation/source metadata; disabled is user selection/execution exclusion.
- Store dependency and order edits as semantic patches against source ids, not as arbitrary plan edge arrays.
- Include base metadata for conflict detection. A config hash is better than file mtime alone.
- Preserve unknown future fields only if migration code has a deliberate passthrough policy. Otherwise strip and report them.

Overlay evolution risks:

- Current `overrides.mode` can change plan shape without enough context for ordering or child validation.
- Current `disabled` is a set-like append-only merge. It needs explicit removal before an enable/disable UI can be correct.
- Positions are tied to node ids. Renamed or deleted ids can leave stale layout data.
- Dependency edits cannot be represented today without editing YAML or adding schema.
- Order edits cannot be represented today and must not be inferred from canvas x/y positions.
- `endFlow` is currently a YAML/config field, not a `PlanNode` field. Editing it requires extending the resolved plan contract before Studio can safely display or patch it.
- Migrating from `overrides` to `nodes` can accidentally change precedence unless both formats are normalized to one internal representation.
- Overlay patches that are valid structurally can still produce invalid plans after semantic validation.

Migration plan:

1. Add a parser that accepts v1 and v2.
2. Normalize both versions to one internal overlay model.
3. Save as v2 only after a user edit or explicit migration.
4. Show a non-blocking stale-overlay diagnostic for unknown node ids and removed source edges.
5. Keep a backup or atomic write path when rewriting overlay versions.

## Constrained Edit Surfaces

### Node Metadata Editing

Initial fields:

- `label`
- `description`
- `hidden`
- `disabled`
- `mode`
- `post`
- `endFlow`, only after it is represented in `InstallationPlan`

Rules:

- `id`, `kind`, `prompt`, and `script` are read-only in constrained Studio.
- `mode` changes must be validated against existing children and cannot set root mode on non-root nodes.
- `post` changes must recompute normal and post execution arrays before save is considered successful.
- `endFlow` changes must be limited to existing selectable flow choices and must update generated navigation metadata through the same resolved config/plan path as YAML edits.
- Hidden/disabled changes must show dependency impact before commit when dependents are affected.

### Edge And Dependency Editing

Dependency editing should be the first edge edit surface because dependency edges are auxiliary and do not drive layout.

Rules:

- Users may add/remove dependency edges only between existing nodes.
- The editor must reject self-dependencies and cycles.
- Dependency edits must not create structure edges or alter flow order.
- If either endpoint is compacted in Studio projection, the edit UI must still show the real source and target node ids.
- Dependency visibility remains a toggle. Diagnostics should be visible even when dependency edges are hidden.

Structure edge editing should be delayed until ordering and parent ownership are explicit in overlay v2.

### Flow And Order Editing

Order is semantic and must not be inferred from canvas positions.

Rules:

- Reordering should operate within a specific parent/order list.
- Flow order should expose the current spine as an ordered list, with drag handles or up/down controls.
- Reordering must preserve the same node set unless the UI is explicitly doing a move.
- Single/multi branch order and flow order are separate lists.
- The saved patch should describe ordered child ids, not edges.
- The plan resolver should rebuild `single`, `multi`, `flow`, and `post` edges from resolved config plus overlay ordering.

### Post And EndFlow Editing

Post edits affect execution semantics and visual semantics. `endFlow` edits affect generated flow navigation and must not be treated as post execution.

Post rules:

- Marking a node as post must move it to post execution and render it as post metadata or a post edge according to projection rules.
- Unmarking a post node must restore it to normal structure only if its parent/order context is known.
- Post nodes inside a flow must not advance the flow spine.
- Post placement should be represented as an explicit post/order patch, not by placing a card at the end of the canvas.
- The UI should preview whether the node will run after normal execution, and which normal node it is visually attached to.

`endFlow` rules:

- `endFlow` is a flow-control flag for menu navigation: selecting that item exits the containing flow and proceeds to preview/execution planning.
- It is not an edge type and must not create a post edge or move the node into `execution.postSteps`.
- The constrained editor should keep `endFlow` read-only until `PlanNode` includes the field and the build path consumes the overlay through resolved config.
- When enabled later, it should be editable only for existing leaf or prompt choices inside a flow context, with diagnostics if the node is outside a containing flow.
- The UI should preview the navigation effect separately from execution order.

## Undo And Redo

Undo/redo should operate on overlay patch transactions, not raw React state.

Model:

- Each edit creates a transaction with `beforeOverlay`, `afterOverlay`, affected ids, and a short label.
- Layout drags should coalesce into one transaction per drag stop.
- Semantic edits should be one transaction per committed form action.
- Undo sends the previous overlay state or inverse patch to the server, then receives a freshly resolved plan.
- Redo reapplies the transaction only if the base config hash still matches.

Do not include ephemeral UI state in undo history:

- selected node
- sidebar collapsed state
- dependency visibility toggle
- local zoom/pan
- expanded nested-flow ids, unless the user explicitly edits structure

## Validation And Diagnostics UX

Plan diagnostics need first-class visualization before broad editing.

Required surfaces:

- Toolbar summary with counts for errors and warnings.
- Diagnostics panel listing code, message, severity, and node id.
- Node badges for diagnostics tied to `nodeId`.
- Edge badges or dependency highlights for relationship diagnostics when a diagnostic references an edge in the future.
- Click-to-focus from diagnostic to visible owner node. If the target is compacted, focus the owner card and reveal the compact item.
- Save responses should return validation diagnostics for failed or accepted-but-invalid patches.

Behavior:

- Error diagnostics block build/execution actions from Studio.
- Warnings do not block saving but remain visible until resolved.
- Invalid overlay patches should show field-level errors and keep the unsaved edit available for correction.
- If the current resolved plan is invalid, layout-only edits may still be allowed; semantic edits should be disabled until the invalid area is understood or explicitly allowed by a repair mode.

Current diagnostics are plan-level and node-level. Future edge/order diagnostics should extend the diagnostic shape with relationship targets rather than encoding edge information in message strings.

## Save Failure And Conflict Handling

The current save API returns success or an error JSON response. A real editor needs stronger transaction semantics.

Required behavior:

- Save requests include overlay version and base config hash.
- Server reparses current config and overlay before applying the patch.
- Server writes overlay atomically.
- Server returns the resolved plan, diagnostics, overlay version, and current config hash after every successful save.
- On validation failure, server returns structured issues and the resolved pre-save plan.
- On conflict, server returns `409` with current hash/version and asks the UI to reload, merge, or discard local edits.
- On write failure, keep the local pending transaction marked unsaved and show retry/discard actions.
- On oversized or malformed payloads, discard nothing client-side; surface the server error.

Conflict cases to handle:

- YAML changed since Studio loaded.
- Overlay file changed from another Studio/CLI process.
- Overlay version is newer than the running Studio understands.
- Node ids referenced by a pending edit no longer exist.
- The same field was changed by both local pending edits and external overlay edits.

## Permission And Security Model

Studio constrained editing is an allowlist, not a general file editor.

Allowed to change through constrained Studio:

- overlay `positions`
- overlay node metadata: `label`, `description`, `hidden`, `disabled`, `mode`, `post`
- overlay `endFlow` only after the resolved plan contract exposes it and validation can prove the node is inside a flow context
- overlay dependency add/remove patches
- overlay order patches for existing node ids

Not allowed through constrained Studio:

- `script`
- prompt runtime behavior
- arbitrary YAML keys
- file paths
- generated script templates
- package manager command text
- shell snippets
- environment variables or secrets
- creating/deleting source nodes until a source editor exists

Server-side enforcement is required. The client hiding a field is not a permission model.

Studio should bind only to `127.0.0.1`, keep request body limits, reject unknown patch fields, and validate all ids against the resolved config. If future remote access is introduced, add authentication and CSRF protection before enabling writes.

## Follow-Up Tasks

These can be split independently:

1. Diagnostics UX: render plan diagnostics in toolbar, panel, and node badges with click-to-focus behavior.
2. Save API hardening: return resolved plan on save, add base config hash, conflict responses, and atomic overlay writes.
3. Overlay v2 parser and migration: accept v1/v2, normalize internally, save v2 on edit, and report stale overlay entries.
4. Undo/redo transaction model: add overlay transaction history and layout-drag coalescing.
5. Node metadata editor: allow label/description/hidden/disabled edits with validation and diagnostics.
6. Dependency editor: add/remove dependency patches, reject cycles, and keep true endpoint ids visible.
7. Ordering editor: reorder existing siblings/flow steps using explicit overlay order patches.
8. Post editor: edit post placement and preview execution impact.
9. `endFlow` plan contract and editor: add `endFlow` to `PlanNode`, validate flow context, then expose a constrained toggle.
10. Source editor handoff: define how Plan Canvas opens or links to a YAML/source editor for non-overlay changes.
11. Edge/order diagnostics model: extend diagnostics with structured relationship targets.

## Scope Not For This Task

Do not implement UI controls, endpoints, migrations, or validation changes as part of this roadmap task.

Do not broaden Studio into a full YAML editor yet.

Do not edit `script`, `prompt`, generated runtime behavior, or generated script templates from Studio.

Do not infer semantic flow order from canvas layout positions.

Do not make dependency edges visible by default in the main canvas.

Do not let React Flow's projected nodes or edges become the persisted semantic model.
