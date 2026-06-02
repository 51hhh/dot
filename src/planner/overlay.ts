import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Config, MenuItem } from "../loader/schema.js";
import type { InstallationPlan, PlanDiagnostic, PlanNode } from "./types.js";

const PlanPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const PlanOverlayOverrideSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  post: z.boolean().optional(),
  mode: z.enum(["single", "multi", "flow", "root"]).optional(),
}).strip();

const PlanOverlayV1Schema = z.object({
  version: z.literal(1),
  positions: z.record(PlanPositionSchema).optional(),
  disabled: z.array(z.string()).optional(),
  overrides: z.record(PlanOverlayOverrideSchema).optional(),
}).strip();

const OverlayBaseSchema = z.object({
  configPath: z.string().optional(),
  configHash: z.string().min(1).optional(),
  overlayHash: z.string().optional(),
  loadedAt: z.string().optional(),
  generatorVersion: z.string().optional(),
}).strip();

const DependencyPatchSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}).strip();

const OrderingPatchSchema = z.object({
  children: z.array(z.string()).optional(),
  flow: z.array(z.string()).optional(),
  post: z.array(z.string()).optional(),
}).strip();

const PlanOverlayNodePatchSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  disabled: z.boolean().optional(),
  post: z.boolean().optional(),
  mode: z.enum(["single", "multi", "flow"]).optional(),
  endFlow: z.boolean().optional(),
}).strip();

const PlanOverlayV2Schema = z.object({
  version: z.literal(2),
  base: OverlayBaseSchema.optional(),
  positions: z.record(PlanPositionSchema).optional(),
  nodes: z.record(PlanOverlayNodePatchSchema).optional(),
  dependencies: z.object({
    add: z.array(DependencyPatchSchema).optional(),
    remove: z.array(DependencyPatchSchema).optional(),
  }).strip().optional(),
  ordering: z.record(OrderingPatchSchema).optional(),
}).strip();

const PlanOverlaySchema = z.union([PlanOverlayV1Schema, PlanOverlayV2Schema]);

const SaveBaseSchema = z.object({
  configHash: z.string().min(1).optional(),
  overlayHash: z.string().optional(),
}).strip().optional();

export type PlanOverlayOverride = z.infer<typeof PlanOverlayOverrideSchema>;
export type PlanOverlayV1 = z.infer<typeof PlanOverlayV1Schema>;
export type PlanOverlayV2 = z.infer<typeof PlanOverlayV2Schema>;
export type PlanOverlay = z.infer<typeof PlanOverlaySchema>;
export type OverlayBase = z.infer<typeof OverlayBaseSchema>;
export type DependencyPatch = z.infer<typeof DependencyPatchSchema>;
export type OrderingPatch = z.infer<typeof OrderingPatchSchema>;
export type PlanOverlayValidationCode = "invalid_overlay" | "missing_patch";

export interface PlanOverlaySaveRequest {
  base?: z.infer<typeof SaveBaseSchema>;
  patch: PlanOverlay;
}

export interface NormalizedPlanOverlay {
  sourceVersion: 1 | 2;
  base?: OverlayBase;
  positions: Record<string, { x: number; y: number }>;
  nodes: Record<string, {
    label?: string;
    description?: string;
    hidden?: boolean;
    disabled?: boolean;
    post?: boolean;
    mode?: "single" | "multi" | "flow";
    endFlow?: boolean;
  }>;
  dependencies: {
    add: DependencyPatch[];
    remove: DependencyPatch[];
  };
  ordering: Record<string, OrderingPatch>;
  diagnostics: PlanDiagnostic[];
}

export class PlanOverlayValidationError extends Error {
  readonly code: PlanOverlayValidationCode;
  readonly issues: string[];

  constructor(message: string, code: PlanOverlayValidationCode, issues: string[]) {
    super(message);
    this.name = "PlanOverlayValidationError";
    this.code = code;
    this.issues = issues;
  }
}

export function planOverlayPathForConfig(configPath: string): string {
  return path.resolve(configPath).replace(/\.(ya?ml|json)$/i, ".plan.json");
}

export function loadPlanOverlay(planPath: string): PlanOverlay | null {
  if (!fs.existsSync(planPath)) return null;
  const raw = JSON.parse(fs.readFileSync(planPath, "utf-8")) as unknown;
  try {
    return parsePlanOverlay(raw);
  } catch (err: unknown) {
    if (err instanceof PlanOverlayValidationError) {
      throw new Error(`Invalid plan overlay ${planPath}: ${err.issues.join("; ")}`);
    }
    throw err;
  }
}

