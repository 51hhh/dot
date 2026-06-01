import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Config, MenuItem } from "../loader/schema.js";
import type { InstallationPlan, PlanNode } from "./types.js";

const PlanOverlayOverrideSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  post: z.boolean().optional(),
  mode: z.enum(["single", "multi", "flow", "root"]).optional(),
}).strip();

const PlanOverlaySchema = z.object({
  version: z.literal(1),
  positions: z.record(z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  })).optional(),
  disabled: z.array(z.string()).optional(),
  overrides: z.record(PlanOverlayOverrideSchema).optional(),
}).strip();

export type PlanOverlayOverride = z.infer<typeof PlanOverlayOverrideSchema>;
export type PlanOverlay = z.infer<typeof PlanOverlaySchema>;
export type PlanOverlayValidationCode = "invalid_overlay" | "missing_patch";

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
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(overlay, null, 2)}\n`);
}

export function parsePlanOverlay(raw: unknown): PlanOverlay {
  const parsed = PlanOverlaySchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlanOverlayValidationError("Invalid plan overlay", "invalid_overlay", formatOverlayIssues(parsed.error));
  }
  return parsed.data;
}

export function parsePlanOverlayPayload(raw: unknown): PlanOverlay {
  if (!isRecord(raw) || raw.patch === undefined) {
    throw new PlanOverlayValidationError("Plan overlay payload must include a patch field.", "missing_patch", ["patch: Required"]);
  }

  const parsed = PlanOverlaySchema.safeParse(raw.patch);
  if (!parsed.success) {
    throw new PlanOverlayValidationError("Invalid plan overlay patch", "invalid_overlay", formatOverlayIssues(parsed.error, "patch"));
  }
  return parsed.data;
}

export function mergePlanOverlay(current: PlanOverlay | null, patch: PlanOverlay): PlanOverlay {
  const positions = {
    ...(current?.positions ?? {}),
    ...(patch.positions ?? {}),
  };
  const disabled = [...new Set([...(current?.disabled ?? []), ...(patch.disabled ?? [])])];
  const overrides = {
    ...(current?.overrides ?? {}),
    ...(patch.overrides ?? {}),
  };
  const next: PlanOverlay = { version: 1 };

  if (Object.keys(positions).length > 0) next.positions = positions;
  if (disabled.length > 0) next.disabled = disabled;
  if (Object.keys(overrides).length > 0) next.overrides = overrides;

  return next;
}

export function applyPlanOverlay(plan: InstallationPlan, overlay: PlanOverlay): InstallationPlan {
  const merged: InstallationPlan = {
    ...plan,
    nodes: { ...plan.nodes },
    diagnostics: [...plan.diagnostics],
  };

  for (const [id, position] of Object.entries(overlay.positions ?? {})) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = { ...merged.nodes[id], position };
  }

  for (const [id, override] of Object.entries(overlay.overrides ?? {})) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = applyPlanNodeOverride(merged.nodes[id], override);
  }

  for (const id of overlay.disabled ?? []) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = { ...merged.nodes[id], hidden: true };
  }

  return merged;
}

export function applyPlanOverlayToConfig(config: Config, overlay: PlanOverlay | null): Config {
  if (!overlay) return config;

  const disabled = new Set(overlay.disabled ?? []);
  const overrides = overlay.overrides ?? {};

  function applyToItem(item: MenuItem): MenuItem {
    const override = overrides[item.id];
    const next: MenuItem = {
      ...item,
      children: item.children?.map(applyToItem),
    };

    if (!override) {
      if (disabled.has(item.id)) next.hidden = true;
      return next;
    }

    if (override.label !== undefined) next.label = override.label;
    if (override.description !== undefined) next.description = override.description;
    if (override.hidden !== undefined) next.hidden = override.hidden;
    if (override.post !== undefined) next.post = override.post;
    if (override.mode !== undefined && override.mode !== "root") next.mode = override.mode;
    if (disabled.has(item.id)) next.hidden = true;

    return next;
  }

  return {
    ...config,
    menu: config.menu.map(applyToItem),
  };
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
