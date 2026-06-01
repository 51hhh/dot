import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  type OnConnect,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type InstallationPlan, type PlanEdge, type PlanNode } from "../planner/types.js";
import "./studio.css";

type FlowNodeData = PlanNode & { onSelect: (id: string) => void } & Record<string, unknown>;

type PlanFlowNode = Node<FlowNodeData>;
type LayoutPoint = { x: number; y: number };
type StructureEdgeType = Extract<PlanEdge["type"], "single" | "multi" | "flow" | "post">;
type StructureEdge = PlanEdge & { type: StructureEdgeType };

function PlanNodeView({ id, data, selected }: NodeProps<PlanFlowNode>) {
  const badge = badgeForNode(data);
  return (
    <div className={`plan-node plan-node-${data.kind} plan-node-mode-${badge.mode} ${selected ? "selected" : ""}`} onClick={() => data.onSelect(id)}>
      <Handle type="target" position={Position.Left} className="plan-handle plan-handle-target" />
      <div className="node-title-row">
        <strong>{data.label}</strong>
        <span className={`mode-badge mode-badge-${badge.mode}`} title={badge.title}>{badge.label}</span>
      </div>
      <small>{id} · {data.kind}{data.post ? " · post" : ""}{data.hidden ? " · hidden" : ""}</small>
      <Handle type="source" position={Position.Right} className="plan-handle plan-handle-source" />
    </div>
  );
}

const nodeTypes = { planNode: PlanNodeView };

