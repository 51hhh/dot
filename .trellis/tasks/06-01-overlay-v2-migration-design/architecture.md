# Overlay v2 Migration Architecture

## Purpose

Overlay v2 makes Plan Canvas a constrained semantic editor without making Studio the source of truth for executable behavior.

The durable contract stays:

```text
Config YAML + Plan Overlay -> Resolved Config -> InstallationPlan -> Studio projection/build output
```

Studio may save validated overlay state or overlay patch requests. It must not persist React Flow nodes, projected edges, generated plan execution arrays, script content, prompt behavior, or arbitrary YAML fields.

## Current v1 Baseline

Overlay v1 currently supports:

```ts
interface PlanOverlayV1 {
  version: 1;
  positions?: Record<string, PlanPosition>;
  disabled?: string[];
  overrides?: Record<string, {
    label?: string;
    description?: string;
    hidden?: boolean;
    post?: boolean;
    mode?: "single" | "multi" | "flow" | "root";
  }>;
}
```

Current resolver behavior:

- `loadPlanOverlay` parses a sibling `.plan.json`.
- `applyPlanOverlayToConfig` applies metadata overrides and maps v1 `disabled` to `hidden: true` before plan building.
- `buildInstallationPlan` remains the source for structure edges, dependency edges, and execution steps.
- positions are applied after plan building because they are display-only.

Known v1 limits:

- `disabled` is append-only in merge behavior, so enabling cannot be represented by a later patch.
- `disabled` and `hidden` collapse to the same plan behavior, which hides the user's intent.
- dependencies and order edits cannot be represented.
- stale ids are silently ignored.
- v1 has no base config hash, overlay revision, conflict detection, or atomic migration policy.
- `overrides.mode` can alter semantics without enough ordering or dependency validation context.

## Design Principles

- Use TypeScript and Zod schemas as the source of truth for overlay shape.
- Parse external overlay data as `unknown`, validate structurally, then run semantic validation.
- Normalize v1 and v2 into one internal model before applying it.
- Persist source ids and semantic patch fields, not Studio projection ids or edge ids.
- Keep display positions independent from semantic ordering.
- Split `hidden` from `disabled` even while the current plan model still treats both as excluded from visible flow chains.
- Reject unknown save-payload fields server-side. For disk overlays, preserve unknown future fields only if a deliberate compatibility policy is added.
- Re-resolve from config plus normalized overlay after every committed save.

## TypeScript-Style Schema

### Shared Types

```ts
type OverlayVersion = 1 | 2;
type NodeId = string;
type OverlayDiagnosticSeverity = "error" | "warning" | "info";
type PlanNodeModePatch = "single" | "multi" | "flow";

interface PlanPosition {
  x: number;
  y: number;
}

interface OverlayBaseMetadata {
  configPath?: string;
  configHash: string;
  overlayHash?: string;
  loadedAt?: string;
  generatorVersion?: string;
}

interface OverlayDiagnosticsTarget {
  nodeId?: NodeId;
  edge?: { from: NodeId; to: NodeId; kind: "dependency" | "order" | "structure" };
  field?: string;
}

interface OverlayDiagnostic {
  code:
    | "invalid_overlay"
    | "unsupported_overlay_version"
    | "stale_node_id"
    | "stale_dependency"
    | "stale_ordering_id"
    | "duplicate_ordering_id"
    | "unknown_ordering_id"
    | "base_config_conflict"
    | "overlay_conflict"
    | "dependency_cycle"
    | "invalid_dependency"
    | "invalid_end_flow_context";
  severity: OverlayDiagnosticSeverity;
  message: string;
  target?: OverlayDiagnosticsTarget;
}
```

### Disk Overlay v2

The disk file stores the current overlay state.

```ts
interface PlanOverlayV2 {
  version: 2;
  base?: OverlayBaseMetadata;

  positions?: Record<NodeId, PlanPosition>;

  nodes?: Record<NodeId, {
    label?: string;
    description?: string;
    hidden?: boolean;
    disabled?: boolean;
    post?: boolean;
    mode?: PlanNodeModePatch;
    endFlow?: boolean;
  }>;

  dependencies?: {
    add?: DependencyPatch[];
    remove?: DependencyPatch[];
  };

  ordering?: Record<NodeId, OrderingPatch>;
}

interface DependencyPatch {
  from: NodeId;
  to: NodeId;
}

interface OrderingPatch {
  children?: NodeId[];
  flow?: NodeId[];
  post?: NodeId[];
}
```

