import { z } from "zod";

const HEADER_METADATA_PATTERN = /^[^\r\n\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/;
const SHELL_SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const headerMetadataMessage =
  "Header metadata must not contain newlines or control characters";

export function isShellSafeMenuId(id: string): boolean {
  return SHELL_SAFE_ID_PATTERN.test(id);
}

export function isSafeHeaderMetadata(value: string): boolean {
  return HEADER_METADATA_PATTERN.test(value);
}

export const PromptSchema = z.object({
  type: z.enum(["key", "key-compose", "text"]),
  var: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Prompt var must be a shell-safe identifier"),
  label: z.string().min(1),
});

export const MenuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    script: z.string().optional(),
    vars: z.record(z.string()).optional(),
    prompt: PromptSchema.optional(),
    deps: z.array(z.string()).optional(),
    children: z.array(MenuItemSchema).optional(),
    mode: z.enum(["single", "multi", "flow"]).optional(),
    hidden: z.boolean().optional(),
    post: z.boolean().optional(),
    endFlow: z.boolean().optional(),
  })
);

export const ConfigSchema = z.object({
  name: z.string().min(1).regex(HEADER_METADATA_PATTERN, headerMetadataMessage),
  version: z.string().regex(HEADER_METADATA_PATTERN, headerMetadataMessage).default("1.0"),
  description: z.string().regex(HEADER_METADATA_PATTERN, headerMetadataMessage).optional(),
  menuMode: z.enum(["single", "multi", "flow"]).optional(),
  output: z
    .object({
      filename: z.string().default("setup.sh"),
      dir: z.string().default("dist"),
    })
    .default({}),
  vars: z.record(z.string()).optional(),
  menu: z.array(MenuItemSchema).min(1),
});

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  script?: string;
  vars?: Record<string, string>;
  prompt?: {
    type: "key" | "key-compose" | "text";
    var: string;
    label: string;
  };
  deps?: string[];
  children?: MenuItem[];
  /** Controls how this node's children are selected in generated standalone scripts */
  mode?: "single" | "multi" | "flow";
  /** If true, this node participates in deps/execution but is not shown in menus */
  hidden?: boolean;
  /** If true, this node runs after all non-post nodes regardless of topo order */
  post?: boolean;
  /** If true, selecting this item ends the containing flow and proceeds to plan preview */
  endFlow?: boolean;
}

export type Config = z.infer<typeof ConfigSchema>;
