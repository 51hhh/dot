import fs from "node:fs";
import type { Config, MenuItem } from "../../loader/schema.js";
import type { InstallationPlan } from "../../planner/types.js";
import { resolveTemplatePath } from "../template.js";
import { bashQuote } from "./ids.js";
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

    const scriptPath = resolveTemplatePath(buildNode.script, configDir);
    const mergedVars = { ...config.vars, ...node.vars };
    const rawScriptContent = fs.readFileSync(scriptPath, "utf-8");
    const promptVars = new Set(collectPrompts(node).map((prompt) => prompt.var));
    const scriptContent = renderStandaloneSnippetTemplate(rawScriptContent, mergedVars, promptVars, unresolved).trimEnd();

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

function renderStandaloneSnippetTemplate(
  content: string,
  vars: Record<string, string>,
  promptVars: ReadonlySet<string>,
  unresolved: Set<string>
): string {
  return content.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (_match, key: string, defaultValue: string | undefined) => {
    if (promptVars.has(key)) {
      const fallback = key in vars ? vars[key] : defaultValue ?? "";
      return `$(dot_get_var_or_default ${bashQuote(key)} ${bashQuote(fallback)})`;
    }
    if (key in vars) return vars[key];
    if (defaultValue !== undefined) return defaultValue;
    unresolved.add(key);
    return `{{${key}}}`;
  });
}