export function savePlanOverlay(planPath: string, overlay: PlanOverlay): void {
  const parsed = parsePlanOverlay(overlay);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
  const tempPath = `${planPath}.tmp-${process.pid}-${Date.now()}`;
  let wroteTemp = false;

  try {
    if (fs.existsSync(planPath) && fs.statSync(planPath).isFile()) {
      fs.copyFileSync(planPath, backupPathFor(planPath));
    }
    fs.writeFileSync(tempPath, serialized);
    wroteTemp = true;
    fs.renameSync(tempPath, planPath);
  } catch (err: unknown) {
    if (wroteTemp || fs.existsSync(tempPath)) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // best-effort cleanup only
      }
    }
    throw err;
  }
}

export function parsePlanOverlay(raw: unknown): PlanOverlay {
  const parsed = PlanOverlaySchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlanOverlayValidationError("Invalid plan overlay", "invalid_overlay", formatOverlayIssues(parsed.error));
  }
  return parsed.data;
}

export function parsePlanOverlayPayload(raw: unknown): PlanOverlay {
  return parsePlanOverlaySavePayload(raw).patch;
}

export function parsePlanOverlaySavePayload(raw: unknown): PlanOverlaySaveRequest {
  if (!isRecord(raw) || raw.patch === undefined) {
    throw new PlanOverlayValidationError("Plan overlay payload must include a patch field.", "missing_patch", ["patch: Required"]);
  }

  const base = SaveBaseSchema.safeParse(raw.base);
  if (!base.success) {
    throw new PlanOverlayValidationError("Invalid plan overlay save base", "invalid_overlay", formatOverlayIssues(base.error, "base"));
  }

  const parsed = PlanOverlaySchema.safeParse(raw.patch);
  if (!parsed.success) {
    throw new PlanOverlayValidationError("Invalid plan overlay patch", "invalid_overlay", formatOverlayIssues(parsed.error, "patch"));
  }
  return { base: base.data, patch: parsed.data };
}

export function mergePlanOverlay(current: PlanOverlay | null, patch: PlanOverlay): PlanOverlay {
  const currentV2 = current ? toPlanOverlayV2(current) : { version: 2 as const };
  const patchV2 = toPlanOverlayV2(patch);
  const positions = omitEmptyRecord({
    ...(currentV2.positions ?? {}),
    ...(patchV2.positions ?? {}),
  });
  const nodes = omitEmptyRecord({
    ...(currentV2.nodes ?? {}),
    ...(patchV2.nodes ?? {}),
  });
  const ordering = omitEmptyRecord({
    ...(currentV2.ordering ?? {}),
    ...(patchV2.ordering ?? {}),
  });
  const dependencies = {
    add: mergeDependencyPatches(currentV2.dependencies?.add, patchV2.dependencies?.add),
    remove: mergeDependencyPatches(currentV2.dependencies?.remove, patchV2.dependencies?.remove),
  };
  const next: PlanOverlayV2 = { version: 2, base: patchV2.base ?? currentV2.base };

  if (positions) next.positions = positions;
  if (nodes) next.nodes = nodes;
  if (dependencies.add.length > 0 || dependencies.remove.length > 0) next.dependencies = dependencies;
  if (ordering) next.ordering = ordering;
  if (!next.base) delete next.base;

  return next;
}

export function applyPlanOverlay(plan: InstallationPlan, overlay: PlanOverlay): InstallationPlan {
  const normalized = normalizePlanOverlay(overlay);
  const merged: InstallationPlan = {
    ...plan,
    nodes: { ...plan.nodes },
    diagnostics: [...plan.diagnostics],
  };

  for (const [id, position] of Object.entries(normalized.positions)) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = { ...merged.nodes[id], position };
  }

  for (const [id, override] of Object.entries(normalized.nodes)) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = applyPlanNodeOverride(merged.nodes[id], override);
    if (override.disabled) {
      merged.nodes[id] = { ...merged.nodes[id], hidden: true };
    }
  }

  return merged;
}

export function applyPlanOverlayToConfig(config: Config, overlay: PlanOverlay | null): Config {
  if (!overlay) return config;

  const normalized = normalizePlanOverlay(overlay);
  const nodePatches = normalized.nodes;

  function applyToItem(item: MenuItem): MenuItem {
    const override = nodePatches[item.id];
    const next: MenuItem = {
      ...item,
      children: item.children?.map(applyToItem),
    };

    if (!override) return next;

    if (override.label !== undefined) next.label = override.label;
    if (override.description !== undefined) next.description = override.description;
    if (override.hidden !== undefined) next.hidden = override.hidden;
    if (override.disabled !== undefined) next.hidden = override.disabled ? true : next.hidden;
    if (override.post !== undefined) next.post = override.post;
    if (override.mode !== undefined) next.mode = override.mode;
    if (override.endFlow !== undefined) next.endFlow = override.endFlow;

    return next;
  }

  const withNodes = {
    ...config,
    menu: config.menu.map(applyToItem),
  };

  return applyDependencyAndOrderingPatches(withNodes, normalized);
}

