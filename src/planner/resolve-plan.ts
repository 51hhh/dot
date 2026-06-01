import { loadConfig, validateConfigSemantics } from "../loader/loader.js";
import type { Config, MenuItem } from "../loader/schema.js";
import { flattenNodes } from "../utils/deps.js";
import { buildInstallationPlan } from "./build-plan.js";
import {
  applyPlanOverlayToConfig,
  loadPlanOverlay,
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
  const config = applyPlanOverlayToConfig(opts.loadedConfig, opts.overlay);
  validateConfigSemantics(config);

  const allNodes = flattenNodes(config.menu);
  const plan = withPlanValidationDiagnostics(applyOverlayPositions(buildInstallationPlan(config), opts.overlay));

  return {
    configPath: opts.configPath,
    overlayPath,
    loadedConfig: opts.loadedConfig,
    overlay: opts.overlay,
    config,
    allNodes,
    plan,
    diagnostics: plan.diagnostics,
  };
}

function applyOverlayPositions(plan: InstallationPlan, overlay: PlanOverlay | null): InstallationPlan {
  const positions = overlay?.positions;
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
