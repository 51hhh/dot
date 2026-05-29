import { z } from "zod";

export const MenuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    script: z.string().optional(),
    vars: z.record(z.string()).optional(),
    deps: z.array(z.string()).optional(),
    children: z.array(MenuItemSchema).optional(),
    post: z.boolean().optional(),
  })
);

export const ConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().default("1.0"),
  description: z.string().optional(),
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
  deps?: string[];
  children?: MenuItem[];
  /** If true, this node runs after all non-post nodes regardless of topo order */
  post?: boolean;
}

export type Config = z.infer<typeof ConfigSchema>;
