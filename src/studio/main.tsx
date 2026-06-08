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
import { buildStudioGraph, type StudioNodeData, type StudioProjectedEdge, type StudioProjectedNode } from "./projection.js";
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
  draftOperation?: DraftNodeAction;
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
type DraftNodeMode = Extract<PlanNode["mode"], "single" | "multi" | "flow">;
type DraftNodeAction = "add" | "update" | "remove";
type DraftNodeChange = {
  action: DraftNodeAction;
  id: string;
  label?: string;
  description?: string;
  mode?: DraftNodeMode;
  post?: boolean;
  hidden?: boolean;
  position?: { x: number; y: number };
};
type DraftNodeFormState = {
  id: string;
  label: string;
  description: string;
  mode: DraftNodeMode;
  post: boolean;
  hidden: boolean;
};
type DraftStudioNode = StudioProjectedNode & {
  data: StudioNodeData & {
    draftOperation?: DraftNodeAction;
  };
};
type DraftStudioGraph = {
  nodes: DraftStudioNode[];
  edges: StudioProjectedEdge[];
  visibleNodeIds: Set<string>;
};

const editableEdgeTypes: EditableEdgeType[] = ["flow", "single", "multi", "dependency", "post"];
const editableEdgeLabels: Record<EditableEdgeType, string> = {
  flow: "流程",
  single: "单选",
  multi: "多选",
  dependency: "依赖",
  post: "后置",
};
const draftNodeModes: DraftNodeMode[] = ["single", "multi", "flow"];
const draftNodeModeLabels: Record<DraftNodeMode, string> = {
  single: "单选",
  multi: "多选",
  flow: "流程",
};
const MIN_CANVAS_ZOOM = 0.05;
const MAX_CANVAS_ZOOM = 2;
const CANVAS_FIT_VIEW_OPTIONS = { padding: 0.08, minZoom: MIN_CANVAS_ZOOM, maxZoom: 0.85 };
const REACT_FLOW_EDGE_TYPE = "straight";

