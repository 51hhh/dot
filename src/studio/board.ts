import type { InstallationPlan, PlanEdge, PlanNode, PlanStructureEdgeType } from "../planner/types.js";
import { isStructureEdgeType } from "../planner/types.js";

export type WorkflowBoardItemRole = "step" | "single" | "multi" | "post" | "dependency";

export interface WorkflowBoardDependency {
  id: string;
  label: string;
  hidden?: boolean;
}

export interface WorkflowBoardItem {
  id: string;
  label: string;
  description?: string;
  kind: PlanNode["kind"];
  mode?: PlanNode["mode"];
  role: WorkflowBoardItemRole;
  hidden?: boolean;
  post?: boolean;
  script?: string;
  prompt?: PlanNode["prompt"];
  dependsOn: WorkflowBoardDependency[];
  requiredBy: WorkflowBoardDependency[];
}

export interface WorkflowBoardOptionGroup {
  type: "single" | "multi" | "post";
  label: string;
  description: string;
  items: WorkflowBoardItem[];
}

export interface WorkflowBoardNestedFlow {
  expanded: boolean;
  stepCount: number;
  optionCount: number;
  postCount: number;
  steps: WorkflowBoardStep[];
}

export interface WorkflowBoardStep extends WorkflowBoardItem {
  index: number;
  optionGroups: WorkflowBoardOptionGroup[];
  nestedFlow?: WorkflowBoardNestedFlow;
}

export interface WorkflowBoardModule extends WorkflowBoardItem {
  steps: WorkflowBoardStep[];
  stepCount: number;
  optionCount: number;
  postCount: number;
  dependencyCount: number;
}

export interface WorkflowBoard {
  root: WorkflowBoardItem;
  modules: WorkflowBoardModule[];
}

export interface WorkflowBoardOptions {
  expandedNodeIds?: ReadonlySet<string>;
}

type IndexedEdge = PlanEdge & { index: number };
type StructureEdge = IndexedEdge & { type: PlanStructureEdgeType };

const optionGroupLabels: Record<WorkflowBoardOptionGroup["type"], { label: string; description: string }> = {
  single: {
    label: "单选路径",
    description: "用户从这一组里选择一个具体方案。",
  },
  multi: {
    label: "可选配置",
    description: "用户可以按需选择多个独立项目。",
  },
  post: {
    label: "后置动作",
    description: "安装计划确认后追加执行，通常用于收尾、提示或清理。",
  },
};

