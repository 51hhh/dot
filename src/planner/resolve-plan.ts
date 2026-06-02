import { loadConfig, validateConfigSemantics } from "../loader/loader.js";
import type { Config, MenuItem } from "../loader/schema.js";
import { flattenNodes } from "../utils/deps.js";
import { buildInstallationPlan } from "./build-plan.js";
import {
  applyPlanOverlayToConfig,
  configHashForPath,
  loadPlanOverlay,
  normalizePlanOverlay,
  overlayDiagnosticsForConfig,
  overlayHashForPath,
  planOverlayPathForConfig,
  type PlanOverlay,
} from "./overlay.js";
import type { InstallationPlan, PlanDiagnostic } from "./types.js";
import { withPlanValidationDiagnostics } from "./validate-plan.js";

export interface ResolvedInstallationPlan {
  configPath: string;
  overlayPath: string;
  loadedConfig: Config;
  overlay: PlanOverlay | null;
  overlayVersion: 1 | 2 | null;
  configHash: string;
  overlayHash?: string;
  config: Config;
  allNodes: Map<string, MenuItem>;
  plan: InstallationPlan;
  diagnostics: PlanDiagnostic[];
}

export function resolveInstallationPlan(configPath: string): ResolvedInstallationPlan {
  const loadedConfig = loadConfig(configPath);
  const overlayPath = planOverlayPathForConfig(configPath);
  const overlay = loadPlanOverlay(overlayPath);

  return resolveInstallationPlanFromConfig({
    configPath,
    overlayPath,
    loadedConfig,
    overlay,
  });
}

export function resolveInstallationPlanFromConfig(opts: {
  configPath: string;
  overlayPath?: string;
  loadedConfig: Config;
  overlay: PlanOverlay | null;
}): ResolvedInstallationPlan {
  const overlayPath = opts.overlayPath ?? planOverlayPathForConfig(opts.configPath);
  const overlayDiagnostics = overlayDiagnosticsForConfig(opts.overlay, opts.loadedConfig);
  const config = applyPlanOverlayToConfig(opts.loadedConfig, opts.overlay);
  validateConfigSemantics(config);

  const allNodes = flattenNodes(config.menu);
  const basePlan = buildInstallationPlan(config);
  const plan = withPlanValidationDiagnostics(applyOverlayPositions({
    ...basePlan,
    diagnostics: [...overlayDiagnostics, ...basePlan.diagnostics],
  }, opts.overlay));

  return {
    configPath: opts.configPath,
    overlayPath,
    loadedConfig: opts.loadedConfig,
    overlay: opts.overlay,
    overlayVersion: opts.overlay?.version ?? null,
    configHash: configHashForPath(opts.configPath),
    overlayHash: overlayHashForPath(overlayPath),
    config,
    allNodes,
    plan,
    diagnostics: plan.diagnostics,
  };
}

function applyOverlayPositions(plan: InstallationPlan, overlay: PlanOverlay | null): InstallationPlan {
  const positions = normalizePlanOverlay(overlay).positions;
  if (!positions) return plan;

  const nodes = { ...plan.nodes };
  for (const [id, position] of Object.entries(positions)) {
    if (!nodes[id]) continue;
    nodes[id] = { ...nodes[id], position };
  }

  return {
    ...plan,
    nodes,
  };
}
