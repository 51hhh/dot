import fs from "node:fs";
import path from "node:path";
import type { Config, MenuItem } from "../loader/schema.js";
import type { InstallationPlan, PlanNode } from "./types.js";

export interface PlanOverlay {
  version: 1;
  positions?: Record<string, { x: number; y: number }>;
  disabled?: string[];
  overrides?: Record<string, Partial<PlanNode>>;
}

export function planOverlayPathForConfig(configPath: string): string {
  return path.resolve(configPath).replace(/\.(ya?ml|json)$/i, ".plan.json");
}

export function loadPlanOverlay(planPath: string): PlanOverlay | null {
  if (!fs.existsSync(planPath)) return null;
  return JSON.parse(fs.readFileSync(planPath, "utf-8")) as PlanOverlay;
}

export function savePlanOverlay(planPath: string, overlay: PlanOverlay): void {
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(overlay, null, 2)}\n`);
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

  for (const id of overlay.disabled ?? []) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = { ...merged.nodes[id], hidden: true };
  }

  for (const [id, override] of Object.entries(overlay.overrides ?? {})) {
    if (!merged.nodes[id]) continue;
    merged.nodes[id] = { ...merged.nodes[id], ...override };
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
