import type {
  InstallationPlan,
  PlanEdge,
  PlanNode,
  PlanStructureEdgeType,
} from "../planner/types.js";
import { isStructureEdgeType } from "../planner/types.js";

export type StudioLayoutPoint = { x: number; y: number };

export interface StudioNestedFlowSummary {
  expanded: boolean;
  stepCount: number;
  optionCount: number;
  postCount: number;
}

export interface StudioStepFrameSummary {
  singleCount: number;
  multiCount: number;
  postCount: number;
  optionCount: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StudioNodeData extends PlanNode {
  nestedFlow?: StudioNestedFlowSummary;
  stepFrame?: StudioStepFrameSummary;
}

export interface StudioProjectedNode {
  id: string;
  position: StudioLayoutPoint;
  data: StudioNodeData;
}

export interface StudioProjectedEdge {
  id: string;
  source: string;
  target: string;
  type: PlanEdge["type"];
  nested?: boolean;
}

export interface StudioGraph {
  nodes: StudioProjectedNode[];
  edges: StudioProjectedEdge[];
  visibleNodeIds: Set<string>;
  compactNodeIds: Set<string>;
  primarySpines: Record<string, string[]>;
}

export interface StudioGraphOptions {
  showDependencies?: boolean;
  expandedNodeIds?: ReadonlySet<string>;
}

type IndexedEdge = PlanEdge & { index: number };
type StructureEdge = IndexedEdge & { type: PlanStructureEdgeType };
type BranchEdge = StructureEdge & { type: "single" | "multi" | "post" };

const SPINE_SPACING = 780;
const MODULE_START_Y = 560;
const MODULE_GAP = 260;
const LOCAL_LANE_X_OFFSET = 200;
const LOCAL_LANE_COLUMN_SPACING = 290;
const SINGLE_LANE_Y_OFFSET = -170;
const MULTI_LANE_Y_OFFSET = 170;
const POST_LANE_Y_OFFSET = 420;
const LOCAL_NODE_SPACING = 165;
const NESTED_FLOW_OFFSET = 980;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 132;
const NODE_GAP = 24;

export function buildStudioGraph(plan: InstallationPlan, options: StudioGraphOptions = {}): StudioGraph {
  const expandedNodeIds = options.expandedNodeIds ?? new Set<string>();
  const structureChildren = new Map<string, StructureEdge[]>();
  const dependencyEdges: IndexedEdge[] = [];

  plan.edges.forEach((edge, index) => {
    const indexed = { ...edge, index };
    if (edge.type === "dependency") {
      dependencyEdges.push(indexed);
      return;
    }
    if (!isStructureEdgeType(edge.type)) return;
    const children = structureChildren.get(edge.from) ?? [];
    children.push(indexed as StructureEdge);
    structureChildren.set(edge.from, children);
  });

  for (const children of structureChildren.values()) {
    children.sort((a, b) => a.index - b.index);
  }

  const topLevelNodeIds = new Set(
    structureEdgesFrom(plan.root).filter((edge) => edge.type !== "post").map((edge) => edge.to)
  );
  const visibleNodeIds = new Set<string>();
  const compactNodeIds = new Set<string>();
  const ownerByNodeId = new Map<string, string>();
  const positions = new Map<string, StudioLayoutPoint>();
  const projectedEdges = new Map<string, StudioProjectedEdge>();
  const primarySpines: Record<string, string[]> = {};

  function structureEdgesFrom(id: string): StructureEdge[] {
    return (structureChildren.get(id) ?? []).filter((edge) => Boolean(plan.nodes[edge.to]));
  }

  function edgesOfType<T extends PlanStructureEdgeType>(id: string, type: T): Array<StructureEdge & { type: T }> {
    return structureEdgesFrom(id).filter((edge): edge is StructureEdge & { type: T } => edge.type === type);
  }

  function localLaneEdges(id: string): BranchEdge[] {
    return structureEdgesFrom(id).filter(
      (edge): edge is BranchEdge => edge.type === "single" || edge.type === "multi" || edge.type === "post"
    );
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

  function collectFlowSpineIds(flowRootId: string, nextEdgeFor = nextOuterFlowEdge): string[] {
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
    return collectFlowSpineIds(flowRootId, (_rootId, currentId) => edgesOfType(currentId, "flow")[0]);
  }

  function isCollapsibleFlow(id: string): boolean {
    return plan.nodes[id]?.mode === "flow" && !topLevelNodeIds.has(id) && localFlowIds(id).length > 0;
  }

  function isExpandedFlow(id: string): boolean {
    return isCollapsibleFlow(id) && expandedNodeIds.has(id);
  }

  function addVisibleNode(id: string, position: StudioLayoutPoint): void {
    if (!plan.nodes[id]) return;
    visibleNodeIds.add(id);
    compactNodeIds.delete(id);
    ownerByNodeId.set(id, id);
    if (!positions.has(id)) {
      positions.set(id, plan.nodes[id].position ?? position);
    }
  }

  function boundsForNodeIds(ids: string[]): { top: number; bottom: number } | null {
    const points = ids
      .map((id) => positions.get(id))
      .filter((position): position is StudioLayoutPoint => Boolean(position));
    if (points.length === 0) return null;
    return {
      top: Math.min(...points.map((position) => position.y)),
      bottom: Math.max(...points.map((position) => position.y + NODE_HEIGHT)),
    };
  }

  function translateNodeIds(ids: string[], deltaY: number): void {
    if (deltaY === 0) return;
    for (const id of ids) {
      const position = positions.get(id);
      if (!position) continue;
      positions.set(id, { x: position.x, y: position.y + deltaY });
    }
  }

  function markCollapsedSubtree(id: string, ownerId: string): void {
    if (!plan.nodes[id] || visibleNodeIds.has(id)) return;
    compactNodeIds.add(id);
    ownerByNodeId.set(id, ownerId);
    for (const edge of structureEdgesFrom(id)) {
      markCollapsedSubtree(edge.to, ownerId);
    }
  }

  function addProjectedEdge(edge: StructureEdge, nested = false): void {
    if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) return;
    const id = `${edge.type}:${edge.from}->${edge.to}`;
    projectedEdges.set(id, {
      id,
      source: edge.from,
      target: edge.to,
      type: edge.type,
      nested,
    });
  }

  function layoutLocalLanes(parentId: string, nested: boolean): void {
    const parentPosition = positions.get(parentId);
    if (!parentPosition) return;

    const singleEdges = edgesOfType(parentId, "single");
    const multiEdges = edgesOfType(parentId, "multi");
    const postEdges = edgesOfType(parentId, "post");
    const multiRows = localLaneRowCount(multiEdges);
    const postLaneYOffset = multiRows > 0
      ? MULTI_LANE_Y_OFFSET + (multiRows + 1) * LOCAL_NODE_SPACING
      : POST_LANE_Y_OFFSET;

    layoutLocalLane(parentId, singleEdges, parentPosition, SINGLE_LANE_Y_OFFSET - Math.max(0, singleEdges.length - 1) * LOCAL_NODE_SPACING, nested);
    layoutLocalLane(parentId, multiEdges, parentPosition, MULTI_LANE_Y_OFFSET, nested);
    layoutLocalLane(parentId, postEdges, parentPosition, postLaneYOffset, nested);
  }

  function layoutLocalLane(parentId: string, edges: BranchEdge[], parentPosition: StudioLayoutPoint, yOffset: number, nested: boolean): void {
    if (edges.length === 0) return;
    const columns = localLaneColumnCount(edges);
    const direction = yOffset < 0 ? -1 : 1;

    edges.forEach((edge, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = parentPosition.x + LOCAL_LANE_X_OFFSET + column * LOCAL_LANE_COLUMN_SPACING;
      let y = parentPosition.y + yOffset + row * LOCAL_NODE_SPACING;

      // Avoid overlap with already-placed nodes at the same X column
      let attempts = 0;
      while (attempts < 100) {
        let overlap = false;
        for (const pos of positions.values()) {
          if (Math.abs(pos.x - x) < NODE_WIDTH + NODE_GAP && Math.abs(pos.y - y) < NODE_HEIGHT + NODE_GAP) {
            overlap = true;
            break;
          }
        }
        if (!overlap) break;
        y += direction * LOCAL_NODE_SPACING;
        attempts++;
      }

      addVisibleNode(edge.to, { x, y });
      addProjectedEdge(edge, nested);
      layoutVisibleNodeChildren(edge.to, nested);
    });
  }

  function localLaneColumnCount(edges: BranchEdge[]): number {
    if (edges.length <= 4) return 1;
    const terminalEdges = edges.filter((edge) => structureEdgesFrom(edge.to).length === 0);
    if (terminalEdges.length === edges.length) {
      return Math.min(2, Math.ceil(edges.length / 4));
    }
    return 2;
  }

  function localLaneRowCount(edges: BranchEdge[]): number {
    if (edges.length === 0) return 0;
    return Math.ceil(edges.length / localLaneColumnCount(edges));
  }

  function layoutVisibleNodeChildren(id: string, nested: boolean): void {
    layoutLocalLanes(id, nested);
    layoutExpandedNestedFlow(id);
    if (isCollapsibleFlow(id) && !isExpandedFlow(id)) {
      for (const childId of localFlowIds(id)) {
        markCollapsedSubtree(childId, id);
      }
    }
  }

  function layoutFlowChildren(flowRootId: string, rootX: number, y: number, nested: boolean): void {
    const seen = new Set<string>([flowRootId]);
    let currentId = flowRootId;
    let column = 1;

    while (true) {
      const edge = nextOuterFlowEdge(flowRootId, currentId);
      if (!edge || seen.has(edge.to)) break;

      const x = rootX + column * SPINE_SPACING;
      addVisibleNode(edge.to, { x, y });
      addProjectedEdge(edge, nested);
      layoutVisibleNodeChildren(edge.to, nested);

      seen.add(edge.to);
      currentId = edge.to;
      column += 1;
    }
  }

  function layoutExpandedNestedFlow(id: string): void {
    if (!isExpandedFlow(id)) return;
    const position = positions.get(id);
    if (!position) return;
    layoutFlowChildren(id, position.x, position.y + NESTED_FLOW_OFFSET, true);
  }

  const rootEdges = structureEdgesFrom(plan.root).filter((edge) => edge.type !== "post");
  addVisibleNode(plan.root, { x: 0, y: MODULE_START_Y });
  const rootChildPositions: StudioLayoutPoint[] = [];
  let nextModuleY = MODULE_START_Y;
  let nextModuleMinY = Number.NEGATIVE_INFINITY;
  rootEdges.forEach((edge) => {
    const moduleStartIds = new Set(visibleNodeIds);
    const y = nextModuleY;
    addVisibleNode(edge.to, { x: SPINE_SPACING, y });
    addProjectedEdge(edge);
    layoutVisibleNodeChildren(edge.to, false);
    if (plan.nodes[edge.to]?.mode === "flow") {
      primarySpines[edge.to] = collectFlowSpineIds(edge.to);
      layoutFlowChildren(edge.to, SPINE_SPACING, y, false);
    }

    const moduleIds = [...visibleNodeIds].filter((id) => !moduleStartIds.has(id));
    const moduleBounds = boundsForNodeIds(moduleIds);
    const moduleHasSavedPositions = moduleIds.some((id) => Boolean(plan.nodes[id]?.position));
    if (moduleBounds && !moduleHasSavedPositions && moduleBounds.top < nextModuleMinY) {
      translateNodeIds(moduleIds, nextModuleMinY - moduleBounds.top);
    }

    const shiftedBounds = boundsForNodeIds(moduleIds);
    const rootChildPosition = positions.get(edge.to);
    if (rootChildPosition) rootChildPositions.push(rootChildPosition);
    if (shiftedBounds) {
      nextModuleMinY = shiftedBounds.bottom + MODULE_GAP;
      nextModuleY = nextModuleMinY;
    }
  });

  if (rootEdges.length > 0 && !plan.nodes[plan.root]?.position) {
    const averageChildY = rootChildPositions.reduce((sum, position) => sum + position.y, 0) / rootChildPositions.length;
    positions.set(plan.root, { x: 0, y: averageChildY });
  }

  if (options.showDependencies) {
    for (const edge of dependencyEdges) {
      const source = ownerByNodeId.get(edge.from);
      const target = ownerByNodeId.get(edge.to);
      if (!source || !target || source === target) continue;
      if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) continue;
      const id = `dependency:${source}->${target}`;
      projectedEdges.set(id, {
        id,
        source,
        target,
        type: "dependency",
      });
    }
  }

