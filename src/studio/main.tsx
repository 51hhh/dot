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
import { buildStudioGraph, type StudioNodeData } from "./projection.js";
import "./studio.css";

type FlowNodeData = StudioNodeData & {
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
} & Record<string, unknown>;

type PlanFlowNode = Node<FlowNodeData>;

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
      {data.description ? <p className="node-description">{data.description}</p> : null}
      {data.nestedFlow ? (
        <div className="nested-flow-summary">
          <button
            type="button"
            className="node-inline-button"
            data-action="toggle-node-expand"
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleExpand(id);
            }}
          >
            {data.nestedFlow.expanded ? "Collapse" : "Expand"} nested flow
          </button>
          <span>{data.nestedFlow.stepCount} steps · {data.nestedFlow.optionCount} choices</span>
        </div>
      ) : null}
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
  const [showDependencies, setShowDependencies] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<{ setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void } | null>(null);
  const [status, setStatus] = useState("");

  const selectNode = useCallback((id: string) => setSelectedId(id), []);
  const toggleNodeExpansion = useCallback((id: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    fetch("/api/plan")
      .then((response) => response.json())
      .then((nextPlan: InstallationPlan) => {
        setPlan(nextPlan);
        setSelectedId(nextPlan.root);
      });
  }, [selectNode]);

  useEffect(() => {
    if (!plan) return;
    const projection = buildStudioGraph(plan, { showDependencies, expandedNodeIds });
    setNodes((current) => {
      const currentPositions = new Map(current.map((node) => [node.id, node.position]));
      return projection.nodes.map((node) => ({
        id: node.id,
        type: "planNode",
        position: currentPositions.get(node.id) ?? node.position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { ...node.data, onSelect: selectNode, onToggleExpand: toggleNodeExpansion },
      }));
    });
    setEdges(projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "default",
      animated: false,
      className: `edge-${edge.type}${edge.nested ? " edge-nested" : ""}`,
      style: edgeStyle(edge.type),
    })));
  }, [expandedNodeIds, plan, selectNode, showDependencies, toggleNodeExpansion]);

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
      animated: false,
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
          <button
            className={`ghost toolbar-toggle ${showDependencies ? "active" : ""}`}
            data-action="toggle-dependencies"
            aria-pressed={showDependencies}
            onClick={() => setShowDependencies((value) => !value)}
          >
            {showDependencies ? "Hide dependencies" : "Show dependencies"}
          </button>
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
  const palette: Record<PlanEdge["type"], { stroke: string; strokeWidth: number; strokeDasharray?: string; opacity?: number }> = {
    child: { stroke: "#7dd3fc", strokeWidth: 2.2 },
    single: { stroke: "#38bdf8", strokeWidth: 2.3 },
    multi: { stroke: "#34d399", strokeWidth: 2.3 },
    dependency: { stroke: "#fb7185", strokeWidth: 1.8, strokeDasharray: "8 7", opacity: 0.62 },
    post: { stroke: "#facc15", strokeWidth: 2.8 },
    flow: { stroke: "#a78bfa", strokeWidth: 2.5 },
  };
  return palette[type];
}

createRoot(document.getElementById("root")!).render(<App />);