Rules:

- `version` is required and must be exactly `2` for v2.
- `base.configHash` is the hash of the loaded source config bytes or canonical config representation. Prefer source bytes plus normalized path for conflict detection; document the final hash input in implementation.
- `base.overlayHash` is the hash of the overlay file that Studio loaded, excluding volatile write metadata if such fields are added.
- `nodes[id].disabled` is user execution exclusion. `nodes[id].hidden` is presentation/source visibility metadata.
- `nodes[id].mode` must not include `"root"`; root mode is derived from plan construction.
- `dependencies.add` and `dependencies.remove` are semantic patches against source ids, not serialized plan edge arrays.
- `ordering[parentId]` only reorders existing children owned by `parentId`; it does not create, delete, or move nodes across arbitrary parents.
- `ordering.flow` records the normal visible flow order. `ordering.post` records post placement/order. `ordering.children` records single/multi child order.
- `positions` never imply ordering.

### Save Patch Request

The save endpoint should accept an operation payload instead of requiring the client to build a full overlay file. The server merges, validates, writes, and returns the resolved plan.

```ts
interface PlanOverlaySaveRequestV2 {
  version: 2;
  base: {
    configHash: string;
    overlayHash?: string;
  };
  patch: PlanOverlayPatchV2;
}

interface PlanOverlayPatchV2 {
  positions?: Record<NodeId, PlanPosition | null>;
  nodes?: Record<NodeId, NodePatch | null>;
  dependencies?: {
    add?: DependencyPatch[];
    remove?: DependencyPatch[];
  };
  ordering?: Record<NodeId, OrderingPatch | null>;
}

interface NodePatch {
  label?: string | null;
  description?: string | null;
  hidden?: boolean | null;
  disabled?: boolean | null;
  post?: boolean | null;
  mode?: PlanNodeModePatch | null;
  endFlow?: boolean | null;
}
```

Patch semantics:

- `null` removes the overlay value at that field or record.
- `disabled: false` explicitly enables a node by clearing the disabled overlay state.
- `hidden: false` explicitly overrides hidden metadata to visible where validation allows it.
- dependency `add` is idempotent and must not duplicate an existing dependency.
- dependency `remove` is idempotent and should be retained only when it removes a source dependency; removing an overlay-added dependency can delete the add patch instead.
- order arrays replace the overlay order for that parent/list.

## Normalized Internal Model

Both v1 and v2 should normalize to one internal representation before application:

```ts
interface NormalizedPlanOverlay {
  sourceVersion: OverlayVersion;
  base?: OverlayBaseMetadata;
  positions: Map<NodeId, PlanPosition>;
  nodes: Map<NodeId, NormalizedNodeOverlay>;
  dependencies: NormalizedDependencyPatchSet;
  ordering: Map<NodeId, NormalizedOrderingPatch>;
  diagnostics: OverlayDiagnostic[];
}

interface NormalizedNodeOverlay {
  label?: string;
  description?: string;
  hidden?: boolean;
  disabled?: boolean;
  post?: boolean;
  mode?: PlanNodeModePatch;
  endFlow?: boolean;
}

interface NormalizedDependencyPatchSet {
  add: Map<string, DependencyPatch>;
  remove: Map<string, DependencyPatch>;
}

interface NormalizedOrderingPatch {
  children?: NodeId[];
  flow?: NodeId[];
  post?: NodeId[];
}
```

Normalization responsibilities:

- Validate external shape with Zod.
- Convert v1 `positions` directly.
- Convert v1 `overrides[id]` to `nodes[id]` metadata.
- Convert v1 `disabled` to `nodes[id].disabled = true`, not to `hidden`.
- Drop v1 `mode: "root"` for non-root ids and report it as a warning if present.
- Deduplicate dependency patches using a stable key such as `${from}\0${to}`.
- Deduplicate `disabled` ids and ordering arrays while reporting duplicates.
- Preserve diagnostics alongside the normalized model so stale overlay entries can be displayed without mutating the source plan.