  const nodes = [...visibleNodeIds].map((id) => ({
    id,
    position: positions.get(id) ?? { x: 0, y: 0 },
    data: buildStudioNodeData(id),
  }));

  nodes.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  return {
    nodes,
    edges: [...projectedEdges.values()],
    visibleNodeIds,
    compactNodeIds,
    primarySpines,
  };

  function buildStudioNodeData(id: string): StudioNodeData {
    const node = plan.nodes[id];
    const nestedIds = localFlowIds(id);
    const stepFrame = buildStepFrameData(id);
    const nestedFlow = isCollapsibleFlow(id)
      ? {
          expanded: isExpandedFlow(id),
          stepCount: nestedIds.length,
          optionCount: nestedIds.reduce((sum, childId) => sum + localLaneEdges(childId).filter((edge) => edge.type !== "post").length, 0),
          postCount: nestedIds.reduce((sum, childId) => sum + edgesOfType(childId, "post").length, 0),
        }
      : undefined;

    return {
      ...node,
      nestedFlow,
      stepFrame,
    };
  }

  function buildStepFrameData(id: string): StudioStepFrameSummary | undefined {
    if (id === plan.root) return undefined;
    const localEdges = localLaneEdges(id).filter((edge) => visibleNodeIds.has(edge.to));
    if (localEdges.length === 0) return undefined;

    const parentPosition = positions.get(id);
    if (!parentPosition) return undefined;

    const childRects = localEdges
      .map((edge) => positions.get(edge.to))
      .filter((position): position is StudioLayoutPoint => Boolean(position))
      .map((position) => ({
        left: position.x - parentPosition.x,
        top: position.y - parentPosition.y,
        right: position.x - parentPosition.x + NODE_WIDTH,
        bottom: position.y - parentPosition.y + NODE_HEIGHT,
      }));
    if (childRects.length === 0) return undefined;

    const left = Math.min(0, ...childRects.map((rect) => rect.left)) - 28;
    const top = Math.min(0, ...childRects.map((rect) => rect.top)) - 44;
    const right = Math.max(NODE_WIDTH, ...childRects.map((rect) => rect.right)) + 28;
    const bottom = Math.max(NODE_HEIGHT, ...childRects.map((rect) => rect.bottom)) + 28;

    return {
      singleCount: localEdges.filter((edge) => edge.type === "single").length,
      multiCount: localEdges.filter((edge) => edge.type === "multi").length,
      postCount: localEdges.filter((edge) => edge.type === "post").length,
      optionCount: localEdges.filter((edge) => edge.type !== "post").length,
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }
}
