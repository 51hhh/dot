import type { MenuItem, Config } from "../loader/schema.js";
import { flattenNodes, resolveDeps, getLeafIds } from "../utils/deps.js";
import { isLeaf, getBreadcrumb } from "./tree.js";
import { renderMenu } from "./render.js";
import { c } from "../utils/colors.js";

export interface NavResult {
  selectedIds: Set<string>;
  quit: boolean;
}

/**
 * Run the interactive menu navigator.
 * Returns the set of selected leaf node ids.
 */
export async function navigate(config: Config): Promise<NavResult> {
  const allNodes = flattenNodes(config.menu);
  const selected = new Set<string>();
  const path: { nodes: MenuItem[]; label: string }[] = [
    { nodes: config.menu, label: config.name },
  ];

  while (true) {
    const current = path[path.length - 1];
    const breadcrumb = path.map((p) => p.label);

    // Compute auto-deps for display
    const resolved = resolveDeps(selected, allNodes);
    const autoDeps = new Set([...resolved].filter((id) => !selected.has(id)));

    const result = await renderMenu(current.nodes, { selected, autoDeps }, breadcrumb);

    if (result.action === "quit") {
      return { selectedIds: selected, quit: true };
    }

    if (result.action === "back") {
      if (path.length > 1) {
        path.pop();
      } else {
        return { selectedIds: selected, quit: true };
      }
      continue;
    }

    if (result.action === "confirm") {
      // Resolve deps and return
      const resolved = resolveDeps(selected, allNodes);
      return { selectedIds: resolved, quit: false };
    }

    if (result.action === "enter") {
      const node = current.nodes[result.childIndex];
      path.push({ nodes: node.children!, label: node.label });
      continue;
    }

    if (result.action === "select") {
      for (const id of result.ids) {
        const node = allNodes.get(id)!;
        if (isLeaf(node)) {
          // Toggle leaf selection
          if (selected.has(id)) {
            selected.delete(id);
          } else {
            selected.add(id);
          }
        } else {
          // For branch nodes, select all leaves + the branch itself (for deps)
          const leafIds = getLeafIds(node);
          const allSelected = leafIds.every((lid) => selected.has(lid)) && selected.has(id);
          if (allSelected) {
            selected.delete(id);
            for (const lid of leafIds) selected.delete(lid);
          } else {
            selected.add(id);
            for (const lid of leafIds) selected.add(lid);
          }
        }
      }
      continue;
    }
  }
}
