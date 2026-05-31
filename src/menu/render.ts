import * as readline from "node:readline";
import type { MenuItem } from "../loader/schema.js";
import { c } from "../utils/colors.js";
import { isLeaf } from "./tree.js";

export interface RenderOptions {
  selected: Set<string>;
  autoDeps: Set<string>;
}

/**
 * Render a menu level and get user selection.
 * Uses a loop instead of recursion to avoid stack overflow on repeated invalid input.
 */
export async function renderMenu(
  nodes: MenuItem[],
  opts: RenderOptions,
  breadcrumb: string[]
): Promise<
  | { action: "select"; ids: string[] }
  | { action: "enter"; childIndex: number }
  | { action: "back" }
  | { action: "quit" }
  | { action: "confirm" }
> {
  while (true) {
    // Print breadcrumb
    if (breadcrumb.length > 0) {
      console.log(`\n  ${c.breadcrumb(breadcrumb.join(" > "))}`);
    }

    console.log(`  ${"─".repeat(40)}`);

    // Print menu items
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const num = c.highlight(`[${i + 1}]`);
      const hasChildren = !isLeaf(node);

      let status = "";
      if (opts.selected.has(node.id)) {
        status = c.selected(" ✓");
      } else if (opts.autoDeps.has(node.id)) {
        status = c.dep(" (dep)");
      }

      const arrow = hasChildren ? c.dim(" >") : "";
      const desc = node.description ? c.dim(` - ${node.description}`) : "";

      console.log(`  ${num} ${node.label}${status}${arrow}${desc}`);
    }

    console.log(`  ${"─".repeat(40)}`);
    console.log(`  ${c.dim("[0]")} 返回上级  ${c.dim("[q]")} 退出  ${c.dim("[a]")} 全选  ${c.dim("[c]")} 确认生成`);
    console.log();

    const answer = await prompt("  请选择 (数字可逗号分隔多选): ");
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === "q" || trimmed === "quit") return { action: "quit" };
    if (trimmed === "0") return { action: "back" };
    if (trimmed === "a") {
      return { action: "select", ids: nodes.map((n) => n.id) };
    }
    if (trimmed === "c" || trimmed === "confirm") return { action: "confirm" };

    // Parse selection: could be "1", "1,3,5", or "1-3"
    const ids: string[] = [];
    const parts = trimmed.split(/[,\s]+/).filter(Boolean);

    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= nodes.length) ids.push(nodes[i - 1].id);
          }
        }
      } else {
        const num = Number(part);
        if (!isNaN(num) && num >= 1 && num <= nodes.length) {
          ids.push(nodes[num - 1].id);
        }
      }
    }

    if (ids.length === 0) {
      console.log(c.warn("  无效选择，请重试"));
      continue; // loop instead of recursion
    }

    // If single selection and has children, enter submenu
    if (ids.length === 1) {
      const idx = nodes.findIndex((n) => n.id === ids[0]);
      if (idx >= 0 && !isLeaf(nodes[idx])) {
        return { action: "enter", childIndex: idx };
      }
    }

    return { action: "select", ids };
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const cleanup = () => {
    rl.close();
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
      rl.close();
      resolve(answer);
    });
  });
}
