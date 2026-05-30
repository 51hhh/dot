import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ConfigSchema, type Config, type MenuItem } from "./schema.js";

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
  validateConfigSemantics(config);
  return config;
}

function validateConfigSemantics(config: Config): void {
  const allNodes = new Map<string, MenuItem>();

  // Collect all nodes and check for duplicate IDs
  function walk(items: MenuItem[]) {
    for (const item of items) {
      if (allNodes.has(item.id)) {
        throw new Error(`Duplicate menu item id: "${item.id}"`);
      }
      allNodes.set(item.id, item);
      if (item.children) walk(item.children);
    }
  }
  walk(config.menu);

  // Validate deps and post constraints
  for (const [id, node] of allNodes) {
    if (!node.deps) continue;
    for (const dep of node.deps) {
      if (!allNodes.has(dep)) {
        throw new Error(`Menu item "${id}" depends on unknown item "${dep}"`);
      }
      // Non-post nodes must not depend on post nodes
      if (!node.post && allNodes.get(dep)?.post) {
        throw new Error(
          `Menu item "${id}" depends on post-item "${dep}", but post items run last. Reverse the dependency or mark "${id}" as post too.`
        );
      }
    }
  }
}
