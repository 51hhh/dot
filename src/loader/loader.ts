import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ConfigSchema, type Config } from "./schema.js";

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

  return ConfigSchema.parse(data);
}

export function resolveTemplatePath(templatePath: string, configPath: string): string {
  if (path.isAbsolute(templatePath)) return templatePath;
  const configDir = path.dirname(path.resolve(configPath));
  return path.resolve(configDir, templatePath);
}