function PlanNodeView({ id, data, selected }: NodeProps<PlanFlowNode>) {
  const badge = badgeForNode(data);
  const draftClass = data.draftOperation ? ` plan-node-draft plan-node-draft-${data.draftOperation}` : "";
  const stepFrameClass = data.stepFrame ? " plan-node-step-frame" : "";
  return (
    <div
      className={`plan-node plan-node-${data.kind} plan-node-mode-${badge.mode}${draftClass}${stepFrameClass} ${selected ? "selected" : ""}`}
      style={stepFrameStyle(data)}
      onClick={() => data.onSelect(id)}
    >
      <Handle type="target" position={Position.Left} className="plan-handle plan-handle-target" />
      <div className="node-title-row">
        <strong>{data.label}</strong>
        <span className={`mode-badge mode-badge-${badge.mode}`} title={badge.title}>{badge.label}</span>
      </div>
      <small>{id} · {data.kind}{data.post ? " · post" : ""}{data.hidden ? " · hidden" : ""}{data.draftOperation ? ` · draft ${data.draftOperation}` : ""}</small>
      {data.stepFrame ? (
        <div className="step-frame-summary" aria-label="Step frame summary">
          <span>{data.stepFrame.optionCount} 选项</span>
          {data.stepFrame.singleCount > 0 ? <span>{data.stepFrame.singleCount} 单选</span> : null}
          {data.stepFrame.multiCount > 0 ? <span>{data.stepFrame.multiCount} 多选</span> : null}
          {data.stepFrame.postCount > 0 ? <span>{data.stepFrame.postCount} 后置</span> : null}
        </div>
      ) : null}
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
  const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string>("");
  const [focusRequestId, setFocusRequestId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [draftEditorOpen, setDraftEditorOpen] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<{ setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void } | null>(null);
  const [status, setStatus] = useState("");
  const [draftEdgeType, setDraftEdgeType] = useState<EditableEdgeType>("flow");
  const [draftEdgeChanges, setDraftEdgeChanges] = useState<DraftEdgeChange[]>([]);
  const [draftNodeChanges, setDraftNodeChanges] = useState<DraftNodeChange[]>([]);
  const [newNodeDraft, setNewNodeDraft] = useState<DraftNodeFormState>({
    id: "",
    label: "",
    description: "",
    mode: "single",
    post: false,
    hidden: false,
  });
  const [selectedNodeDraft, setSelectedNodeDraft] = useState<DraftNodeFormState>({
    id: "",
    label: "",
    description: "",
    mode: "single",
    post: false,
    hidden: false,
  });
  const [exportText, setExportText] = useState("");
  const draftChangeCount = draftEdgeChanges.length + draftNodeChanges.length;

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
    const selectedNode = nodeSnapshotForId(plan, draftNodeChanges, selectedId);
    if (!selectedNode) return;
    setSelectedNodeDraft({
      id: selectedNode.id,
      label: selectedNode.label,
      description: selectedNode.description ?? "",
      mode: isDraftNodeMode(selectedNode.mode) ? selectedNode.mode : "single",
      post: Boolean(selectedNode.post),
      hidden: Boolean(selectedNode.hidden),
    });
  }, [draftNodeChanges, plan, selectedId]);

  useEffect(() => {
    if (!plan) return;
    const projection = buildStudioGraph(plan, { showDependencies, expandedNodeIds });
    const draftGraph = applyDraftNodeChangesToGraph(projection, draftNodeChanges);
    setNodes(draftGraph.nodes.map((node) => ({
      id: node.id,
      type: "planNode",
          position: manualPositions.get(node.id) ?? node.position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          zIndex: node.data.stepFrame ? 0 : 1,
          data: { ...node.data, onSelect: selectNode, onToggleExpand: toggleNodeExpansion },
        })));
    setEdges(buildReactFlowEdges(draftGraph.edges, draftEdgeChanges, draftGraph.visibleNodeIds));
  }, [draftEdgeChanges, draftNodeChanges, expandedNodeIds, manualPositions, plan, selectNode, showDependencies, toggleNodeExpansion]);

  useEffect(() => {
    if (!focusRequestId || !reactFlowInstance) return;
    const node = nodes.find((item) => item.id === focusRequestId);
    if (!node) return;
    reactFlowInstance.setCenter(node.position.x + 114, node.position.y + 42, { zoom: 1.1, duration: 450 });
    setFocusRequestId("");
  }, [focusRequestId, nodes, reactFlowInstance]);

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
      setStatus(`已记录 ${removedEdges.length} 条删除草案`);
    }

    setEdges((current) => applyEdgeChanges(changes, current));
  }, [edges]);

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) {
      setStatus("草案连线已跳过：缺少起点或终点。");
      return;
    }

    if (connection.source === connection.target) {
      setStatus("草案连线已跳过：不支持连接到自身。");
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
      setStatus("草案连线已跳过：同类型连线已存在。");
      return;
    }

    setDraftEdgeChanges((current) => recordDraftEdgeAdd(current, nextChange));
    setStatus(`已记录 ${editableEdgeLabels[draftEdgeType]}连线草案：${connection.source} -> ${connection.target}`);
  }, [draftEdgeType, edges]);

  const generateDraftNodeId = useCallback(() => {
    if (!plan) return;
    const baseId = normalizeDraftNodeId(newNodeDraft.label || newNodeDraft.id || "draft-node");
    const id = uniqueDraftNodeId(baseId, plan, draftNodeChanges);
    setNewNodeDraft((current) => ({ ...current, id }));
  }, [draftNodeChanges, newNodeDraft.id, newNodeDraft.label, plan]);

  const addDraftNode = useCallback(() => {
    if (!plan) {
      setStatus("计划尚未加载。");
      return;
    }

    const id = normalizeDraftNodeId(newNodeDraft.id || newNodeDraft.label);
    const label = newNodeDraft.label.trim();
    if (!id || !label) {
      setStatus("新增草案节点需要 id 和 label。");
      return;
    }

    if (nodeExistsForDraft(plan, draftNodeChanges, id)) {
      setStatus(`新增草案节点已跳过：${id} 已存在。`);
      return;
    }

    const position = draftNodePosition(nodes, selectedId, draftNodeChanges.length);
    const nextChange: DraftNodeChange = {
      action: "add",
      id,
      label,
      description: optionalText(newNodeDraft.description),
      mode: newNodeDraft.mode,
      post: newNodeDraft.post,
      hidden: newNodeDraft.hidden,
      position,
    };

    setDraftNodeChanges((current) => recordDraftNodeAdd(current, nextChange));
    setSelectedId(id);
    setFocusRequestId(id);
    setNewNodeDraft((current) => ({
      ...current,
      id: "",
      label: "",
      description: "",
      post: false,
      hidden: false,
    }));
    setStatus(`已记录新增节点草案：${id}`);
  }, [draftNodeChanges, newNodeDraft, nodes, plan, selectedId]);

  const updateSelectedDraftNode = useCallback(() => {
    if (!plan || !selectedId) {
      setStatus("请选择要编辑的节点。");
      return;
    }

    if (selectedId === plan.root) {
      setStatus("根节点暂不记录结构草案更新。");
      return;
    }

    const selectedNode = nodeSnapshotForId(plan, draftNodeChanges, selectedId);
    if (!selectedNode) {
      setStatus("所选节点已被删除或不可见。");
      return;
    }

    const label = selectedNodeDraft.label.trim();
    if (!label) {
      setStatus("节点 label 不能为空。");
      return;
    }

    const position = nodes.find((node) => node.id === selectedId)?.position;
    const nextChange: DraftNodeChange = {
      action: "update",
      id: selectedId,
      label,
      description: optionalText(selectedNodeDraft.description),
      mode: selectedNodeDraft.mode,
      post: selectedNodeDraft.post,
      hidden: selectedNodeDraft.hidden,
      position,
    };

    setDraftNodeChanges((current) => recordDraftNodeUpdate(current, nextChange));
    setStatus(`已记录节点更新草案：${selectedId}`);
  }, [draftNodeChanges, nodes, plan, selectedId, selectedNodeDraft]);

  const removeSelectedDraftNode = useCallback(() => {
    if (!plan || !selectedId) {
      setStatus("请选择要删除的节点。");
      return;
    }

    if (selectedId === plan.root) {
      setStatus("根节点不能删除。");
      return;
    }

    const selectedNode = nodeSnapshotForId(plan, draftNodeChanges, selectedId);
    if (!selectedNode) {
      setStatus("所选节点已被删除。");
      return;
    }

    setDraftNodeChanges((current) => recordDraftNodeRemove(current, {
      action: "remove",
      id: selectedId,
      label: selectedNode.label,
      description: selectedNode.description,
      mode: isDraftNodeMode(selectedNode.mode) ? selectedNode.mode : undefined,
      post: selectedNode.post,
      hidden: selectedNode.hidden,
      position: nodes.find((node) => node.id === selectedId)?.position ?? selectedNode.position,
    }));
    setDraftEdgeChanges((current) => current.filter((change) => change.from !== selectedId && change.to !== selectedId));
    setManualPositions((current) => {
      const next = new Map(current);
      next.delete(selectedId);
      return next;
    });
    setSelectedId(plan.root);
    setStatus(`已记录删除节点草案：${selectedId}`);
  }, [draftNodeChanges, nodes, plan, selectedId]);

  const onNodeDragStop: OnNodeDrag<PlanFlowNode> = useCallback((_event, node) => {
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position: node.position } : item));
    setManualPositions((current) => {
      const next = new Map(current);
      next.set(node.id, node.position);
      return next;
    });
    setDraftNodeChanges((current) => current.map((change) => (
      change.action === "add" && change.id === node.id ? { ...change, position: node.position } : change
    )));
  }, []);

  const focusNode = useCallback((id: string) => {
    setSelectedId(id);
    setFocusRequestId(id);
  }, []);

  const saveLayout = useCallback(async () => {
    const positions = Object.fromEntries(nodes.filter((node) => Boolean(plan?.nodes[node.id])).map((node) => [node.id, node.position]));
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
      setManualPositions(new Map());
    }
    setStatus("Saved");
  }, [nodes, plan?.overlay]);

  const exportDraft = useCallback(() => {
    if (!plan) {
      setStatus("计划尚未加载。");
      return;
    }

    if (draftChangeCount === 0) {
      setExportText("");
      setStatus("没有草案变更可导出。");
      return;
    }

    const nextExport = buildAgentDraftExport(plan, draftEdgeChanges, draftNodeChanges);
    setExportText(nextExport);
    setStatus("草案导出已生成");
  }, [draftChangeCount, draftEdgeChanges, draftNodeChanges, plan]);

  const clearDraft = useCallback(() => {
    setDraftEdgeChanges([]);
    setDraftNodeChanges([]);
    setExportText("");
    setStatus("草案已清空");
  }, []);

  if (!plan) return <div className="loading">Loading Plan Canvas...</div>;
  const selectedNodeEditDisabled = selectedId === plan.root || !nodeSnapshotForId(plan, draftNodeChanges, selectedId);

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
            <span>连线类型</span>
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
          <span className="draft-count" aria-label="Draft change count">草案 {draftChangeCount}</span>
          <button
            className={`ghost toolbar-toggle ${draftEditorOpen ? "active" : ""}`}
            data-action="toggle-draft-editor"
            aria-pressed={draftEditorOpen}
            onClick={() => setDraftEditorOpen((value) => !value)}
          >
            {draftEditorOpen ? "收起结构编辑" : "结构编辑"}
          </button>
          <button data-action="export-draft" onClick={exportDraft} disabled={draftChangeCount === 0}>导出草案</button>
          <button className="ghost" data-action="clear-draft" onClick={clearDraft} disabled={draftChangeCount === 0}>清空草案</button>
          <button data-action="save-layout" onClick={saveLayout}>Save layout</button>
          <span className={status.startsWith("Save failed") ? "status status-error" : "status"}>{status}</span>
        </div>
        {draftEditorOpen ? (
          <div className="draft-editor" aria-label="Draft node editor">
            <section className="draft-editor-section">
              <h3>新增节点</h3>
              <label className="draft-field">
                <span>ID</span>
                <input
                  data-action="draft-node-id"
                  value={newNodeDraft.id}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="node-id"
                />
              </label>
              <label className="draft-field">
                <span>Label</span>
                <input
                  data-action="draft-node-label"
                  value={newNodeDraft.label}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, label: event.target.value }))}
                  placeholder="节点名称"
                />
              </label>
              <label className="draft-field draft-field-wide">
                <span>Description</span>
                <input
                  data-action="draft-node-description"
                  value={newNodeDraft.description}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="可选"
                />
              </label>
              <label className="draft-field">
                <span>Mode</span>
                <select
                  data-action="draft-node-mode"
                  value={newNodeDraft.mode}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, mode: event.target.value as DraftNodeMode }))}
                >
                  {draftNodeModes.map((mode) => (
                    <option key={mode} value={mode}>{draftNodeModeLabels[mode]}</option>
                  ))}
                </select>
              </label>
              <label className="draft-check">
                <input
                  data-action="draft-node-post"
                  type="checkbox"
                  checked={newNodeDraft.post}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, post: event.target.checked }))}
                />
                <span>post</span>
              </label>
              <label className="draft-check">
                <input
                  data-action="draft-node-hidden"
                  type="checkbox"
                  checked={newNodeDraft.hidden}
                  onChange={(event) => setNewNodeDraft((current) => ({ ...current, hidden: event.target.checked }))}
                />
                <span>hidden</span>
              </label>
              <button type="button" className="ghost" data-action="generate-draft-node-id" onClick={generateDraftNodeId}>生成 ID</button>
              <button type="button" data-action="add-draft-node" onClick={addDraftNode}>添加草案节点</button>
            </section>
            <section className="draft-editor-section draft-editor-section-selected">
              <h3>编辑选中节点</h3>
              <span className="draft-selected-id">{selectedId}</span>
              <label className="draft-field">
                <span>Label</span>
                <input
                  data-action="draft-node-edit-label"
                  value={selectedNodeDraft.label}
                  disabled={selectedNodeEditDisabled}
                  onChange={(event) => setSelectedNodeDraft((current) => ({ ...current, label: event.target.value }))}
                />
              </label>
              <label className="draft-field draft-field-wide">
                <span>Description</span>
                <input
                  data-action="draft-node-edit-description"
                  value={selectedNodeDraft.description}
                  disabled={selectedNodeEditDisabled}
                  onChange={(event) => setSelectedNodeDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label className="draft-field">
                <span>Mode</span>
                <select
                  data-action="draft-node-edit-mode"
                  value={selectedNodeDraft.mode}
                  disabled={selectedNodeEditDisabled}
                  onChange={(event) => setSelectedNodeDraft((current) => ({ ...current, mode: event.target.value as DraftNodeMode }))}
                >
                  {draftNodeModes.map((mode) => (
                    <option key={mode} value={mode}>{draftNodeModeLabels[mode]}</option>
                  ))}
                </select>
              </label>
              <label className="draft-check">
                <input
                  data-action="draft-node-edit-post"
                  type="checkbox"
                  checked={selectedNodeDraft.post}
                  disabled={selectedNodeEditDisabled}
                  onChange={(event) => setSelectedNodeDraft((current) => ({ ...current, post: event.target.checked }))}
                />
                <span>post</span>
              </label>
              <label className="draft-check">
                <input
                  data-action="draft-node-edit-hidden"
                  type="checkbox"
                  checked={selectedNodeDraft.hidden}
                  disabled={selectedNodeEditDisabled}
                  onChange={(event) => setSelectedNodeDraft((current) => ({ ...current, hidden: event.target.checked }))}
                />
                <span>hidden</span>
              </label>
              <button type="button" data-action="update-draft-node" onClick={updateSelectedDraftNode} disabled={selectedNodeEditDisabled}>更新草案节点</button>
              <button type="button" className="ghost danger" data-action="remove-draft-node" onClick={removeSelectedDraftNode} disabled={selectedId === plan.root}>删除草案节点</button>
            </section>
          </div>
        ) : null}
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
          fitViewOptions={CANVAS_FIT_VIEW_OPTIONS}
          minZoom={MIN_CANVAS_ZOOM}
          maxZoom={MAX_CANVAS_ZOOM}
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

