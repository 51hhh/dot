import type { MenuItem } from "../loader/schema.js";

/**
 * Collect all nodes into a flat map keyed by id.
 */
export function flattenNodes(nodes: MenuItem[]): Map<string, MenuItem> {
  const map = new Map<string, MenuItem>();
  function walk(items: MenuItem[]) {
    for (const item of items) {
      map.set(item.id, item);
      if (item.children) walk(item.children);
    }
  }
  walk(nodes);
  return map;
}

/**
 * Get all leaf node ids from a subtree.
 */
export function getLeafIds(node: MenuItem): string[] {
  if (!node.children || node.children.length === 0) return [node.id];
  return node.children.flatMap(getLeafIds);
}

/**
 * Finds an explicit single-choice branch inside a subtree.
 *
 * Noninteractive selection can safely expand multi/flow branches, but expanding
 * a single-choice branch would select mutually exclusive options at once.
 */
export function findAmbiguousSingleChoiceBranch(node: MenuItem): MenuItem | undefined {
  const visibleChildren = (node.children ?? []).filter((child) => !child.hidden);
  if (node.mode === "single" && visibleChildren.length > 1) {
    return node;
  }

  for (const child of visibleChildren) {
    const match = findAmbiguousSingleChoiceBranch(child);
    if (match) return match;
  }

  return undefined;
}

/**
 * Resolve dependencies for a set of selected ids.
 * Returns the full set including auto-resolved deps.
 */
export function resolveDeps(selectedIds: Set<string>, allNodes: Map<string, MenuItem>): Set<string> {
  const resolved = new Set(selectedIds);
  const queue = [...selectedIds];

  while (queue.length > 0) {
    const id = queue.pop()!;
    const node = allNodes.get(id);
    if (!node?.deps) continue;
    for (const dep of node.deps) {
      if (!resolved.has(dep)) {
        resolved.add(dep);
        queue.push(dep);
      }
    }
  }

  return resolved;
}

/**
 * Topological sort of selected nodes by deps.
 * Throws on circular dependency.
 */
export function topoSort(ids: Set<string>, allNodes: Map<string, MenuItem>): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> nodes that depend on it

  for (const id of ids) {
    inDegree.set(id, 0);
  }

  for (const id of ids) {
    const node = allNodes.get(id);
    if (!node?.deps) continue;
    for (const dep of node.deps) {
      if (!ids.has(dep)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  if (sorted.length !== ids.size) {
    const remaining = [...ids].filter((id) => !sorted.includes(id));
    throw new Error(`Circular dependency detected among: ${remaining.join(", ")}`);
  }

  return sorted;
}
