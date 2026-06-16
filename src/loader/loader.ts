import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ConfigSchema, isShellSafeMenuId, type Config, type MenuItem } from "./schema.js";
import {
  detectCircularDependency,
  validateScriptPaths,
  findHiddenNodeDependencies,
  findBashReservedWordConflicts,
  checkMaxDepth,
  validateTemplateVariables
} from "./validators.js";

export function loadConfig(configPath: string): Config {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  const raw = fs.readFileSync(resolved, "utf-8");

  let data: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    data = yaml.load(raw);
  } else if (ext === ".json") {
    data = JSON.parse(raw);
  } else {
    throw new Error(`Unsupported config format: ${ext}. Use .yaml, .yml, or .json`);
  }

  const config = ConfigSchema.parse(data);
  const configDir = path.dirname(resolved);
  validateConfigSemantics(config, configDir);
  return config;
}

export function validateConfigSemantics(config: Config, configDir: string): void {
  const allNodes = new Map<string, MenuItem>();

  // Collect all nodes and check for duplicate IDs
  function walk(items: MenuItem[]) {
    for (const item of items) {
      if (!isShellSafeMenuId(item.id)) {
        throw new Error(
          `Menu item id "${item.id}" is not shell-safe. Use only letters, digits, "_", and "-".`
        );
      }
      if (allNodes.has(item.id)) {
        throw new Error(`Duplicate menu item id: "${item.id}"`);
      }
      allNodes.set(item.id, item);
      if (item.children) walk(item.children);
    }
  }
  walk(config.menu);

  // Check 1: Bash reserved word conflicts
  const reservedConflicts = findBashReservedWordConflicts(allNodes);
  if (reservedConflicts.length > 0) {
    throw new Error(
      `Menu item IDs conflict with Bash reserved words: ${reservedConflicts.join(", ")}\n` +
      `  Rename these IDs to avoid shell scripting issues.`
    );
  }

  // Check 2: Maximum nesting depth
  const depthViolation = checkMaxDepth(config.menu);
  if (depthViolation) {
    throw new Error(
      `Menu nesting too deep at "${depthViolation.id}" (depth: ${depthViolation.depth}, max: 10)\n` +
      `  Consider flattening the menu structure or splitting into multiple configs.`
    );
  }

  // Check 3: Circular dependency detection (pre-check before topoSort)
  const circularDep = detectCircularDependency(allNodes);
  if (circularDep) {
    const { cycle, chain } = circularDep;
    throw new Error(
      `Circular dependency detected:\n` +
      `  Dependency chain: ${chain.join(" → ")}\n` +
      `  Cycle: ${cycle.join(" → ")}\n` +
      `  Fix: Remove one of the dependencies in the cycle to break it.`
    );
  }

  // Validate deps and post constraints
  for (const [id, node] of allNodes) {
    if (!node.deps) continue;
    for (const dep of node.deps) {
      if (!allNodes.has(dep)) {
        throw new Error(
          `Menu item "${id}" depends on unknown item "${dep}"\n` +
          `  Check for typos or ensure "${dep}" is defined in the config.`
        );
      }
      // Non-post nodes must not depend on post nodes
      if (!node.post && allNodes.get(dep)?.post) {
        throw new Error(
          `Menu item "${id}" depends on post-item "${dep}", but post items run last.\n` +
          `  Fix: Either mark "${id}" as post too, or remove the dependency on "${dep}".`
        );
      }
    }
  }

  // Check 4: Hidden nodes being depended on (Warning only - this is a valid pattern for shared deps)
  const hiddenDeps = findHiddenNodeDependencies(allNodes);
  if (hiddenDeps.length > 0) {
    const examples = hiddenDeps.slice(0, 3).map(v => `"${v.dependent}" → "${v.hiddenDep}"`).join(", ");
    console.warn(
      `⚠️  Warning: Hidden nodes are being depended on: ${examples}\n` +
      `   Hidden nodes as shared dependencies is valid, but consider if they should be visible.`
    );
  }

  // Check 5: Script paths exist (disabled temporarily for debugging)
  /*
  const missingScripts = validateScriptPaths(allNodes, configDir);
  if (missingScripts.length > 0) {
    const examples = missingScripts.slice(0, 3).map(s => `"${s.id}": ${s.path}`).join(", ");
    throw new Error(
      `Script files not found: ${examples}${missingScripts.length > 3 ? ` (and ${missingScripts.length - 3} more)` : ""}\n` +
      `  Check that script paths are relative to the config file directory.`
    );
  }
  */

  // Check 6: Template variable consistency (disabled temporarily)
  /*
  for (const [id, node] of allNodes) {
    if (node.script && typeof node.script === 'string') {
      const scriptPath = path.resolve(configDir, node.script);
      if (fs.existsSync(scriptPath)) {
        const scriptContent = fs.readFileSync(scriptPath, "utf-8");
        const varCheck = validateTemplateVariables(node, scriptContent);
        if (varCheck.missing.length > 0) {
          console.warn(
            `⚠️  Warning: Node "${id}" uses undeclared variables in script: ${varCheck.missing.join(", ")}\n` +
            `   Declared variables: ${varCheck.declared.join(", ") || "(none)"}`
          );
        }
      }
    }
  }
  */
}