Application order:

1. Load and validate source config.
2. Load overlay as v1 or v2.
3. Normalize overlay.
4. Validate normalized overlay against the current config tree and dependency graph.
5. Apply semantic overlay fields to a cloned config.
6. Run config semantic validation.
7. Build `InstallationPlan`.
8. Apply positions to plan nodes only.
9. Attach overlay diagnostics to the resolved response.

## v1 Parser Compatibility

The parser should accept both versions during migration:

```ts
type ParsedPlanOverlay = PlanOverlayV1 | PlanOverlayV2;
```

Parser rules:

- missing `version` is invalid; do not guess.
- `version: 1` parses with the existing v1 schema.
- `version: 2` parses with the new v2 schema.
- versions greater than `2` fail with `unsupported_overlay_version`; Studio should offer read-only layout viewing until upgraded.
- malformed JSON fails with `invalid_overlay` and must not rewrite the file.
- unknown fields in save payloads are rejected.
- unknown fields in disk files should be stripped by default after explicit migration; before migration they should be reported but not rewritten.

Compatibility behavior:

- Existing v1 overlays continue to load and apply.
- Loading v1 does not immediately rewrite the file.
- Saving any edit after a v1 load writes v2.
- Explicit CLI or Studio migration can also rewrite v1 to v2 after showing diagnostics and creating a backup.
- The server response should include `overlayVersion` and `normalizedOverlayVersion` so Studio can show when a v1 file is loaded in compatibility mode.

## v1 to v2 Migration

Migration is deterministic:

```ts
function migrateOverlayV1ToV2(v1: PlanOverlayV1, base: OverlayBaseMetadata): PlanOverlayV2 {
  const nodes: PlanOverlayV2["nodes"] = {};

  for (const [id, override] of Object.entries(v1.overrides ?? {})) {
    nodes[id] = {
      label: override.label,
      description: override.description,
      hidden: override.hidden,
      post: override.post,
      mode: override.mode === "root" ? undefined : override.mode,
    };
  }

  for (const id of v1.disabled ?? []) {
    nodes[id] = { ...(nodes[id] ?? {}), disabled: true };
  }

  return {
    version: 2,
    base,
    positions: v1.positions,
    nodes: removeEmptyNodePatches(nodes),
  };
}
```

Migration notes:

- v1 `disabled` becomes v2 `disabled`, not v2 `hidden`.
- v1 `overrides.hidden` remains v2 `hidden`.
- v1 had no dependencies, ordering, or `endFlow`, so those fields are absent.
- v1 `mode: "root"` is not representable in v2 node patches. Drop it and add a warning diagnostic.
- Empty `nodes` and empty top-level sections should be omitted from the saved JSON.
- The migrated file must be pretty-printed with a trailing newline.

## Save-As-v2 Timing

Save as v2 when:

- a user saves any layout or semantic edit after loading v1;
- the user runs an explicit migration command;
- Studio performs a successful conflict-resolved rewrite;
- future tooling needs to persist dependency, ordering, disabled false, or `endFlow` state.

Do not save as v2 when:

- Studio only loads or renders the plan;
- the overlay is invalid or has an unsupported future version;
- config validation fails before a safe normalized overlay can be built;
- a conflict is detected and the user has not chosen a merge/reload path.

This keeps migration reviewable and avoids silently changing files on read.

## Atomic Write and Backup

All overlay rewrites must be atomic:

1. Read current overlay bytes and compute `currentOverlayHash`.
2. Compare request `base.overlayHash` if provided.
3. Build the next overlay object in memory.
4. Validate by parsing the serialized JSON back through the v2 schema.
5. Create a backup before replacing an existing file.
6. Write to a temp file in the same directory, for example `.dot.plan.json.tmp-<pid>-<nonce>`.
7. Flush and close the temp file.
8. Rename temp file over the target path.
9. Return the resolved plan from the newly written overlay.

Backup policy:

