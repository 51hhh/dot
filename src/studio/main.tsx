import React, { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type InstallationPlan, type PlanNode } from "../planner/types.js";
import {
  buildWorkflowBoard,
  type WorkflowBoard,
  type WorkflowBoardItem,
  type WorkflowBoardModule,
  type WorkflowBoardOptionGroup,
  type WorkflowBoardStep,
} from "./board.js";
import { buildStudioGraph, type StudioNodeData } from "./projection.js";
import "./studio.css";

/**
 * Studio main component - read-only visualization and debugging tool
 *
 * Features:
 * - Board view: workflow panel display
 * - Canvas view: dependency graph visualization
 * - Layout saving: save node positions
 * - Diagnostics panel: show configuration issues
 *
 * Not included (removed in refactoring):
 * - Draft editing: node add/remove/connect
 * - Draft export: generate change prompts
 * - Interactive editing: nodes are read-only
 */

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
type StudioViewMode = "board" | "canvas";

const MIN_CANVAS_ZOOM = 0.05;
const MAX_CANVAS_ZOOM = 2;
const CANVAS_FIT_VIEW_OPTIONS = { padding: 0.08, minZoom: MIN_CANVAS_ZOOM, maxZoom: 0.85 };
const REACT_FLOW_EDGE_TYPE = "smoothstep";

