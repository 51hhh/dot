import { isShellSafeMenuId } from "../../loader/schema.js";

export const ROOT_ID = "__root";

export function bashFunctionNameForId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
  return `dot_run_${safe}_${stableHash(id)}`;
}

export function assertShellSafeId(id: string): void {
  if (!isShellSafeMenuId(id)) {
    throw new Error(`Menu item id "${id}" is not shell-safe. Use only letters, digits, "_", and "-".`);
  }
}

export function bashQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function assocAssign(name: string, key: string, value: string): string {
  return `${name}[${bashQuote(key)}]=${bashQuote(value)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
