import type { Config, MenuItem } from "./schema.js";
import fs from "node:fs";
import path from "node:path";

/**
 * 检测循环依赖（使用 DFS）
 * 返回循环依赖链，如果没有循环则返回 null
 */
export function detectCircularDependency(
  allNodes: Map<string, MenuItem>
): { cycle: string[]; chain: string[] } | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) {
      // 找到循环，构建循环链
      const cycleStart = path.indexOf(id);
      return path.slice(cycleStart).concat(id);
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    const node = allNodes.get(id);

    if (node?.deps) {
      for (const dep of node.deps) {
        if (!allNodes.has(dep)) continue; // 未知依赖会在其他地方报错
        const cycle = dfs(dep, [...path, id]);
        if (cycle) {
          parent.set(dep, id);
          return cycle;
        }
      }
    }

    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of allNodes.keys()) {
    if (!visited.has(id)) {
      const cycle = dfs(id, []);
      if (cycle) {
        // 构建完整依赖链（从根到循环）
        const chain: string[] = [];
        let current = cycle[0];
        while (parent.has(current)) {
          const p = parent.get(current)!;
          if (chain.includes(p)) break;
          chain.unshift(p);
          current = p;
        }
        return { cycle, chain: [...chain, ...cycle] };
      }
    }
  }

  return null;
}

/**
 * 检查脚本路径是否存在
 */
export function validateScriptPaths(
  allNodes: Map<string, MenuItem>,
  configDir: string
): { id: string; path: string }[] {
  const missing: { id: string; path: string }[] = [];

  for (const [id, node] of allNodes) {
    if (node.script && typeof node.script === 'string') {
      const scriptPath = path.resolve(configDir, node.script);
      if (!fs.existsSync(scriptPath)) {
        missing.push({ id, path: node.script });
      }
    }
  }

  return missing;
}

/**
 * 检查 hidden 节点是否被依赖
 */
export function findHiddenNodeDependencies(
  allNodes: Map<string, MenuItem>
): { dependent: string; hiddenDep: string }[] {
  const violations: { dependent: string; hiddenDep: string }[] = [];

  for (const [id, node] of allNodes) {
    if (!node.deps) continue;
    for (const dep of node.deps) {
      const depNode = allNodes.get(dep);
      if (depNode?.hidden) {
        violations.push({ dependent: id, hiddenDep: dep });
      }
    }
  }

  return violations;
}

/**
 * Bash 保留字列表
 */
const BASH_RESERVED_WORDS = new Set([
  "if", "then", "else", "elif", "fi", "case", "esac", "for", "select",
  "while", "until", "do", "done", "in", "function", "time", "coproc",
  "!", "{", "}", "[[", "]]", "test", "export", "readonly", "local",
  "declare", "typeset", "unset", "shift", "return", "exit", "break",
  "continue", "trap", "source", ".", "eval", "exec", "set", "unalias"
]);

/**
 * 检查节点 ID 是否与 Bash 保留字冲突
 */
export function findBashReservedWordConflicts(
  allNodes: Map<string, MenuItem>
): string[] {
  const conflicts: string[] = [];
  for (const id of allNodes.keys()) {
    if (BASH_RESERVED_WORDS.has(id)) {
      conflicts.push(id);
    }
  }
  return conflicts;
}

/**
 * 检查最大嵌套深度
 */
export function checkMaxDepth(
  menu: MenuItem[],
  maxDepth: number = 10
): { id: string; depth: number } | null {
  function walk(items: MenuItem[], depth: number): { id: string; depth: number } | null {
    if (depth > maxDepth) {
      return { id: items[0]?.id || "unknown", depth };
    }
    for (const item of items) {
      if (item.children) {
        const violation = walk(item.children, depth + 1);
        if (violation) return violation;
      }
    }
    return null;
  }
  return walk(menu, 1);
}

/**
 * 验证模板变量一致性（基础版本 - 简单正则匹配）
 * 更完整的实现需要解析模板语法
 */
export function validateTemplateVariables(
  node: MenuItem,
  scriptContent: string
): { missing: string[]; declared: string[] } {
  // 提取模板中的变量引用 {{var}}
  const varPattern = /\{\{(\w+)\}\}/g;
  const usedVars = new Set<string>();
  let match;
  while ((match = varPattern.exec(scriptContent)) !== null) {
    usedVars.add(match[1]);
  }

  // 声明的变量：node.vars + node.prompt.var
  const declaredVars = new Set<string>();
  if (node.vars) {
    for (const key of Object.keys(node.vars)) {
      declaredVars.add(key);
    }
  }
  if (node.prompt?.var) {
    declaredVars.add(node.prompt.var);
  }

  // 找出未声明的变量
  const missing = [...usedVars].filter(v => !declaredVars.has(v));

  return {
    missing,
    declared: [...declaredVars]
  };
}
