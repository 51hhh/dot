import fs from "node:fs";

/**
 * Replace {{variable}} placeholders in template content.
 * Supports default values: {{variable:default_value}}
 * @param unresolved If provided, collects names of variables that have no value and no default.
 */
export function renderTemplate(
  content: string,
  vars: Record<string, string>,
  unresolved?: Set<string>
): string {
  return content.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (_match, key, defaultVal) => {
    if (key in vars) return vars[key];
    if (defaultVal !== undefined) return defaultVal;
    unresolved?.add(key);
    return `{{${key}}}`;
  });
}

/**
 * Load and render a template file.
 * @param unresolved If provided, collects names of unresolved variables.
 */
export function loadTemplate(
  templatePath: string,
  vars: Record<string, string>,
  unresolved?: Set<string>
): string {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  const content = fs.readFileSync(templatePath, "utf-8");
  return renderTemplate(content, vars, unresolved);
}
