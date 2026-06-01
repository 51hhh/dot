import path from "node:path";
import fs from "node:fs";
import type { Config, MenuItem } from "../../loader/schema.js";
import type { InstallationPlan } from "../../planner/types.js";
import { loadTemplate } from "../template.js";
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

    const scriptPath = path.isAbsolute(buildNode.script)
      ? buildNode.script
      : path.resolve(configDir, buildNode.script);
    const mergedVars = { ...config.vars, ...node.vars };
    const rawScriptContent = fs.readFileSync(scriptPath, "utf-8");
    let scriptContent = loadTemplate(scriptPath, mergedVars, unresolved).trimEnd();
    for (const prompt of collectPrompts(node)) {
      for (const fallback of promptFallbacks(rawScriptContent, prompt.var, mergedVars)) {
        scriptContent = replaceRenderedPromptValue(scriptContent, prompt.var, fallback);
      }
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
  return content.replace(new RegExp(escaped, "g"), `$(dot_get_var_or_default ${bashQuote(varName)} ${bashQuote(fallback)})`);
}

function promptFallbacks(
  rawContent: string,
  varName: string,
  mergedVars: Record<string, string>
): string[] {
  const fallbacks = new Set<string>();
  const configuredValue = mergedVars[varName];
  if (configuredValue) fallbacks.add(configuredValue);

  const pattern = /\{\{(\w+)(?::([^}]*))?\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawContent)) !== null) {
    const [, key, defaultValue] = match;
    if (key === varName && defaultValue) {
      fallbacks.add(defaultValue);
    }
  }

  return [...fallbacks];
}
