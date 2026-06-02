import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
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
import { buildStudioGraph, type StudioNodeData, type StudioProjectedEdge } from "./projection.js";
import "./studio.css";

type StudioPlan = InstallationPlan & {
  overlay?: {
    version: 1 | 2 | null;
    configHash: string;
    overlayHash?: string;
  };
};

type FlowNodeData = StudioNodeData & {
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
} & Record<string, unknown>;

type PlanFlowNode = Node<FlowNodeData>;
type EditableEdgeType = Exclude<PlanEdge["type"], "child">;
type DraftEdgeAction = "add" | "remove";
type DraftEdgeChange = {
  action: DraftEdgeAction;
  from: string;
  to: string;
  type: EditableEdgeType;
};

const editableEdgeTypes: EditableEdgeType[] = ["flow", "single", "multi", "dependency", "post"];
const editableEdgeLabels: Record<EditableEdgeType, string> = {
  flow: "流程",
  single: "单选",
  multi: "多选",
  dependency: "依赖",
  post: "后置",
};

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
  const [plan, setPlan] = useState<StudioPlan | null>(null);
  const [nodes, setNodes] = useState<PlanFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<{ setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void } | null>(null);
  const [status, setStatus] = useState("");
  const [draftEdgeType, setDraftEdgeType] = useState<EditableEdgeType>("flow");
  const [draftEdgeChanges, setDraftEdgeChanges] = useState<DraftEdgeChange[]>([]);
  const [exportText, setExportText] = useState("");

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
      .then((nextPlan: StudioPlan) => {
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
    setEdges(buildReactFlowEdges(projection.edges, draftEdgeChanges));
  }, [draftEdgeChanges, expandedNodeIds, plan, selectNode, showDependencies, toggleNodeExpansion]);

  const onNodesChange = useCallback((changes: NodeChange<PlanFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== "remove"), current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedEdges = changes
      .filter((change) => change.type === "remove")
      .map((change) => edges.find((edge) => edge.id === change.id))
      .filter((edge): edge is Edge => Boolean(edge));

    if (removedEdges.length > 0) {
      setDraftEdgeChanges((current) => recordDraftEdgeRemovals(current, removedEdges));
      setStatus(`${removedEdges.length} edge removal drafted`);
    }

    setEdges((current) => applyEdgeChanges(changes, current));
  }, [edges]);

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) {
      setStatus("Draft edge skipped: source or target is missing.");
      return;
    }

    if (connection.source === connection.target) {
      setStatus("Draft edge skipped: self edges are not supported.");
      return;
    }

    const nextChange: DraftEdgeChange = {
      action: "add",
      from: connection.source,
      to: connection.target,
      type: draftEdgeType,
    };

    const existing = edges.some((edge) => {
      const semanticType = edgeSemanticType(edge);
      return edge.source === nextChange.from && edge.target === nextChange.to && semanticType === nextChange.type;
    });

    if (existing) {
      setStatus("Draft edge skipped: that typed edge already exists.");
      return;
    }

    setDraftEdgeChanges((current) => recordDraftEdgeAdd(current, nextChange));
    setStatus(`Drafted ${draftEdgeType} edge: ${connection.source} -> ${connection.target}`);
  }, [draftEdgeType, edges]);

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
    setStatus("Saving...");
    const response = await fetch("/api/plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        base: plan?.overlay ? {
          configHash: plan.overlay.configHash,
          overlayHash: plan.overlay.overlayHash,
        } : undefined,
        patch: { version: 1, positions },
      }),
    });
    const payload = await response.json().catch(() => null) as {
      plan?: StudioPlan;
      error?: { code?: string; message?: string };
    } | null;

    if (!response.ok) {
      const detail = payload?.error?.message ?? payload?.error?.code ?? response.statusText;
      setStatus(`Save failed: ${detail}`);
      return;
    }

    if (payload?.plan) {
      setPlan(payload.plan);
    }
    setStatus("Saved");
  }, [nodes, plan?.overlay]);

  const exportDraft = useCallback(() => {
    if (!plan) {
      setStatus("No plan loaded.");
      return;
    }

    const nextExport = buildAgentDraftExport(plan, draftEdgeChanges);
    setExportText(nextExport);
    setStatus(draftEdgeChanges.length > 0 ? "Draft export generated" : "No draft edge changes to export");
  }, [draftEdgeChanges, plan]);

  const clearDraft = useCallback(() => {
    setDraftEdgeChanges([]);
    setExportText("");
    setStatus("Draft changes cleared");
  }, []);

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
          <label className="edge-draft-control">
            <span>Draft edge</span>
            <select
              data-action="draft-edge-type"
              value={draftEdgeType}
              onChange={(event) => setDraftEdgeType(event.target.value as EditableEdgeType)}
            >
              {editableEdgeTypes.map((type) => (
                <option key={type} value={type}>{editableEdgeLabels[type]}</option>
              ))}
            </select>
          </label>
          <button data-action="export-draft" onClick={exportDraft}>Export draft</button>
          <button className="ghost" data-action="clear-draft" onClick={clearDraft} disabled={draftEdgeChanges.length === 0}>Clear draft</button>
          <button data-action="save-layout" onClick={saveLayout}>Save layout</button>
          <span className={status.startsWith("Save failed") ? "status status-error" : "status"}>{status}</span>
        </div>
        <div className="draft-panel" aria-label="Draft edge changes">
          <strong>{draftEdgeChanges.length} draft changes</strong>
          <span>Add or delete canvas edges locally, then export a prompt for the agent. Semantic changes are not saved by Studio.</span>
        </div>
        {exportText ? (
          <textarea
            className="draft-export"
            aria-label="Draft export prompt"
            readOnly
            value={exportText}
          />
        ) : null}
        {plan.diagnostics.length > 0 ? (
          <div className="diagnostics-panel" aria-label="Plan diagnostics">
            {plan.diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.code}-${diagnostic.nodeId ?? "plan"}-${index}`}
                className={`diagnostic diagnostic-${diagnostic.level}`}
                onClick={() => diagnostic.nodeId ? focusNode(diagnostic.nodeId) : undefined}
              >
                <strong>{diagnostic.level}: {diagnostic.code}</strong>
                <span>{diagnostic.message}</span>
              </button>
            ))}
          </div>
        ) : null}
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
          nodesConnectable
          deleteKeyCode={["Backspace", "Delete"]}
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

function buildReactFlowEdges(projectedEdges: StudioProjectedEdge[], draftChanges: DraftEdgeChange[]): Edge[] {
  const removedKeys = new Set(draftChanges.filter((change) => change.action === "remove").map(edgeChangeKey));
  const baseEdges = projectedEdges
    .filter((edge) => !removedKeys.has(edgeKey(edge.source, edge.target, edge.type)))
    .map((edge) => reactFlowEdge(edge));
  const draftAddEdges = draftChanges
    .filter((change) => change.action === "add")
    .map((change) => reactFlowEdge({
      id: `draft:${edgeChangeKey(change)}`,
      source: change.from,
      target: change.to,
      type: change.type,
    }, true));

  return [...baseEdges, ...draftAddEdges];
}

function reactFlowEdge(edge: StudioProjectedEdge, draft = false): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "default",
    animated: draft,
    label: draft ? `draft ${edge.type}` : undefined,
    className: `edge-${edge.type}${edge.nested ? " edge-nested" : ""}${draft ? " edge-draft" : ""}`,
    style: edgeStyle(edge.type),
    data: {
      semanticType: edge.type,
      draft,
    },
  };
}

function recordDraftEdgeAdd(current: DraftEdgeChange[], change: DraftEdgeChange): DraftEdgeChange[] {
  const key = edgeChangeKey(change);
  const withoutMatchingRemoval = current.filter((item) => !(item.action === "remove" && edgeChangeKey(item) === key));
  if (withoutMatchingRemoval.length !== current.length) return withoutMatchingRemoval;
  if (current.some((item) => item.action === "add" && edgeChangeKey(item) === key)) return current;
  return [...current, change];
}

function recordDraftEdgeRemovals(current: DraftEdgeChange[], removedEdges: Edge[]): DraftEdgeChange[] {
  let next = [...current];

  for (const edge of removedEdges) {
    const type = edgeSemanticType(edge);
    if (!type) continue;

    const key = edgeKey(edge.source, edge.target, type);
    const existingAddIndex = next.findIndex((item) => item.action === "add" && edgeChangeKey(item) === key);
    if (existingAddIndex >= 0) {
      next = next.filter((_item, index) => index !== existingAddIndex);
      continue;
    }

    if (!next.some((item) => item.action === "remove" && edgeChangeKey(item) === key)) {
      next.push({ action: "remove", from: edge.source, to: edge.target, type });
    }
  }

  return next;
}

function buildAgentDraftExport(plan: StudioPlan, changes: DraftEdgeChange[]): string {
  const operations = changes.map((change) => ({
    action: change.action,
    type: change.type,
    from: change.from,
    fromLabel: plan.nodes[change.from]?.label,
    to: change.to,
    toLabel: plan.nodes[change.to]?.label,
  }));
  const dependencyAdds = changes
    .filter((change) => change.action === "add" && change.type === "dependency")
    .map((change) => ({ from: change.from, to: change.to }));
  const dependencyRemoves = changes
    .filter((change) => change.action === "remove" && change.type === "dependency")
    .map((change) => ({ from: change.from, to: change.to }));
  const overlayPatchDraft = {
    version: 2,
    ...(dependencyAdds.length > 0 || dependencyRemoves.length > 0
      ? {
          dependencies: {
            ...(dependencyAdds.length > 0 ? { add: dependencyAdds } : {}),
            ...(dependencyRemoves.length > 0 ? { remove: dependencyRemoves } : {}),
          },
        }
      : {}),
  };
  const sourceOnlyOperations = operations.filter((operation) => operation.type !== "dependency");
  const prompt = [
    "你在 /home/rick/desktop/dot 项目工作。",
    "直接执行下面的 Studio 结构修改草案，不要调用 subagent。",
    "不要只修改 Studio layout/positions；请修改真实源码配置，并补测试。",
    "",
    "要求：",
    "- 根据 changedOperations 修改 configs/dot.yaml 的真实 menu children/mode/post/deps。",
    "- dependency 类型可参考 overlayPatchDraft，但最终仍应让 build/plan/generator 行为一致。",
    "- single/multi/flow/post 结构边不能只写 overlay；这些需要源码 YAML 结构调整。",
    "- 修改后运行 npm run typecheck、npm run lint、npm test、npm run build。",
    "- 重新生成 dist/dot.sh 并运行 bash -n dist/dot.sh。",
    "",
    "changedOperations:",
    JSON.stringify(operations, null, 2),
    "",
    "overlayPatchDraft:",
    JSON.stringify(overlayPatchDraft, null, 2),
    "",
    sourceOnlyOperations.length > 0
      ? `sourceOnlyOperations: ${sourceOnlyOperations.length} structure edge change(s) require YAML edits.`
      : "sourceOnlyOperations: none.",
  ].join("\n");

  return prompt;
}

function edgeSemanticType(edge: Edge): EditableEdgeType | null {
  const semanticType = edge.data?.semanticType;
  return isEditableEdgeType(semanticType) ? semanticType : null;
}

function isEditableEdgeType(value: unknown): value is EditableEdgeType {
  return typeof value === "string" && editableEdgeTypes.includes(value as EditableEdgeType);
}

function edgeChangeKey(change: DraftEdgeChange): string {
  return edgeKey(change.from, change.to, change.type);
}

function edgeKey(from: string, to: string, type: PlanEdge["type"]): string {
  return `${type}:${from}->${to}`;
}

createRoot(document.getElementById("root")!).render(<App />);