function applyPlanNodeOverride(node: PlanNode, override: PlanOverlayOverride): PlanNode {
  const next: PlanNode = { ...node };
  if (override.label !== undefined) next.label = override.label;
  if (override.description !== undefined) next.description = override.description;
  if (override.hidden !== undefined) next.hidden = override.hidden;
  if (override.post !== undefined) next.post = override.post;
  if (override.mode !== undefined) next.mode = override.mode;
  return next;
}

export function normalizePlanOverlay(overlay: PlanOverlay | null): NormalizedPlanOverlay {
  if (!overlay) {
    return {
      sourceVersion: 2,
      positions: {},
      nodes: {},
      dependencies: { add: [], remove: [] },
      ordering: {},
      diagnostics: [],
    };
  }

  const migrated = toPlanOverlayV2(overlay);
  return {
    sourceVersion: overlay.version,
    base: migrated.base,
    positions: migrated.positions ?? {},
    nodes: migrated.nodes ?? {},
    dependencies: {
      add: dedupeDependencyPatches(migrated.dependencies?.add ?? []),
      remove: dedupeDependencyPatches(migrated.dependencies?.remove ?? []),
    },
    ordering: migrated.ordering ?? {},
    diagnostics: [],
  };
}

export function overlayDiagnosticsForConfig(overlay: PlanOverlay | null, config: Config): PlanDiagnostic[] {
  const normalized = normalizePlanOverlay(overlay);
  const allNodes = collectConfigNodes(config);
  const diagnostics: PlanDiagnostic[] = [...normalized.diagnostics];

  for (const id of Object.keys(normalized.positions)) {
    if (!allNodes.has(id)) {
      diagnostics.push({
        level: "warn",
        code: "stale_node_id",
        nodeId: id,
        message: `Overlay position references unknown node "${id}".`,
      });
    }
  }

  for (const id of Object.keys(normalized.nodes)) {
    if (!allNodes.has(id)) {
      diagnostics.push({
        level: "warn",
        code: "stale_node_id",
        nodeId: id,
        message: `Overlay node patch references unknown node "${id}".`,
      });
    }
  }

  for (const dependency of [...normalized.dependencies.add, ...normalized.dependencies.remove]) {
    if (!allNodes.has(dependency.from) || !allNodes.has(dependency.to)) {
      diagnostics.push({
        level: "error",
        code: "stale_dependency",
        nodeId: !allNodes.has(dependency.to) ? dependency.to : dependency.from,
        message: `Overlay dependency references unknown endpoint "${dependency.from}" -> "${dependency.to}".`,
      });
    } else if (dependency.from === dependency.to) {
      diagnostics.push({
        level: "error",
        code: "invalid_dependency",
        nodeId: dependency.to,
        message: `Overlay dependency "${dependency.from}" -> "${dependency.to}" cannot point to itself.`,
      });
    }
  }

  const childrenByParent = collectChildrenByParent(config);
  for (const [parentId, ordering] of Object.entries(normalized.ordering)) {
    const childIds = childrenByParent.get(parentId);
    if (!childIds) {
      diagnostics.push({
        level: "error",
        code: "stale_ordering_id",
        nodeId: parentId,
        message: `Overlay ordering references unknown parent "${parentId}".`,
      });
      continue;
    }

    for (const [field, ids] of Object.entries(ordering) as Array<[keyof OrderingPatch, string[] | undefined]>) {
      if (!ids) continue;
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) {
          diagnostics.push({
            level: "error",
            code: "duplicate_ordering_id",
            nodeId: id,
            message: `Overlay ordering for "${parentId}.${field}" repeats "${id}".`,
          });
        }
        seen.add(id);
        if (!allNodes.has(id) || !childIds.has(id)) {
          diagnostics.push({
            level: "error",
            code: "stale_ordering_id",
            nodeId: id,
            message: `Overlay ordering for "${parentId}.${field}" references non-child "${id}".`,
          });
        }
      }
    }
  }

  return diagnostics;
}

export function overlayHashForPath(planPath: string): string | undefined {
  if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) return undefined;
  return sha256(fs.readFileSync(planPath));
}

export function configHashForPath(configPath: string): string {
  return sha256(fs.readFileSync(path.resolve(configPath)));
}

