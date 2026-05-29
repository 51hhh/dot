import fs from "node:fs";

/**
 * Replace {{variable}} placeholders in template content.
 * Supports default values: {{variable:default_value}}
 */
export function renderTemplate(
  content: string,
  vars: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (_match, key, defaultVal) => {
    if (key in vars) return vars[key];
    if (defaultVal !== undefined) return defaultVal;
    return `{{${key}}}`; // leave unresolved
  });
}

/**
 * Load and render a template file.
 */
export function loadTemplate(
  templatePath: string,
  vars: Record<string, string>
): string {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  const content = fs.readFileSync(templatePath, "utf-8");
  return renderTemplate(content, vars);
}