function stepFrameStyle(data: FlowNodeData): React.CSSProperties | undefined {
  if (!data.stepFrame) return undefined;
  return {
    "--step-frame-left": `${data.stepFrame.left}px`,
    "--step-frame-top": `${data.stepFrame.top}px`,
    "--step-frame-width": `${data.stepFrame.width}px`,
    "--step-frame-height": `${data.stepFrame.height}px`,
  } as React.CSSProperties;
}

function applyDraftNodeChangesToGraph(
  graph: ReturnType<typeof buildStudioGraph>,
  draftChanges: DraftNodeChange[]
): DraftStudioGraph {
  const removedNodeIds = new Set(draftChanges.filter((change) => change.action === "remove").map((change) => change.id));
  const updateChanges = new Map(draftChanges.filter((change) => change.action === "update").map((change) => [change.id, change]));
  const nodes: DraftStudioNode[] = graph.nodes
    .filter((node) => !removedNodeIds.has(node.id))
    .map((node) => {
      const update = updateChanges.get(node.id);
      if (!update) return node;
      return {
        ...node,
        data: {
          ...node.data,
          label: update.label ?? node.data.label,
          description: update.description,
          mode: update.mode ?? node.data.mode,
          post: update.post,
          hidden: update.hidden,
          draftOperation: "update",
        },
      };
    });

  for (const change of draftChanges) {
    if (change.action !== "add" || removedNodeIds.has(change.id)) continue;
    nodes.push({
      id: change.id,
      position: change.position ?? { x: 240, y: 240 },
      data: {
        id: change.id,
        label: change.label ?? change.id,
        description: change.description,
        kind: "group",
        mode: change.mode ?? "multi",
        post: change.post,
        hidden: change.hidden,
        draftOperation: "add",
      },
    });
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  return { nodes, edges, visibleNodeIds };
}

function buildReactFlowEdges(projectedEdges: StudioProjectedEdge[], draftChanges: DraftEdgeChange[], visibleNodeIds: ReadonlySet<string>): Edge[] {
  const removedKeys = new Set(draftChanges.filter((change) => change.action === "remove").map(edgeChangeKey));
  const baseEdges = projectedEdges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .filter((edge) => !removedKeys.has(edgeKey(edge.source, edge.target, edge.type)))
    .map((edge) => reactFlowEdge(edge));
  const draftAddEdges = draftChanges
    .filter((change) => change.action === "add")
    .filter((change) => visibleNodeIds.has(change.from) && visibleNodeIds.has(change.to))
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
    type: REACT_FLOW_EDGE_TYPE,
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

function recordDraftNodeAdd(current: DraftNodeChange[], change: DraftNodeChange): DraftNodeChange[] {
  if (current.some((item) => item.action === "add" && item.id === change.id)) return current;
  return [...current.filter((item) => item.id !== change.id), change];
}

function recordDraftNodeUpdate(current: DraftNodeChange[], change: DraftNodeChange): DraftNodeChange[] {
  const existingAdd = current.find((item) => item.action === "add" && item.id === change.id);
  if (existingAdd) {
    return current.map((item) => item.action === "add" && item.id === change.id ? { ...item, ...change, action: "add" } : item);
  }

  if (current.some((item) => item.action === "remove" && item.id === change.id)) return current;
  const withoutExistingUpdate = current.filter((item) => !(item.action === "update" && item.id === change.id));
  return [...withoutExistingUpdate, change];
}

function recordDraftNodeRemove(current: DraftNodeChange[], change: DraftNodeChange): DraftNodeChange[] {
  if (current.some((item) => item.action === "add" && item.id === change.id)) {
    return current.filter((item) => item.id !== change.id);
  }

  const withoutExisting = current.filter((item) => item.id !== change.id);
  return [...withoutExisting, change];
}

function buildAgentDraftExport(plan: StudioPlan, edgeChanges: DraftEdgeChange[], nodeChanges: DraftNodeChange[]): string {
  const nodeOperations = nodeChanges.map((change) => nodeOperationForExport(plan, nodeChanges, change));
  const changedOperations = edgeChanges.map((change) => ({
    action: change.action,
    type: change.type,
    from: change.from,
    fromLabel: nodeLabelForExport(plan, nodeChanges, change.from),
    to: change.to,
    toLabel: nodeLabelForExport(plan, nodeChanges, change.to),
  }));
  const dependencyAdds = edgeChanges
    .filter((change) => change.action === "add" && change.type === "dependency")
    .map((change) => ({ from: change.from, to: change.to }));
  const dependencyRemoves = edgeChanges
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
  const structureEdgeOperations = changedOperations.filter((operation) => operation.type !== "dependency");
  const sourceOnlyOperations = {
    count: nodeOperations.length + structureEdgeOperations.length,
    nodeOperations,
    edgeOperations: structureEdgeOperations,
  };
  const prompt = [
    "你在 /home/rick/desktop/dot 项目工作。",
    "直接执行下面的 Studio 结构修改草案，不要调用 subagent。",
    "不要只修改 Studio layout/positions；请修改真实源码配置，并补测试。",
    "",
    "要求：",
    "- 根据 nodeOperations 和 changedOperations 修改 configs/dot.yaml 的真实 menu children/mode/post/hidden/deps。",
    "- dependency 类型可参考 overlayPatchDraft，但最终仍应让 build/plan/generator 行为一致。",
    "- single/multi/flow/post 结构边和所有 node add/update/remove 不能只写 overlay；这些需要源码 YAML 结构调整。",
    "- 修改后运行 npm run typecheck、npm run lint、npm test、npm run build。",
    "- 重新生成 dist/dot.sh 并运行 bash -n dist/dot.sh。",
    "",
    "nodeOperations:",
    JSON.stringify(nodeOperations, null, 2),
    "",
    "changedOperations:",
    JSON.stringify(changedOperations, null, 2),
    "",
    "overlayPatchDraft:",
    JSON.stringify(overlayPatchDraft, null, 2),
    "",
    "sourceOnlyOperations:",
    JSON.stringify(sourceOnlyOperations, null, 2),
  ].join("\n");

  return prompt;
}

function nodeOperationForExport(plan: StudioPlan, nodeChanges: DraftNodeChange[], change: DraftNodeChange) {
  const snapshot = change.action === "remove"
    ? { ...plan.nodes[change.id], ...change }
    : nodeSnapshotForId(plan, nodeChanges, change.id);
  const mode = snapshot?.mode;

  return {
    action: change.action,
    id: change.id,
    label: snapshot?.label,
    description: snapshot?.description,
    mode: isDraftNodeMode(mode) ? mode : undefined,
    post: snapshot?.post,
    hidden: snapshot?.hidden,
    position: snapshot?.position,
  };
}

function nodeLabelForExport(plan: StudioPlan, nodeChanges: DraftNodeChange[], id: string): string | undefined {
  return nodeSnapshotForId(plan, nodeChanges, id)?.label ?? plan.nodes[id]?.label;
}

function nodeSnapshotForId(plan: StudioPlan, nodeChanges: DraftNodeChange[], id: string): PlanNode | null {
  let snapshot = plan.nodes[id] ? { ...plan.nodes[id] } : null;

  for (const change of nodeChanges) {
    if (change.id !== id) continue;
    if (change.action === "remove") return null;
    if (change.action === "add") {
      snapshot = {
        id: change.id,
        label: change.label ?? change.id,
        description: change.description,
        kind: "group",
        mode: change.mode ?? "multi",
        post: change.post,
        hidden: change.hidden,
        position: change.position,
      };
      continue;
    }
    if (!snapshot) continue;
    snapshot = {
      ...snapshot,
      label: change.label ?? snapshot.label,
      description: change.description,
      mode: change.mode ?? snapshot.mode,
      post: change.post,
      hidden: change.hidden,
      position: change.position ?? snapshot.position,
    };
  }

  return snapshot;
}

function nodeExistsForDraft(plan: StudioPlan, nodeChanges: DraftNodeChange[], id: string): boolean {
  return Boolean(nodeSnapshotForId(plan, nodeChanges, id));
}

function draftNodePosition(nodes: PlanFlowNode[], selectedId: string, draftCount: number): { x: number; y: number } {
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const base = selectedNode?.position ?? { x: 160, y: 160 };
  return {
    x: base.x + 340,
    y: base.y + (draftCount % 4) * 160,
  };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDraftNodeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueDraftNodeId(baseId: string, plan: StudioPlan, nodeChanges: DraftNodeChange[]): string {
  const fallback = baseId || "draft-node";
  let candidate = fallback;
  let index = 2;
  while (nodeExistsForDraft(plan, nodeChanges, candidate)) {
    candidate = `${fallback}-${index}`;
    index += 1;
  }
  return candidate;
}

function edgeSemanticType(edge: Edge): EditableEdgeType | null {
  const semanticType = edge.data?.semanticType;
  return isEditableEdgeType(semanticType) ? semanticType : null;
}

function isEditableEdgeType(value: unknown): value is EditableEdgeType {
  return typeof value === "string" && editableEdgeTypes.includes(value as EditableEdgeType);
}

function isDraftNodeMode(value: unknown): value is DraftNodeMode {
  return typeof value === "string" && draftNodeModes.includes(value as DraftNodeMode);
}

function edgeChangeKey(change: DraftEdgeChange): string {
  return edgeKey(change.from, change.to, change.type);
}

function edgeKey(from: string, to: string, type: PlanEdge["type"]): string {
  return `${type}:${from}->${to}`;
}

createRoot(document.getElementById("root")!).render(<App />);