function PlanNodeView({ id, data, selected }: NodeProps<PlanFlowNode>) {
  const badge = badgeForNode(data);
  const roleClass = data.canvasRole ? ` plan-node-role-${data.canvasRole}` : "";
  return (
    <div
      className={`plan-node plan-node-${data.kind} plan-node-mode-${badge.mode}${roleClass} ${selected ? "selected" : ""}`}
      onClick={() => data.onSelect(id)}
    >
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

function WorkflowBoardView({
  board,
  selectedId,
  onSelect,
  onToggleExpand,
}: {
  board: WorkflowBoard;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <div className="workflow-board" data-view="workflow-board">
      <header className="workflow-board-header">
        <div>
          <span className="workflow-eyebrow">Workflow Board</span>
          <h1>{board.root.label}</h1>
          {board.root.description ? <p>{board.root.description}</p> : null}
        </div>
        <div className="workflow-board-stats" aria-label="Workflow board summary">
          <span>{board.modules.length} 项目</span>
          <span>{board.modules.reduce((sum, module) => sum + module.stepCount, 0)} 步骤</span>
          <span>{board.modules.reduce((sum, module) => sum + module.optionCount, 0)} 选项</span>
          <span>{board.modules.reduce((sum, module) => sum + module.postCount, 0)} 后置</span>
        </div>
      </header>
      <div className="workflow-module-list">
        {board.modules.map((module, index) => (
          <WorkflowModuleSection
            key={module.id}
            module={module}
            index={index + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowModuleSection({
  module,
  index,
  selectedId,
  onSelect,
  onToggleExpand,
}: {
  module: WorkflowBoardModule;
  index: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const badge = displayBadgeForBoardItem(module);
  return (
    <section className={`workflow-module ${module.id === selectedId ? "active" : ""}`} data-module-id={module.id}>
      <header className="workflow-module-header">
        <button type="button" className="workflow-module-title" onClick={() => onSelect(module.id)}>
          <span className="workflow-index">{index}</span>
          <span>
            <strong>{module.label}</strong>
            <small>{module.id}</small>
          </span>
          <span className={`mode-badge mode-badge-${badge.mode}`}>{badge.label}</span>
        </button>
        <div className="workflow-module-stats">
          <span>{module.stepCount} 步骤</span>
          <span>{module.optionCount} 选项</span>
          {module.postCount > 0 ? <span>{module.postCount} 后置</span> : null}
          {module.dependencyCount > 0 ? <span>{module.dependencyCount} 依赖</span> : null}
        </div>
      </header>
      {module.description ? <p className="workflow-module-description">{module.description}</p> : null}
      <div className="workflow-step-list">
        {module.steps.map((step) => (
          <WorkflowStepCard
            key={step.id}
            step={step}
            selectedId={selectedId}
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </section>
  );
}

function WorkflowStepCard({
  step,
  selectedId,
  onSelect,
  onToggleExpand,
}: {
  step: WorkflowBoardStep;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const badge = displayBadgeForBoardItem(step);
  return (
    <article className={`workflow-step ${step.id === selectedId ? "active" : ""}`} data-step-id={step.id}>
      <button type="button" className="workflow-step-main" onClick={() => onSelect(step.id)}>
        <span className="workflow-step-number">{step.index}</span>
        <span className="workflow-step-copy">
          <span className="workflow-step-title">
            <strong>{step.label}</strong>
            <span className={`mode-badge mode-badge-${badge.mode}`}>{badge.label}</span>
            {step.post ? <span className="workflow-flag">post</span> : null}
            {step.hidden ? <span className="workflow-flag">hidden</span> : null}
          </span>
          <small>{step.id} · {step.kind}{step.script ? " · script" : ""}{step.prompt ? " · prompt" : ""}</small>
          {step.description ? <span className="workflow-description">{step.description}</span> : null}
        </span>
      </button>
      <WorkflowDependencyPills item={step} onSelect={onSelect} />
      {step.optionGroups.length > 0 ? (
        <div className="workflow-option-groups">
          {step.optionGroups.map((group) => (
            <WorkflowOptionGroupView
              key={`${step.id}-${group.type}`}
              group={group}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <p className="workflow-empty">此步骤是直接执行动作。</p>
      )}
      {step.nestedFlow ? (
        <section className="workflow-nested" aria-label={`${step.label} nested flow`}>
          <div className="workflow-nested-summary">
            <button type="button" className="ghost" data-action="toggle-board-nested-flow" onClick={() => onToggleExpand(step.id)}>
              {step.nestedFlow.expanded ? "折叠子流程" : "展开子流程"}
            </button>
            <span>{step.nestedFlow.stepCount} 子步骤</span>
            <span>{step.nestedFlow.optionCount} 选项</span>
            {step.nestedFlow.postCount > 0 ? <span>{step.nestedFlow.postCount} 后置</span> : null}
          </div>
          {step.nestedFlow.expanded ? (
            <div className="workflow-nested-steps">
              {step.nestedFlow.steps.map((nestedStep) => (
                <WorkflowStepCard
                  key={nestedStep.id}
                  step={nestedStep}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function WorkflowOptionGroupView({
  group,
  selectedId,
  onSelect,
}: {
  group: WorkflowBoardOptionGroup;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className={`workflow-option-group workflow-option-group-${group.type}`}>
      <div className="workflow-option-group-header">
        <strong>{group.label}</strong>
        <span>{group.items.length}</span>
      </div>
      <p>{group.description}</p>
      <div className="workflow-option-grid">
        {group.items.map((item) => (
          <WorkflowItemButton key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function WorkflowItemButton({
  item,
  selectedId,
  onSelect,
}: {
  item: WorkflowBoardItem;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const badge = displayBadgeForBoardItem(item);
  return (
    <button
      type="button"
      className={`workflow-item workflow-item-${item.role} ${item.id === selectedId ? "active" : ""}`}
      onClick={() => onSelect(item.id)}
      title={item.label}
    >
      <span className="workflow-item-title">
        <strong>{item.label}</strong>
        <span className={`mode-badge mode-badge-${badge.mode}`}>{badge.label}</span>
      </span>
      <small>{item.id}{item.hidden ? " · hidden" : ""}{item.post ? " · post" : ""}{item.prompt ? " · prompt" : ""}</small>
      {item.description ? <span className="workflow-item-description">{item.description}</span> : null}
      <WorkflowDependencyPills item={item} onSelect={onSelect} compact />
    </button>
  );
}

function WorkflowDependencyPills({
  item,
  onSelect,
  compact = false,
}: {
  item: WorkflowBoardItem;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  if (item.dependsOn.length === 0 && item.requiredBy.length === 0) return null;
  return (
    <div className={`workflow-dependencies ${compact ? "compact" : ""}`}>
      {item.dependsOn.length > 0 ? (
        <span className="workflow-dependency-row">
          <span>依赖</span>
          {item.dependsOn.map((dependency) => (
            <button key={`${item.id}-depends-${dependency.id}`} type="button" onClick={() => onSelect(dependency.id)}>
              {dependency.label}{dependency.hidden ? " · hidden" : ""}
            </button>
          ))}
        </span>
      ) : null}
      {item.requiredBy.length > 0 ? (
        <span className="workflow-dependency-row">
          <span>被依赖</span>
          {item.requiredBy.map((dependency) => (
            <button key={`${item.id}-required-${dependency.id}`} type="button" onClick={() => onSelect(dependency.id)}>
              {dependency.label}{dependency.hidden ? " · hidden" : ""}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function App() {
  const [plan, setPlan] = useState<StudioPlan | null>(null);
  const [nodes, setNodes] = useState<PlanFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string>("");
  const [focusRequestId, setFocusRequestId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [viewMode, setViewMode] = useState<StudioViewMode>("canvas");
  const [useSavedLayout, setUseSavedLayout] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<{ setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void } | null>(null);
  const [status, setStatus] = useState("");
  const board = useMemo(() => plan ? buildWorkflowBoard(plan, { expandedNodeIds }) : null, [expandedNodeIds, plan]);

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
        setExpandedNodeIds(new Set());
      });
  }, []);

  useEffect(() => {
    if (!plan) return;
    const projection = buildStudioGraph(plan, {
      showDependencies,
      expandedNodeIds,
      useSavedPositions: useSavedLayout,
    });
    setNodes(projection.nodes.map((node) => ({
      id: node.id,
      type: "planNode",
      position: manualPositions.get(node.id) ?? node.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { ...node.data, onSelect: selectNode, onToggleExpand: toggleNodeExpansion },
    })));
    setEdges(projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: REACT_FLOW_EDGE_TYPE,
      className: `edge-${edge.type}${edge.nested ? " edge-nested" : ""}`,
      style: edgeStyle(edge.type),
    })));
  }, [expandedNodeIds, manualPositions, plan, selectNode, showDependencies, toggleNodeExpansion, useSavedLayout]);

  useEffect(() => {
    if (!focusRequestId || !reactFlowInstance || viewMode !== "canvas") return;
    const node = nodes.find((item) => item.id === focusRequestId);
    if (!node) return;
    reactFlowInstance.setCenter(node.position.x + 114, node.position.y + 42, { zoom: 1.1, duration: 450 });
    setFocusRequestId("");
  }, [focusRequestId, nodes, reactFlowInstance, viewMode]);

  const onNodesChange = useCallback((changes: NodeChange<PlanFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== "remove"), current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes.filter((change) => change.type !== "remove"), current));
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

  if (!plan || !board) return <div className="loading">Loading Studio...</div>;

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
          <div className="view-switch" role="group" aria-label="Studio view mode">
            <button
              className={viewMode === "board" ? "active" : ""}
              data-action="show-board"
              aria-pressed={viewMode === "board"}
              onClick={() => setViewMode("board")}
            >
              Board
            </button>
            <button
              className={viewMode === "canvas" ? "active" : ""}
              data-action="show-canvas"
              aria-pressed={viewMode === "canvas"}
              onClick={() => setViewMode("canvas")}
            >
              Canvas
            </button>
          </div>
          <strong>{viewMode === "board" ? "Workflow Board" : "Plan Canvas"}</strong>
          {viewMode === "canvas" ? (
            <>
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
              <button
                className={`ghost toolbar-toggle ${useSavedLayout ? "active" : ""}`}
                data-action="toggle-saved-layout"
                aria-pressed={useSavedLayout}
                onClick={() => {
                  setUseSavedLayout((value) => !value);
                  setManualPositions(new Map());
                }}
              >
                {useSavedLayout ? "Saved layout" : "Auto layout"}
              </button>
              <button data-action="save-layout" onClick={saveLayout}>Save layout</button>
            </>
          ) : (
            <div className="board-toolbar-summary" aria-label="Workflow board totals">
              <span>{board.modules.length} 项目</span>
              <span>{board.modules.reduce((sum, module) => sum + module.stepCount, 0)} 步骤</span>
              <span>{board.modules.reduce((sum, module) => sum + module.optionCount, 0)} 选项</span>
            </div>
          )}
          <span className={status.startsWith("Save failed") ? "status status-error" : "status"}>{status}</span>
        </div>
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
        {viewMode === "board" ? (
          <WorkflowBoardView
            board={board}
            selectedId={selectedId}
            onSelect={selectNode}
            onToggleExpand={toggleNodeExpansion}
          />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setReactFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_event, node) => selectNode(node.id)}
            nodesConnectable={false}
            nodesDraggable={false}
            edgesFocusable={false}
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
        )}
      </section>
    </main>
  );
}

function badgeForNode(node: PlanNode) {
  return badgeForMode(node.mode);
}

function displayBadgeForBoardItem(item: WorkflowBoardItem) {
  return badgeForMode(item.mode);
}

function badgeForMode(mode: PlanNode["mode"]) {
  if (mode === "single") return { mode: "single", label: "单选", title: "single = exclusive branch" };
  if (mode === "multi") return { mode: "multi", label: "多选", title: "multi = selectable independent group" };
  if (mode === "flow") return { mode: "flow", label: "流程", title: "flow = linear chain" };
  return { mode: mode ?? "root", label: "根", title: "root = entry point" };
}

function badgeForNodeId(nodeId: string, plan: InstallationPlan) {
  return badgeForNode(plan.nodes[nodeId]);
}

function edgeStyle(type: string) {
  const palette: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string; opacity?: number }> = {
    child: { stroke: "#7dd3fc", strokeWidth: 2.2 },
    single: { stroke: "#38bdf8", strokeWidth: 2.3 },
    multi: { stroke: "#34d399", strokeWidth: 2.3 },
    dependency: { stroke: "#fb7185", strokeWidth: 1.8, strokeDasharray: "8 7", opacity: 0.62 },
    post: { stroke: "#facc15", strokeWidth: 2.8 },
    flow: { stroke: "#a78bfa", strokeWidth: 2.5 },
  };
  return palette[type] ?? palette.child;
}

createRoot(document.getElementById("root")!).render(<App />);
