import type { Config, MenuItem } from "../../loader/schema.js";
import type { InstallationPlan } from "../../planner/types.js";
import { getLeafIds } from "../../utils/deps.js";
import { assocAssign, bashQuote, ROOT_ID } from "./ids.js";
import { buildInheritedModeMap, planNodeFor } from "./nodes.js";

export interface StandaloneDataOptions {
  config: Config;
  allNodes: ReadonlyMap<string, MenuItem>;
  snippetFunctions: ReadonlyMap<string, string>;
  plan?: InstallationPlan;
}

export function serializeStandaloneData({
  config,
  allNodes,
  snippetFunctions,
  plan,
}: StandaloneDataOptions): string {
  const inheritedModes = buildInheritedModeMap(config);
  const rootMode = config.menuMode ?? "single";
  const lines: string[] = [
    `DOT_TITLE=${bashQuote(config.name)}`,
    "declare -a DOT_ALL_IDS=(" + [...allNodes.keys()].map(bashQuote).join(" ") + ")",
    "declare -A DOT_LABELS=()",
    "declare -A DOT_DESCRIPTIONS=()",
    "declare -A DOT_CHILDREN=()",
    "declare -A DOT_DEPS=()",
    "declare -A DOT_LEAVES=()",
    "declare -A DOT_MODES=()",
    "declare -A DOT_EXPLICIT_MODES=()",
    "declare -A DOT_HIDDEN=()",
    "declare -A DOT_PROMPT_TYPES=()",
    "declare -A DOT_PROMPT_VARS=()",
    "declare -A DOT_PROMPT_LABELS=()",
    "declare -A DOT_END_FLOW=()",
    "declare -A DOT_POST=()",
    "declare -A DOT_SNIPPET_FUNCS=()",
    assocAssign("DOT_LABELS", ROOT_ID, config.name),
    assocAssign("DOT_DESCRIPTIONS", ROOT_ID, config.description ?? ""),
    assocAssign("DOT_CHILDREN", ROOT_ID, config.menu.map((item) => item.id).join(" ")),
    assocAssign("DOT_MODES", ROOT_ID, rootMode),
    assocAssign("DOT_EXPLICIT_MODES", ROOT_ID, config.menuMode ?? ""),
    assocAssign("DOT_HIDDEN", ROOT_ID, "0"),
    assocAssign("DOT_PROMPT_TYPES", ROOT_ID, ""),
    assocAssign("DOT_PROMPT_VARS", ROOT_ID, ""),
    assocAssign("DOT_PROMPT_LABELS", ROOT_ID, ""),
  ];

  for (const [id, node] of allNodes) {
    const buildNode = planNodeFor(id, plan, node);
    const children = node.children?.map((child) => child.id).join(" ") ?? "";
    const deps = node.deps?.join(" ") ?? "";
    const leaves = getLeafIds(node).join(" ");

    lines.push(assocAssign("DOT_LABELS", id, buildNode.label));
    lines.push(assocAssign("DOT_DESCRIPTIONS", id, buildNode.description ?? ""));
    lines.push(assocAssign("DOT_CHILDREN", id, children));
    lines.push(assocAssign("DOT_DEPS", id, deps));
    lines.push(assocAssign("DOT_LEAVES", id, leaves));
    lines.push(assocAssign("DOT_MODES", id, buildNode.mode === "root" ? rootMode : buildNode.mode ?? inheritedModes.get(id) ?? rootMode));
    lines.push(assocAssign("DOT_EXPLICIT_MODES", id, node.mode ?? ""));
    lines.push(assocAssign("DOT_HIDDEN", id, buildNode.hidden ? "1" : "0"));
    lines.push(assocAssign("DOT_PROMPT_TYPES", id, buildNode.prompt?.type ?? ""));
    lines.push(assocAssign("DOT_PROMPT_VARS", id, buildNode.prompt?.var ?? ""));
    lines.push(assocAssign("DOT_PROMPT_LABELS", id, buildNode.prompt?.label ?? ""));
    lines.push(assocAssign("DOT_END_FLOW", id, node.endFlow ? "1" : "0"));
    lines.push(assocAssign("DOT_POST", id, buildNode.post ? "1" : "0"));

    const func = snippetFunctions.get(id);
    if (func) {
      lines.push(assocAssign("DOT_SNIPPET_FUNCS", id, func));
    }
  }

  return lines.join("\n");
}
