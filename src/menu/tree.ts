import type { MenuItem } from "../loader/schema.js";

/**
 * Render a tree representation of the menu for debugging/display.
 */
export function printTree(nodes: MenuItem[], indent = ""): string {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const prefix = indent + (isLast ? "└── " : "├── ");
    const childIndent = indent + (isLast ? "    " : "│   ");

    let line = `${prefix}${node.label}`;
    if (node.script) line += ` [${node.script}]`;
    if (node.deps?.length) line += ` (deps: ${node.deps.join(", ")})`;
    lines.push(line);

    if (node.children) {
      lines.push(printTree(node.children, childIndent));
    }
  }
  return lines.join("\n");
}

/**
 * Find a node by id in the tree.
 */
export function findNode(nodes: MenuItem[], id: string): MenuItem | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Check if a node is a leaf (has no children).
 */
export function isLeaf(node: MenuItem): boolean {
  return !node.children || node.children.length === 0;
}

/**
 * Get breadcrumb path from root to a node id.
 */
export function getBreadcrumb(nodes: MenuItem[], targetId: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    const currentPath = [...path, node.label];
    if (node.id === targetId) return currentPath;
    if (node.children) {
      const found = getBreadcrumb(node.children, targetId, currentPath);
      if (found) return found;
    }
  }
  return null;
}
