import path from "node:path";
import type { Config, MenuItem } from "../../loader/schema.js";
import type { InstallationPlan } from "../../planner/types.js";
import { loadTemplate } from "../template.js";
import { planNodeFor } from "./nodes.js";

export interface SnippetRenderOptions {
  config: Config;
  configDir: string;
  allNodes: ReadonlyMap<string, MenuItem>;
  snippetFunctions: ReadonlyMap<string, string>;
  unresolved: Set<string>;
  plan?: InstallationPlan;
}

export function renderSnippetFunctions({
  config,
  configDir,
  allNodes,
  snippetFunctions,
  unresolved,
  plan,
}: SnippetRenderOptions): string {
  const sections: string[] = [];

  for (const [id, node] of allNodes) {
    const func = snippetFunctions.get(id);
    const buildNode = planNodeFor(id, plan, node);
    if (!func || !buildNode.script) continue;

    const scriptPath = path.isAbsolute(buildNode.script)
      ? buildNode.script
      : path.resolve(configDir, buildNode.script);
    const mergedVars = { ...config.vars, ...node.vars };
    let scriptContent = loadTemplate(scriptPath, mergedVars, unresolved).trimEnd();
    for (const prompt of collectPrompts(node)) {
      scriptContent = replaceRenderedPromptValue(scriptContent, prompt.var, mergedVars[prompt.var] ?? "");
    }

    sections.push(`# ─── ${buildNode.label} (${id}) ───`);
    sections.push(`${func}() {`);
    sections.push(scriptContent);
    sections.push("}");
  }

  return sections.join("\n\n");
}

function collectPrompts(node: MenuItem): Array<{ var: string }> {
  const prompts: Array<{ var: string }> = [];
  function walk(item: MenuItem) {
    if (item.prompt) {
      prompts.push({ var: item.prompt.var });
    }
    for (const child of item.children ?? []) {
      walk(child);
    }
  }
  walk(node);
  return prompts;
}

function replaceRenderedPromptValue(content: string, varName: string, fallback: string): string {
  if (!fallback) return content;
  const escaped = fallback.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(escaped, "g"), `\${DOT_VARS[${varName}]:-${fallback}}`);
}