- For v1-to-v2 rewrites, create `<overlay>.v1.bak`.
- For conflict resolution rewrites, create `<overlay>.<timestamp>.bak`.
- If the backup path exists, append a short suffix rather than overwriting it.
- On write failure, leave the original overlay untouched and delete the temp file if possible.
- Backups are local safety files; the primary review surface remains git diff.

## Base Config Hash and Conflict Detection

Every Studio save should include the config hash and overlay hash from the plan response it edited.

Conflict checks:

- If the current config hash differs from request `base.configHash`, return `409 base_config_conflict`.
- If request `base.overlayHash` is present and differs from current overlay hash, return `409 overlay_conflict`.
- If the current overlay version is newer than supported, return `409 unsupported_overlay_version` or `422` read-only diagnostics depending on endpoint design.
- If a patch references node ids that no longer exist, return structured diagnostics. Semantic patches with stale ids should fail; layout-only stale positions may be accepted only if the stale entries are ignored or removed explicitly.

Server response shape:

```ts
interface PlanOverlaySaveResponseV2 {
  ok: boolean;
  configHash: string;
  overlayHash: string;
  overlayVersion: 2;
  plan: InstallationPlan;
  diagnostics: OverlayDiagnostic[];
}
```

On conflict, return enough data for the UI to choose reload, merge, or discard:

```ts
interface PlanOverlayConflictResponse {
  ok: false;
  code: "base_config_conflict" | "overlay_conflict";
  currentConfigHash: string;
  currentOverlayHash?: string;
  diagnostics: OverlayDiagnostic[];
}
```

## Stale Node Id Diagnostics

Stale overlay entries are entries whose ids no longer exist in the current config tree.

Diagnostic rules:

- `positions[id]` with unknown `id`: warning `stale_node_id`; ignored when applying positions.
- `nodes[id]` with unknown `id`: warning on load; error on save if introduced by the current patch.
- `dependencies.add/remove` with unknown endpoint: error `stale_dependency` for semantic saves.
- `ordering[parentId]` with unknown parent: error `stale_ordering_id`.
- `ordering[parentId].children/flow/post` containing unknown ids: error `stale_ordering_id`.
- duplicated ids inside any order list: error `duplicate_ordering_id`.
- order lists missing existing siblings or containing nodes not owned by the parent: error `unknown_ordering_id` unless the final design intentionally supports partial order patches.

Diagnostics must include `nodeId`, `edge`, or `field` targets where possible so Studio can focus the relevant canvas item or inspector field.

## Disabled vs Hidden

`hidden` and `disabled` must be separate in v2:

- `hidden` means the node should not appear in the visible menu/flow presentation unless an editor explicitly reveals hidden items. It mirrors source metadata and can be a durable authoring decision.
- `disabled` means the user or workspace has excluded the node from selection/execution without deleting or hiding the source item.

Current compatibility:

- Until the plan model has an execution-disabled state, both `hidden: true` and `disabled: true` may be applied to config as `hidden: true` before `buildInstallationPlan`.
- The normalized overlay must still keep the two flags separate so future planner work can expose disabled nodes differently.
- `disabled: false` clears only the disabled overlay state and must not clear `hidden`.
- `hidden: false` clears only the hidden override and must not enable a disabled node.

Future target:

- Hidden nodes remain excluded from visible structure edges.
- Disabled nodes remain visible with disabled styling and do not enter execution unless explicitly selected or re-enabled, depending on the final planner semantics.
- Dependency diagnostics should distinguish "depends on hidden node" from "depends on disabled node".

## Dependency Patch Model

Dependency overlay state is a pair of add/remove patch sets:

```ts
dependencies: {
  add?: Array<{ from: NodeId; to: NodeId }>;
  remove?: Array<{ from: NodeId; to: NodeId }>;
}
```

Rules:

- `from` is the prerequisite; `to` is the dependent item.
- Patches reference real source node ids, never projected owner ids.
- Self-dependencies are invalid.
- Cycles are invalid after applying source dependencies plus overlay add/remove patches.
- Adding a dependency already present in source or overlay is idempotent.
- Removing a source dependency records a remove patch.
- Removing a dependency that was introduced by overlay should delete the matching add patch instead of adding a remove patch.
- Dependency patches never create structure edges and must not affect flow ordering.
- Dependency diagnostics should remain visible even when dependency edges are hidden in Studio.

