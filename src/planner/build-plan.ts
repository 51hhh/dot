import type { Config, MenuItem } from "../loader/schema.js";
import { flattenNodes, resolveDeps, topoSort } from "../utils/deps.js";
import type {
  InstallationPlan,
  PlanDiagnostic,
  PlanEdge,
  PlanExecutionStep,
  PlanNode,
} from "./types.js";

const ROOT_ID = "__root";

export function buildInstallationPlan(config: Config): InstallationPlan {
  const allNodes = flattenNodes(config.menu);
  const diagnostics: PlanDiagnostic[] = [];
  const nodes: Record<string, PlanNode> = {
    [ROOT_ID]: {
      id: ROOT_ID,
      label: config.name,
      description: config.description,
      kind: "root",
      mode: config.menuMode ?? "single",
    },
  };
  const edges: PlanEdge[] = [];

  const rootMode = config.menuMode ?? "single";
  for (const item of config.menu) {
    collectPlanNodes(item, nodes, rootMode);
  }
  collectChildEdges(config.menu, ROOT_ID, edges, rootMode);

  const selectedIds = new Set<string>();
  for (const [id, node] of allNodes) {
    if (node.script) selectedIds.add(id);
  }
  const resolvedIds = resolveDeps(selectedIds, allNodes);
  let executionOrder: string[] = [];

  try {
    executionOrder = topoSort(resolvedIds, allNodes);
  } catch (err) {
    diagnostics.push({
      level: "error",
      code: "circular-dependency",
      message: err instanceof Error ? err.message : String(err),
    });
    executionOrder = [...resolvedIds];
  }

  const normalSteps: PlanExecutionStep[] = [];
  const postSteps: PlanExecutionStep[] = [];
  for (const id of executionOrder) {
    const node = allNodes.get(id);
    if (!node?.script) continue;
    const step: PlanExecutionStep = {
      id,
      label: node.label,
      reason: node.post ? "post" : selectedIds.has(id) ? "selected" : "dependency",
      script: node.script,
    };
    if (node.post) {
      postSteps.push(step);
    } else {
      normalSteps.push(step);
    }
  }

  const postIds = executionOrder.filter((id) => allNodes.get(id)?.post && allNodes.get(id)?.script);
  if (postIds.length > 0) {
    const nonPostIds = normalSteps.map((step) => step.id);
    if (nonPostIds.some((id) => postIds.includes(id))) {
      diagnostics.push({
        level: "warn",
        code: "post-order",
        message: "Post nodes should execute after all normal nodes.",
      });
    }
  }

  return {
    version: 1,
    root: ROOT_ID,
    nodes,
    edges,
    execution: {
      normalSteps,
      postSteps,
    },
    diagnostics,
  };
}

function collectPlanNodes(
  item: MenuItem,
  nodes: Record<string, PlanNode>,
  inheritedMode: "single" | "multi" | "flow"
): void {
  if (nodes[item.id]) return;
  const mode = item.mode ?? inheritedMode;
  nodes[item.id] = {
    id: item.id,
    label: item.label,
    description: item.description,
    kind: item.children?.length ? "group" : item.prompt ? "prompt" : "action",
    hidden: item.hidden,
    post: item.post,
    mode,
    prompt: item.prompt,
    script: item.script,
  };

  for (const child of item.children ?? []) {
    collectPlanNodes(child, nodes, mode);
  }
}

function collectPlanEdges(
  item: MenuItem,
  parentId: string,
  edges: PlanEdge[],
  inheritedMode: "single" | "multi" | "flow",
  connectToParent: boolean
): void {
  const mode = item.mode ?? inheritedMode;
  if (connectToParent) {
    edges.push({ from: parentId, to: item.id, type: item.post ? "post" : inheritedMode });
  }

  for (const dep of item.deps ?? []) {
    edges.push({ from: dep, to: item.id, type: "dependency" });
  }

  const children = item.children ?? [];
  if (children.length === 0) return;

  collectChildEdges(children, item.id, edges, mode);
}

function collectChildEdges(
  children: MenuItem[],
  parentId: string,
  edges: PlanEdge[],
  mode: "single" | "multi" | "flow"
): void {
  if (mode === "flow") {
    let previousVisibleId = parentId;
    for (const child of children) {
      const childVisible = !child.hidden;
      collectPlanEdges(child, previousVisibleId, edges, mode, childVisible);
      if (childVisible && !child.post) {
        previousVisibleId = child.id;
      }
    }
    return;
  }

  for (const child of children) {
    collectPlanEdges(child, parentId, edges, mode, !child.hidden);
  }
}
