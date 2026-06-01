import type { Config } from "../loader/schema.js";
import { isSafeHeaderMetadata } from "../loader/schema.js";

const DEFAULT_STANDALONE_DESCRIPTION = "Self-contained interactive installer";
const DEFAULT_LEGACY_DESCRIPTION = "Auto-generated configuration script";

export function headerCommentLine(value: string): string {
  if (!isSafeHeaderMetadata(value)) {
    throw new Error("Header metadata must not contain newlines or control characters");
  }
  return `#  ${value}`;
}

export function standaloneDescription(config: Config): string {
  return config.description ?? DEFAULT_STANDALONE_DESCRIPTION;
}

export function legacyDescription(config: Config): string {
  return config.description ?? DEFAULT_LEGACY_DESCRIPTION;
}
