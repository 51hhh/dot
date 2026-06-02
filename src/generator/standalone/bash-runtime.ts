import { generateRuntimeCore } from "./runtime/core.js";
import { generateRuntimeGithub } from "./runtime/github.js";
import { generateRuntimeTerminal } from "./runtime/terminal.js";
import { generateRuntimePrompt } from "./runtime/prompt.js";
import { generateRuntimeSelection } from "./runtime/selection.js";
import { generateRuntimePlanning } from "./runtime/planning.js";
import { generateRuntimeDryRun } from "./runtime/dry-run.js";
import { generateRuntimeExecution } from "./runtime/execution.js";

export function generateBashRuntime(): string {
  return [
    generateRuntimeCore(),
    generateRuntimeGithub(),
    generateRuntimeTerminal(),
    generateRuntimePrompt(),
    generateRuntimeSelection(),
    generateRuntimePlanning(),
    generateRuntimeDryRun(),
    generateRuntimeExecution(),
  ].join("\n\n").replace(/@\{/g, "${");
}