export function buildWorkflowBoard(plan: InstallationPlan, options: WorkflowBoardOptions = {}): WorkflowBoard {
  const expandedNodeIds = options.expandedNodeIds ?? new Set<string>();
  const structureChildren = new Map<string, StructureEdge[]>();
  const incomingDependencies = new Map<string, IndexedEdge[]>();
  const outgoingDependencies = new Map<string, IndexedEdge[]>();

  plan.edges.forEach((edge, index) => {
    const indexed = { ...edge, index };
    if (edge.type === "dependency") {
      const incoming = incomingDependencies.get(edge.to) ?? [];
      incoming.push(indexed);
      incomingDependencies.set(edge.to, incoming);
      const outgoing = outgoingDependencies.get(edge.from) ?? [];
      outgoing.push(indexed);
      outgoingDependencies.set(edge.from, outgoing);
      return;
    }

    if (!isStructureEdgeType(edge.type)) return;
    const children = structureChildren.get(edge.from) ?? [];
    children.push(indexed as StructureEdge);
    structureChildren.set(edge.from, children);
  });

  for (const edges of structureChildren.values()) {
    edges.sort((a, b) => a.index - b.index);
  }
  for (const edges of incomingDependencies.values()) {
    edges.sort((a, b) => a.index - b.index);
  }
  for (const edges of outgoingDependencies.values()) {
    edges.sort((a, b) => a.index - b.index);
  }

  const topLevelNodeIds = new Set(
    structureEdgesFrom(plan.root)
      .filter((edge) => edge.type !== "post")
      .map((edge) => edge.to)
  );

  const root = boardItemFor(plan.root, "step");
  const modules = structureEdgesFrom(plan.root)
    .filter((edge) => edge.type !== "post")
    .map((edge) => buildModule(edge.to));

  return { root, modules };

  function structureEdgesFrom(id: string): StructureEdge[] {
    return (structureChildren.get(id) ?? []).filter((edge) => Boolean(plan.nodes[edge.to]));
  }

  function edgesOfType<T extends PlanStructureEdgeType>(id: string, type: T): Array<StructureEdge & { type: T }> {
    return structureEdgesFrom(id).filter((edge): edge is StructureEdge & { type: T } => edge.type === type);
  }

  function firstLocalFlowEdge(id: string): StructureEdge | undefined {
    return edgesOfType(id, "flow")[0];
  }

  function nextOuterFlowEdge(flowRootId: string, currentId: string): StructureEdge | undefined {
    const flowEdges = edgesOfType(currentId, "flow");
    if (flowEdges.length === 0) return undefined;

    const currentNode = plan.nodes[currentId];
    if (currentId !== flowRootId && currentNode?.kind === "group" && currentNode.mode === "flow") {
      return flowEdges.length > 1 ? flowEdges[flowEdges.length - 1] : undefined;
    }

    return flowEdges[0];
  }

  function collectFlowStepIds(flowRootId: string, nextEdgeFor = nextOuterFlowEdge): string[] {
    const ids: string[] = [];
    const seen = new Set<string>([flowRootId]);
    let currentId = flowRootId;

    while (true) {
      const edge = nextEdgeFor(flowRootId, currentId);
      if (!edge || seen.has(edge.to)) break;
      ids.push(edge.to);
      seen.add(edge.to);
      currentId = edge.to;
    }

    return ids;
  }

  function localFlowIds(flowRootId: string): string[] {
    if (!firstLocalFlowEdge(flowRootId)) return [];
    return collectFlowStepIds(flowRootId, (_rootId, currentId) => edgesOfType(currentId, "flow")[0]);
  }

  function isCollapsibleFlow(id: string): boolean {
    const node = plan.nodes[id];
    return node?.kind === "group" && node.mode === "flow" && !topLevelNodeIds.has(id) && localFlowIds(id).length > 0;
  }

  function buildModule(id: string): WorkflowBoardModule {
    const stepIds = plan.nodes[id]?.mode === "flow"
      ? collectFlowStepIds(id)
      : structureEdgesFrom(id).map((edge) => edge.to);
    const steps = stepIds.map((stepId, index) => buildStep(stepId, index + 1));
    const optionCount = countOptions(steps);
    const postCount = countPosts(steps);
    const dependencyCount = steps.reduce(
      (sum, step) => sum + step.dependsOn.length + step.requiredBy.length + dependencyCountForOptions(step),
      0
    );

    return {
      ...boardItemFor(id, "step"),
      steps,
      stepCount: steps.length,
      optionCount,
      postCount,
      dependencyCount,
    };
  }

  function buildStep(id: string, index: number): WorkflowBoardStep {
    const nestedFlow = buildNestedFlow(id);
    return {
      ...boardItemFor(id, "step"),
      index,
      optionGroups: buildOptionGroups(id),
      nestedFlow,
    };
  }

  function buildOptionGroups(id: string): WorkflowBoardOptionGroup[] {
    return (["single", "multi", "post"] as const)
      .map((type) => {
        const items = edgesOfType(id, type).map((edge) => boardItemFor(edge.to, type));
        const copy = optionGroupLabels[type];
        return { type, label: copy.label, description: copy.description, items };
      })
      .filter((group) => group.items.length > 0);
  }

  function buildNestedFlow(id: string): WorkflowBoardNestedFlow | undefined {
    if (!isCollapsibleFlow(id)) return undefined;
    const ids = localFlowIds(id);
    const expanded = expandedNodeIds.has(id);
    const steps = expanded ? ids.map((stepId, index) => buildStep(stepId, index + 1)) : [];
    const summarySteps = ids.map((stepId, index) => buildStep(stepId, index + 1));

    return {
      expanded,
      stepCount: ids.length,
      optionCount: countOptions(summarySteps),
      postCount: countPosts(summarySteps),
      steps,
    };
  }

  function boardItemFor(id: string, role: WorkflowBoardItemRole): WorkflowBoardItem {
    const node = plan.nodes[id];
    return {
      id,
      label: node?.label ?? id,
      description: node?.description,
      kind: node?.kind ?? "action",
      mode: node?.mode,
      role,
      hidden: node?.hidden,
      post: node?.post,
      script: node?.script,
      prompt: node?.prompt,
      dependsOn: dependenciesFor(incomingDependencies.get(id) ?? [], "from"),
      requiredBy: dependenciesFor(outgoingDependencies.get(id) ?? [], "to"),
    };
  }

  function dependenciesFor(edges: IndexedEdge[], endpoint: "from" | "to"): WorkflowBoardDependency[] {
    return edges
      .map((edge) => plan.nodes[edge[endpoint]])
      .filter((node): node is PlanNode => Boolean(node))
      .map((node) => ({
        id: node.id,
        label: node.label,
        hidden: node.hidden,
      }));
  }
}

function countOptions(steps: WorkflowBoardStep[]): number {
  return steps.reduce((sum, step) => (
    sum
    + step.optionGroups
      .filter((group) => group.type === "single" || group.type === "multi")
      .reduce((groupSum, group) => groupSum + group.items.length, 0)
    + (step.nestedFlow?.optionCount ?? 0)
  ), 0);
}

function countPosts(steps: WorkflowBoardStep[]): number {
  return steps.reduce((sum, step) => (
    sum
    + step.optionGroups
      .filter((group) => group.type === "post")
      .reduce((groupSum, group) => groupSum + group.items.length, 0)
    + (step.nestedFlow?.postCount ?? 0)
  ), 0);
}

function dependencyCountForOptions(step: WorkflowBoardStep): number {
  return step.optionGroups.reduce((sum, group) => (
    sum + group.items.reduce((itemSum, item) => itemSum + item.dependsOn.length + item.requiredBy.length, 0)
  ), 0);
}
