import type { Config, MenuItem } from "../../loader/schema.js";
import type { InstallationPlan, PlanNode } from "../../planner/types.js";

export type MenuMode = NonNullable<MenuItem["mode"]>;

export function planNodeFor(id: string, plan: InstallationPlan | undefined, fallback: MenuItem): MenuItem | PlanNode {
  return plan?.nodes[id] ?? fallback;
}

export function buildInheritedModeMap(config: Config): Map<string, MenuMode> {
  const modes = new Map<string, MenuMode>();
  const rootMode = config.menuMode ?? "single";

  function walk(items: MenuItem[], inheritedMode: MenuMode): void {
    for (const item of items) {
      const mode = item.mode ?? inheritedMode;
      modes.set(item.id, mode);
      walk(item.children ?? [], mode);
    }
  }

  walk(config.menu, rootMode);
  return modes;
}
