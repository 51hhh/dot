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

export type StudioCanvasRole = "root" | "module" | "flow" | "option" | "post";

export interface StudioNodeData extends PlanNode {
  nestedFlow?: StudioNestedFlowSummary;
  canvasRole?: StudioCanvasRole;
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
  useSavedPositions?: boolean;
}

type IndexedEdge = PlanEdge & { index: number };
type StructureEdge = IndexedEdge & { type: PlanStructureEdgeType };
type BranchEdge = StructureEdge & { type: "single" | "multi" | "post" };
type LocalLanePlacement = "flow" | "stacked";

const MODULE_X = 420;
const MODULE_TO_FIRST_STEP_SPACING = 420;
const MIN_SPINE_SPACING = 620;
const MODULE_START_Y = 360;
const MODULE_GAP = 260;
const FLOW_NODE_WIDTH = 260;
const OPTION_NODE_WIDTH = 220;
const LOCAL_NODE_GAP = 42;
const LOCAL_LANE_X_OFFSET = FLOW_NODE_WIDTH + LOCAL_NODE_GAP;
const LOCAL_LANE_COLUMN_SPACING = 250;
const SINGLE_LANE_Y_OFFSET = -180;
const MULTI_LANE_Y_OFFSET = 180;
const POST_LANE_Y_OFFSET = 360;
const LOCAL_NODE_SPACING = 160;
const NESTED_FLOW_OFFSET = 820;
const MODULE_GRID_COLUMNS = 3;
const MODULE_GRID_MIN_COLUMN_SPACING = 840;
const MODULE_GRID_COLUMN_GAP = 48;
const MODULE_GRID_ITEM_GAP = 180;
const NODE_HEIGHT = 132;