export function toPlanOverlayV2(overlay: PlanOverlay): PlanOverlayV2 {
  if (overlay.version === 2) return overlay as PlanOverlayV2;

  const v1 = overlay as PlanOverlayV1;
  const nodes: NonNullable<PlanOverlayV2["nodes"]> = {};

  for (const [id, override] of Object.entries(v1.overrides ?? {})) {
    nodes[id] = stripUndefined({
      label: override.label,
      description: override.description,
      hidden: override.hidden,
      post: override.post,
      mode: override.mode === "root" ? undefined : override.mode,
    });
  }

  for (const id of v1.disabled ?? []) {
    nodes[id] = { ...(nodes[id] ?? {}), disabled: true };
  }

  const next: PlanOverlayV2 = { version: 2 };
  if (v1.positions) next.positions = v1.positions;
  const cleanNodes = omitEmptyRecord(nodes);
  if (cleanNodes) next.nodes = cleanNodes;
  return next;
}

function applyDependencyAndOrderingPatches(config: Config, overlay: NormalizedPlanOverlay): Config {
  const byId = collectConfigNodes(config);
  const childrenByParent = collectChildrenByParent(config);

  for (const patch of overlay.dependencies.remove) {
    const target = byId.get(patch.to);
    if (!target || !byId.has(patch.from)) continue;
    target.deps = (target.deps ?? []).filter((dep) => dep !== patch.from);
    if (target.deps.length === 0) delete target.deps;
  }

  for (const patch of overlay.dependencies.add) {
    const target = byId.get(patch.to);
    if (!target || !byId.has(patch.from) || patch.from === patch.to) continue;
    target.deps = [...new Set([...(target.deps ?? []), patch.from])];
  }

  function reorder(items: MenuItem[]): MenuItem[] {
    return items.map((item) => {
      let children = item.children?.map((child) => ({ ...child }));
      const ordering = overlay.ordering[item.id];
      const childIds = childrenByParent.get(item.id);
      if (children && ordering?.children && childIds && isExactChildOrder(ordering.children, childIds)) {
        const byChildId = new Map(children.map((child) => [child.id, child]));
        children = ordering.children.map((id) => byChildId.get(id)!);
      }
      return { ...item, children: children ? reorder(children) : undefined };
    });
  }

  return { ...config, menu: reorder(config.menu) };
}

function collectConfigNodes(config: Config): Map<string, MenuItem> {
  const nodes = new Map<string, MenuItem>();
  function walk(items: MenuItem[]): void {
    for (const item of items) {
      nodes.set(item.id, item);
      walk(item.children ?? []);
    }
  }
  walk(config.menu);
  return nodes;
}

function collectChildrenByParent(config: Config): Map<string, Set<string>> {
  const childrenByParent = new Map<string, Set<string>>();
  function walk(items: MenuItem[]): void {
    for (const item of items) {
      childrenByParent.set(item.id, new Set((item.children ?? []).map((child) => child.id)));
      walk(item.children ?? []);
    }
  }
  walk(config.menu);
  return childrenByParent;
}

function isExactChildOrder(ids: string[], childIds: Set<string>): boolean {
  if (ids.length !== childIds.size) return false;
  return ids.every((id) => childIds.has(id)) && new Set(ids).size === ids.length;
}

function dedupeDependencyPatches(patches: DependencyPatch[]): DependencyPatch[] {
  return mergeDependencyPatches([], patches);
}

function mergeDependencyPatches(
  current: DependencyPatch[] | undefined,
  patch: DependencyPatch[] | undefined
): DependencyPatch[] {
  const seen = new Set<string>();
  const merged: DependencyPatch[] = [];
  for (const dependency of [...(current ?? []), ...(patch ?? [])]) {
    const key = `${dependency.from}\u0000${dependency.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(dependency);
  }
  return merged;
}

function stripUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function omitEmptyRecord<T>(record: Record<string, T>): Record<string, T> | undefined {
  const entries = Object.entries(record).filter(([, value]) => {
    if (value === undefined) return false;
    if (isRecord(value)) return Object.keys(value).length > 0;
    return true;
  });
  return entries.length > 0 ? Object.fromEntries(entries) as Record<string, T> : undefined;
}

function backupPathFor(planPath: string): string {
  const base = `${planPath}.bak`;
  if (!fs.existsSync(base)) return base;
  return `${base}-${Date.now()}`;
}

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatOverlayIssues(error: z.ZodError, prefix?: string): string[] {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "root";
      if (!prefix) return `${field}: ${issue.message}`;
      if (field === "root") return `${prefix}: ${issue.message}`;
      return `${prefix}.${field}: ${issue.message}`;
    });
}