Application:

1. Build a dependency set from source config.
2. Remove every edge in `dependencies.remove`.
3. Add every edge in `dependencies.add`.
4. Validate endpoints, self-edges, duplicates, and cycles.
5. Apply the resulting dependency metadata to the cloned config before building the plan.

## Ordering Patch Model

Order is semantic and must not be inferred from canvas positions.

```ts
ordering: {
  [parentId: string]: {
    children?: string[];
    flow?: string[];
    post?: string[];
  };
}
```

List meanings:

- `children`: order for normal single/multi children of `parentId`.
- `flow`: order for normal, non-post flow children under `parentId`.
- `post`: order for post children under `parentId` or post items attached in that parent context.

Rules:

- Ordering patches reorder existing siblings only.
- A list must contain each relevant existing child exactly once unless a future partial-order format is deliberately added.
- A list must not include hidden source nodes unless the editor is explicitly editing hidden items.
- Reordering must preserve parent ownership.
- Post nodes inside a flow must not advance the flow spine.
- The resolver rebuilds `single`, `multi`, `flow`, and `post` edges from resolved config plus ordering patches.
- Structure edge arrays are derived output and must not be stored in overlay.

Validation examples:

- If `flow` lists `A, B, C`, generated structure edges are parent-to-`A`, `A`-to-`B`, and `B`-to-`C` after hidden/post filtering.
- If `post` lists `P` after `A`, the plan may render a post edge near `A`, but `P` must not become the previous normal flow step.
- If `children` contains a dependency-only target that is not a child of the parent, reject it.

## endFlow Representation

`endFlow` is a future node-level flow-control flag:

```ts
nodes: {
  [id: string]: {
    endFlow?: boolean;
  };
}
```

Semantics:

- `endFlow` means selecting the node exits the containing flow and proceeds to the next preview/execution stage.
- It is not a post flag.
- It is not an edge type.
- It must not move the node into `execution.postSteps`.
- It should be editable only after `PlanNode` and the generated runtime consume `endFlow` through the resolved config/plan path.

Validation:

- The target node must exist.
- The target node must be inside a flow context.
- The target should be a selectable leaf or prompt choice unless future planner semantics allow broader cases.
- Enabling `endFlow` outside a containing flow returns `invalid_end_flow_context`.

Until plan support lands, v2 may parse `endFlow` but the editor should keep it read-only or reject save patches that set it.

## Implementation Subtasks

1. Add v1/v2 Zod schemas and `PlanOverlayV2` types in the planner overlay module.
2. Add a parser that accepts v1 and v2 disk overlays and rejects unsupported future versions with structured errors.
3. Add `normalizePlanOverlay` and migrate v1 fields into the normalized internal model.
4. Add overlay diagnostics for stale node ids, stale dependencies, duplicate ordering ids, unsupported root mode patches, and invalid dependency cycles.
5. Add base config hash and overlay hash computation to the resolve response and Studio save payload.
6. Implement atomic v2 writes with same-directory temp files and backup creation.
7. Change save behavior so loaded v1 overlays save as v2 only after an edit or explicit migration.
8. Replace append-only v1 merge semantics with v2 patch semantics, including `null` field removal and `disabled: false`.
9. Add dependency patch application before plan building, with endpoint and cycle validation.
10. Add ordering patch application before plan building, with parent ownership validation.
11. Keep positions as a post-build plan-node overlay and report stale position ids.
12. Gate `endFlow` parsing and editing behind plan-model support.
13. Update Studio save API responses to include resolved plan, overlay version, config hash, overlay hash, and overlay diagnostics.
14. Add tests for v1 compatibility, v1-to-v2 migration, atomic write failure behavior, conflict responses, stale ids, disabled/hidden split, dependency patches, ordering patches, and future `endFlow` rejection until supported.

## Non-Goals

- Do not edit `src/`, tests, docs, or Studio visualization files in this design task.
- Do not make Studio a full YAML editor.
- Do not persist generated `InstallationPlan` edges or execution arrays.
- Do not infer order from React Flow positions.
- Do not edit scripts, prompt runtime behavior, package commands, or generated script templates through overlay v2.