function App() {
  const [plan, setPlan] = useState<InstallationPlan | null>(null);
  const [nodes, setNodes] = useState<PlanFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<{ setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void } | null>(null);
  const [status, setStatus] = useState("");

  const selectNode = useCallback((id: string) => setSelectedId(id), []);

  useEffect(() => {
    fetch("/api/plan")
      .then((response) => response.json())
      .then((nextPlan: InstallationPlan) => {
        setPlan(nextPlan);
        const layout = buildLayout(nextPlan);
        setNodes(Object.values(nextPlan.nodes).map((node) => ({
          id: node.id,
          type: "planNode",
          position: node.position ?? layout[node.id] ?? { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: { ...node, onSelect: selectNode },
        })));
        setEdges(nextPlan.edges.map((edge) => ({
          id: `${edge.type}:${edge.from}->${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: "default",
          animated: edge.type === "dependency",
          className: `edge-${edge.type}`,
          style: edgeStyle(edge.type),
        })));
        setSelectedId(nextPlan.root);
      });
  }, [selectNode]);

  const onNodesChange = useCallback((changes: NodeChange<PlanFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect: OnConnect = useCallback((connection) => {
    setEdges((current) => addEdge({
      ...connection,
      label: "dependency",
      className: "edge-dependency",
      animated: true,
      style: edgeStyle("dependency"),
    }, current));
  }, []);

  const onNodeDragStop: OnNodeDrag<PlanFlowNode> = useCallback((_event, node) => {
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position: node.position } : item));
  }, []);

  const focusNode = useCallback((id: string) => {
    setSelectedId(id);
    const node = nodes.find((item) => item.id === id);
    if (node && reactFlowInstance) {
      reactFlowInstance.setCenter(node.position.x + 114, node.position.y + 42, { zoom: 1.1, duration: 450 });
    }
  }, [nodes, reactFlowInstance]);

  const saveLayout = useCallback(async () => {
    const positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
    const response = await fetch("/api/plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { version: 1, positions } }),
    });
    setStatus(response.ok ? "Saved" : "Save failed");
  }, [nodes]);

  if (!plan) return <div className="loading">Loading Plan Canvas...</div>;

  return (
    <main id="studio-shell" className={sidebarCollapsed ? "sidebar-collapsed" : ""}>
      <aside id="module-tree">
        <div className="sidebar-header">
          <h2>Install Tree</h2>
          <button data-action="toggle-sidebar" onClick={() => setSidebarCollapsed((value) => !value)}>
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        <div className="tree-scroll">
          {Object.values(plan.nodes).map((node) => {
            const badge = badgeForNodeId(node.id, plan);
            return (
              <button
                key={node.id}
                className={`tree-item ${node.id === selectedId ? "active" : ""}`}
                onClick={() => focusNode(node.id)}
                title={node.label}
              >
                <span>{node.label}</span>
                <small className={`mode-badge mode-badge-${badge.mode}`}>{badge.label}</small>
              </button>
            );
          })}
        </div>
      </aside>
      <section id="canvas-panel">
        <div className="toolbar">
          <button className="ghost" data-action="toggle-sidebar" onClick={() => setSidebarCollapsed((value) => !value)}>
            {sidebarCollapsed ? "Show tree" : "Hide tree"}
          </button>
          <strong>Plan Canvas</strong>
          <div className="legend" aria-label="Plan edge legend">
            <span className="legend-item legend-single"><i />单选</span>
            <span className="legend-item legend-multi"><i />多选</span>
            <span className="legend-item legend-flow"><i />流程</span>
            <span className="legend-item legend-dependency"><i />依赖</span>
            <span className="legend-item legend-post"><i />后置</span>
          </div>
          <button data-action="save-layout" onClick={saveLayout}>Save layout</button>
          <span>{status}</span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_event, node) => selectNode(node.id)}
          fitView
          colorMode="dark"
        >
          <Background color="#334155" gap={28} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </section>
    </main>
  );
}

function badgeForNode(node: PlanNode) {
  if (node.mode === "single") return { mode: "single", label: "单选", title: "single = exclusive branch" };
  if (node.mode === "multi") return { mode: "multi", label: "多选", title: "multi = selectable independent group" };
  if (node.mode === "flow") return { mode: "flow", label: "流程", title: "flow = linear chain" };
  return { mode: node.mode ?? "root", label: "根", title: "root = entry point" };
}

function badgeForNodeId(nodeId: string, plan: InstallationPlan) {
  return badgeForNode(plan.nodes[nodeId]);
}

function edgeStyle(type: PlanEdge["type"]) {
  const palette: Record<PlanEdge["type"], { stroke: string; strokeWidth: number }> = {
    child: { stroke: "#7dd3fc", strokeWidth: 2.2 },
    single: { stroke: "#38bdf8", strokeWidth: 2.3 },
    multi: { stroke: "#34d399", strokeWidth: 2.3 },
    dependency: { stroke: "#fb7185", strokeWidth: 2.8 },
    post: { stroke: "#facc15", strokeWidth: 2.8 },
    flow: { stroke: "#a78bfa", strokeWidth: 2.5 },
  };
  return palette[type];
}

function isStructureEdge(type: PlanEdge["type"]): type is StructureEdgeType {
  return type === "single" || type === "multi" || type === "flow" || type === "post";
}

function isBranchEdge(type: StructureEdgeType): boolean {
  return type === "single" || type === "multi" || type === "post";
}

function buildLayout(plan: InstallationPlan): Record<string, LayoutPoint> {
  const structureChildren = new Map<string, StructureEdge[]>();
  for (const edge of plan.edges) {
    if (!isStructureEdge(edge.type)) continue;
    const structureEdge: StructureEdge = { from: edge.from, to: edge.to, type: edge.type };
    const edges = structureChildren.get(edge.from) ?? [];
    edges.push(structureEdge);
    structureChildren.set(edge.from, edges);
  }

  const positions: Record<string, LayoutPoint> = {};
  const rootId = plan.root;
  const leafSpacing = 132;
  const layerSpacing = 340;
  const disconnectedSpacing = 96;
  const measuring = new Set<string>();
  const measureCache = new Map<string, number>();
  const visiting = new Set<string>();

  function outgoingStructure(id: string): StructureEdge[] {
    return (structureChildren.get(id) ?? []).filter((edge) => plan.nodes[edge.to]);
  }

  function branchEdges(id: string): StructureEdge[] {
    return outgoingStructure(id).filter((edge) => isBranchEdge(edge.type));
  }

  function flowEdges(id: string): StructureEdge[] {
    return outgoingStructure(id).filter((edge) => edge.type === "flow");
  }

  function measureBranch(id: string): number {
    const cached = measureCache.get(id);
    if (cached) return cached;
    if (measuring.has(id)) return 1;
    measuring.add(id);

    const branches = branchEdges(id);
    const lanes = branches.length === 0
      ? 1
      : branches.reduce((sum, edge) => sum + measureBranch(edge.to), 0);

    measuring.delete(id);
    const measured = Math.max(1, lanes);
    measureCache.set(id, measured);
    return measured;
  }

  function laneOffset(index: number, totalLanes: number, reserveCenterLane: boolean): number {
    if (!reserveCenterLane) return index - (totalLanes - 1) / 2;
    const midpoint = totalLanes / 2;
    const offset = index - midpoint;
    return offset >= 0 ? offset + 1 : offset;
  }

  function laneCenterY(centerY: number, firstLane: number, laneCount: number, totalLanes: number, reserveCenterLane: boolean): number {
    let offsetTotal = 0;
    for (let index = firstLane; index < firstLane + laneCount; index += 1) {
      offsetTotal += laneOffset(index, totalLanes, reserveCenterLane);
    }
    return centerY + (offsetTotal / laneCount) * leafSpacing;
  }

  function layoutBranchGroup(edges: StructureEdge[], depth: number, centerY: number, reserveCenterLane: boolean): void {
    if (edges.length === 0) return;
    const lanesByEdge = edges.map((edge) => measureBranch(edge.to));
    const totalLanes = lanesByEdge.reduce((sum, lanes) => sum + lanes, 0);
    let firstLane = 0;

    edges.forEach((edge, index) => {
      const laneCount = lanesByEdge[index] ?? 1;
      layoutBranch(edge.to, depth, laneCenterY(centerY, firstLane, laneCount, totalLanes, reserveCenterLane));
      firstLane += laneCount;
    });
  }

  function layoutFlowChain(edges: StructureEdge[], depth: number, centerY: number): void {
    if (edges.length === 0) return;
    const [primary, ...alternates] = edges;
    if (primary) layoutBranch(primary.to, depth, centerY);
    layoutBranchGroup(alternates, depth, centerY, true);
  }

  function layoutBranch(id: string, depth: number, centerY: number): number {
    const existing = positions[id];
    if (existing) return existing.y;
    if (!plan.nodes[id]) return centerY;
    if (visiting.has(id)) return centerY;

    visiting.add(id);
    const x = depth * layerSpacing;
    positions[id] = { x, y: centerY };

    const flows = flowEdges(id);
    const branches = branchEdges(id);
    layoutBranchGroup(branches, depth + 1, centerY, flows.length > 0);
    layoutFlowChain(flows, depth + 1, centerY);

    visiting.delete(id);
    return centerY;
  }

  if (plan.nodes[rootId]) {
    layoutBranch(rootId, 0, 0);
  }

  let fallbackY = Object.values(positions).reduce((maxY, point) => Math.max(maxY, point.y), 0) + leafSpacing + disconnectedSpacing;
  for (const id of Object.keys(plan.nodes)) {
    if (positions[id]) continue;
    const lanes = measureBranch(id);
    const centerY = fallbackY + ((lanes - 1) * leafSpacing) / 2;
    layoutBranch(id, 1, centerY);
    fallbackY += lanes * leafSpacing + disconnectedSpacing;
  }

  const minY = Object.values(positions).reduce((minimum, point) => Math.min(minimum, point.y), 0);
  if (minY < 40) {
    const offsetY = 40 - minY;
    for (const point of Object.values(positions)) {
      point.y += offsetY;
    }
  }
  return positions;
}

createRoot(document.getElementById("root")!).render(<App />);