export function buildStudioGraph(plan: InstallationPlan, options: StudioGraphOptions = {}): StudioGraph {
  const expandedNodeIds = options.expandedNodeIds ?? new Set<string>();
  const useSavedPositions = options.useSavedPositions ?? false;
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
  const canvasRoles = new Map<string, StudioCanvasRole>();
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

  function addVisibleNode(id: string, position: StudioLayoutPoint, role: StudioCanvasRole): void {
    if (!plan.nodes[id]) return;
    visibleNodeIds.add(id);
    compactNodeIds.delete(id);
    ownerByNodeId.set(id, id);
    if (!canvasRoles.has(id)) {
      canvasRoles.set(id, role);
    }
    if (!positions.has(id)) {
      positions.set(id, useSavedPositions ? plan.nodes[id].position ?? position : position);
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

  function layoutLocalLanes(parentId: string, nested: boolean, placement: LocalLanePlacement): void {
    const parentPosition = positions.get(parentId);
    if (!parentPosition) return;

    const singleEdges = edgesOfType(parentId, "single");
    const multiEdges = edgesOfType(parentId, "multi");
    const postEdges = edgesOfType(parentId, "post");
    const singleRows = localLaneRowCount(parentId, singleEdges);
    const multiRows = localLaneRowCount(parentId, multiEdges);

    if (placement === "stacked") {
      const singleLaneYOffset = MULTI_LANE_Y_OFFSET;
      const multiLaneYOffset = singleRows > 0
        ? singleLaneYOffset + (singleRows + 1) * LOCAL_NODE_SPACING
        : MULTI_LANE_Y_OFFSET;
      const postLaneYOffset = multiRows > 0
        ? multiLaneYOffset + (multiRows + 1) * LOCAL_NODE_SPACING
        : singleRows > 0
          ? singleLaneYOffset + (singleRows + 1) * LOCAL_NODE_SPACING
          : POST_LANE_Y_OFFSET;

      layoutLocalLane(parentId, singleEdges, parentPosition, singleLaneYOffset, nested);
      layoutLocalLane(parentId, multiEdges, parentPosition, multiLaneYOffset, nested);
      layoutLocalLane(parentId, postEdges, parentPosition, postLaneYOffset, nested);
      return;
    }

    const postLaneYOffset = multiRows > 0
      ? MULTI_LANE_Y_OFFSET + (multiRows + 1) * LOCAL_NODE_SPACING
      : POST_LANE_Y_OFFSET;

    layoutLocalLane(parentId, singleEdges, parentPosition, SINGLE_LANE_Y_OFFSET - Math.max(0, singleRows - 1) * LOCAL_NODE_SPACING, nested);
    layoutLocalLane(parentId, multiEdges, parentPosition, MULTI_LANE_Y_OFFSET, nested);
    layoutLocalLane(parentId, postEdges, parentPosition, postLaneYOffset, nested);
  }

  function layoutLocalLane(parentId: string, edges: BranchEdge[], parentPosition: StudioLayoutPoint, yOffset: number, nested: boolean): void {
    if (edges.length === 0) return;
    const columns = localLaneColumnCount(parentId, edges);

    edges.forEach((edge, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = parentPosition.x + LOCAL_LANE_X_OFFSET + column * LOCAL_LANE_COLUMN_SPACING;
      const y = parentPosition.y + yOffset + row * LOCAL_NODE_SPACING;

      addVisibleNode(edge.to, { x, y }, edge.type === "post" ? "post" : "option");
      addProjectedEdge(edge, nested);
      layoutVisibleNodeChildren(edge.to, nested);
    });
  }

  function localLaneColumnCount(parentId: string, edges: BranchEdge[]): number {
    if (edges.length <= 4) return 1;
    const hasFlowSuccessor = edgesOfType(parentId, "flow").length > 0;
    const terminalEdges = edges.filter((edge) => structureEdgesFrom(edge.to).length === 0);
    if (terminalEdges.length === edges.length) {
      return Math.min(hasFlowSuccessor ? 2 : 3, Math.ceil(edges.length / 4));
    }
    return 2;
  }

  function localLaneRowCount(parentId: string, edges: BranchEdge[]): number {
    if (edges.length === 0) return 0;
    return Math.ceil(edges.length / localLaneColumnCount(parentId, edges));
  }

  function localLaneMaxColumns(parentId: string): number {
    return Math.max(
      1,
      localLaneColumnCount(parentId, edgesOfType(parentId, "single")),
      localLaneColumnCount(parentId, edgesOfType(parentId, "multi")),
      localLaneColumnCount(parentId, edgesOfType(parentId, "post"))
    );
  }

  function flowAdvanceFrom(flowRootId: string, currentId: string): number {
    const baseSpacing = topLevelNodeIds.has(flowRootId) && currentId === flowRootId
      ? MODULE_TO_FIRST_STEP_SPACING
      : MIN_SPINE_SPACING;
    const columns = localLaneMaxColumns(currentId);
    const localLaneRightEdge = LOCAL_LANE_X_OFFSET + (columns - 1) * LOCAL_LANE_COLUMN_SPACING + OPTION_NODE_WIDTH + LOCAL_NODE_GAP;
    return Math.max(baseSpacing, localLaneRightEdge);
  }

  function localLaneBlockWidth(parentId: string): number {
    const columns = localLaneMaxColumns(parentId);
    return LOCAL_LANE_X_OFFSET + (columns - 1) * LOCAL_LANE_COLUMN_SPACING + OPTION_NODE_WIDTH;
  }

  function layoutVisibleNodeChildren(id: string, nested: boolean, placement: LocalLanePlacement = "flow"): void {
    layoutLocalLanes(id, nested, placement);
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

    while (true) {
      const edge = nextOuterFlowEdge(flowRootId, currentId);
      if (!edge || seen.has(edge.to)) break;

      const currentPosition = positions.get(currentId) ?? { x: rootX, y };
      const x = currentPosition.x + flowAdvanceFrom(flowRootId, currentId);
      addVisibleNode(edge.to, { x, y }, "flow");
      addProjectedEdge(edge, nested);
      layoutVisibleNodeChildren(edge.to, nested);

      seen.add(edge.to);
      currentId = edge.to;
    }
  }

  function layoutExpandedNestedFlow(id: string): void {
    if (!isExpandedFlow(id)) return;
    const position = positions.get(id);
    if (!position) return;
    layoutFlowChildren(id, position.x, position.y + NESTED_FLOW_OFFSET, true);
  }

  function layoutTopLevelChoiceGrid(moduleId: string, rootX: number, y: number): void {
    const edges = structureEdgesFrom(moduleId);
    if (edges.length === 0) return;
    const columnBottoms = Array.from({ length: MODULE_GRID_COLUMNS }, () => y);
    const columnSpacing = Math.max(
      MODULE_GRID_MIN_COLUMN_SPACING,
      Math.max(...edges.map((edge) => localLaneBlockWidth(edge.to))) + MODULE_GRID_COLUMN_GAP
    );

    edges.forEach((edge, index) => {
      const column = shortestColumnIndex(columnBottoms);
      const x = rootX + columnSpacing + column * columnSpacing;
      const childY = columnBottoms[column] ?? y;
      const childStartIds = new Set(visibleNodeIds);
      addVisibleNode(edge.to, { x, y: childY }, edge.type === "post" ? "post" : "flow");
      if (index === 0) {
        addProjectedEdge(edge);
      }
      layoutVisibleNodeChildren(edge.to, false, "stacked");
      const childIds = [...visibleNodeIds].filter((id) => !childStartIds.has(id));
      const childBounds = boundsForNodeIds(childIds);
      columnBottoms[column] = (childBounds?.bottom ?? childY + NODE_HEIGHT) + MODULE_GRID_ITEM_GAP;
    });
  }

  function shortestColumnIndex(columnBottoms: number[]): number {
    let column = 0;
    for (let index = 1; index < columnBottoms.length; index += 1) {
      if (columnBottoms[index]! < columnBottoms[column]!) {
        column = index;
      }
    }
    return column;
  }

  const rootEdges = structureEdgesFrom(plan.root).filter((edge) => edge.type !== "post");
  addVisibleNode(plan.root, { x: 0, y: MODULE_START_Y }, "root");
  let nextModuleY = MODULE_START_Y;
  let nextModuleMinY = Number.NEGATIVE_INFINITY;
  rootEdges.forEach((edge) => {
    const moduleStartIds = new Set(visibleNodeIds);
    const y = nextModuleY;
    addVisibleNode(edge.to, { x: MODULE_X, y }, "module");
    if (plan.nodes[edge.to]?.mode === "flow") {
      layoutVisibleNodeChildren(edge.to, false);
      primarySpines[edge.to] = collectFlowSpineIds(edge.to);
      layoutFlowChildren(edge.to, MODULE_X, y, false);
    } else {
      layoutTopLevelChoiceGrid(edge.to, MODULE_X, y);
    }

    const moduleIds = [...visibleNodeIds].filter((id) => !moduleStartIds.has(id));
    const moduleBounds = boundsForNodeIds(moduleIds);
    const moduleHasSavedPositions = useSavedPositions && moduleIds.some((id) => Boolean(plan.nodes[id]?.position));
    if (moduleBounds && !moduleHasSavedPositions && moduleBounds.top < nextModuleMinY) {
      translateNodeIds(moduleIds, nextModuleMinY - moduleBounds.top);
    }

    const shiftedBounds = boundsForNodeIds(moduleIds);
    if (shiftedBounds) {
      nextModuleMinY = shiftedBounds.bottom + MODULE_GAP;
      nextModuleY = nextModuleMinY;
    }
  });

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
      canvasRole: canvasRoles.get(id),
    };
  }
}
