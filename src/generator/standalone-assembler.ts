import path from "node:path";
import type { Config, MenuItem } from "../loader/schema.js";
import type { InstallationPlan } from "../planner/types.js";
import { flattenNodes } from "../utils/deps.js";
import { generateBashRuntime } from "./standalone/bash-runtime.js";
import { serializeStandaloneData } from "./standalone/data.js";
import { generateStandaloneHeader } from "./standalone/header.js";
import { assertShellSafeId, bashFunctionNameForId } from "./standalone/ids.js";
import { planNodeFor } from "./standalone/nodes.js";
import { renderSnippetFunctions } from "./standalone/snippets.js";

export { bashFunctionNameForId } from "./standalone/ids.js";

export interface StandaloneAssembleOptions {
  config: Config;
  configPath: string;
  allNodes?: Map<string, MenuItem>;
  plan?: InstallationPlan;
  warnings?: string[];
}

export function assembleStandalone(opts: StandaloneAssembleOptions): string {
  const { config, configPath } = opts;
  const allNodes = opts.allNodes ?? flattenNodes(config.menu);
  const configDir = path.dirname(path.resolve(configPath));

  for (const id of allNodes.keys()) {
    assertShellSafeId(id);
  }

  const snippetFunctions = buildSnippetFunctionMap(allNodes, opts.plan);
  const unresolved = new Set<string>();
  const sections = [
    generateStandaloneHeader(config),
    generateBashRuntime(),
    serializeStandaloneData({ config, allNodes, snippetFunctions, plan: opts.plan }),
    renderSnippetFunctions({ config, configDir, allNodes, snippetFunctions, unresolved, plan: opts.plan }),
    'dot_main "$@"',
    "",
  ];

  if (unresolved.size > 0 && opts.warnings) {
    opts.warnings.push(`Unresolved template variables: ${[...unresolved].join(", ")}`);
  }

  return sections.join("\n");
}

function buildSnippetFunctionMap(
  allNodes: ReadonlyMap<string, MenuItem>,
  plan?: InstallationPlan
): Map<string, string> {
  const snippetFunctions = new Map<string, string>();
  for (const [id, node] of allNodes) {
    if (planNodeFor(id, plan, node).script) {
      snippetFunctions.set(id, bashFunctionNameForId(id));
    }
  }
  return snippetFunctions;
}
