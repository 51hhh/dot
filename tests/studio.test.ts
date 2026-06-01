import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/loader/loader.js";
import { buildInstallationPlan } from "../src/planner/index.js";

const dotConfig = path.resolve(import.meta.dirname, "../configs/dot.yaml");

describe("studio canvas", () => {
  it("renders flow nodes left-to-right with structure badges", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(source).toContain("badgeForNode(data)");
    expect(source).toContain("badgeForNodeId(node.id, plan)");
    expect(source).toContain("single = exclusive branch");
    expect(source).toContain("multi = selectable independent group");
    expect(source).toContain("flow = linear chain");
    expect(source).toContain("sourcePosition: Position.Right");
    expect(source).toContain("targetPosition: Position.Left");
    expect(source).toContain("layoutBranch(rootId, 0, 0)");
    expect(source).toContain("isStructureEdge(edge.type)");
    expect(source).toContain('type === "single" || type === "multi" || type === "flow" || type === "post"');
    expect(source).toContain("function layoutBranch(");
    expect(source).toContain("function layoutFlowChain(");
    expect(source).toContain("single: { stroke: \"#38bdf8\"");
    expect(source).toContain("multi: { stroke: \"#34d399\"");
    expect(source).toContain("flow: { stroke: \"#a78bfa\"");
    expect(source).toContain("dependency: { stroke: \"#fb7185\"");
    expect(source).toContain("post: { stroke: \"#facc15\"");
    expect(source).toContain("aria-label=\"Plan edge legend\"");
    expect(css).toContain(".plan-node-mode-single");
    expect(css).toContain(".plan-node-mode-multi");
    expect(css).toContain(".plan-node-mode-flow");
    expect(css).toContain(".edge-single");
    expect(css).toContain(".edge-multi");
    expect(css).toContain(".edge-flow");
  });

  it("loads the real tmux plan as a linear flow chain for the canvas", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));

    expect(plan.version).toBe(1);
    expect(plan.nodes.tmux).toBeDefined();
    expect(plan.edges).toContainEqual({ from: "tmux", to: "tmux-install", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "tmux-install", to: "tmux-github-mirror", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "tmux-options", to: "tmux-finalize", type: "flow" });
    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "tmux-options", type: "flow" });
    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "tmux-header", type: "flow" });
  });

  it("uses a collapsible tree sidebar without a right inspector", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(source).toContain("sidebarCollapsed");
    expect(source).toContain("toggle-sidebar");
    expect(source).toContain("focusNode(node.id)");
    expect(source).toContain("reactFlowInstance.setCenter");
    expect(source).not.toContain('id="inspector"');
    expect(css).toContain("#studio-shell.sidebar-collapsed");
    expect(css).toContain("::-webkit-scrollbar");
  });

  it("uses left-to-right mind map layout", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");

    expect(source).toContain("layoutBranch(rootId, 0, 0)");
    expect(source).toContain("if (!isStructureEdge(edge.type)) continue");
    expect(source).toContain("const x = depth * layerSpacing");
    expect(source).toContain("positions[id] = { x, y: centerY }");
    expect(source).toContain("layoutBranchGroup(branches, depth + 1, centerY, flows.length > 0)");
    expect(source).toContain("layoutFlowChain(flows, depth + 1, centerY)");
    expect(source).toContain("fallbackY");
    expect(source).toContain("position: node.position ?? layout[node.id] ?? { x: 0, y: 0 }");
    expect(source).toContain("sourcePosition: Position.Right");
    expect(source).toContain("targetPosition: Position.Left");
    expect(source).not.toContain('edge.type !== "child"');
    expect(source).not.toContain('edge.type === "child"');
    expect(source).not.toContain("y: depth * 150");
  });

  it("uses colorful bezier edges like a workflow canvas", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");

    expect(source).toContain('type: "default"');
    expect(source).toContain('single: { stroke: "#38bdf8"');
    expect(source).toContain('multi: { stroke: "#34d399"');
    expect(source).toContain('flow: { stroke: "#a78bfa"');
    expect(source).toContain('dependency: { stroke: "#fb7185"');
    expect(source).toContain('post: { stroke: "#facc15"');
    expect(source).not.toContain('type: "smoothstep"');
  });

  it("renders a compact edge legend without a right inspector", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(source).toContain('aria-label="Plan edge legend"');
    expect(source).toContain(">单选<");
    expect(source).toContain(">多选<");
    expect(source).toContain(">流程<");
    expect(source).toContain(">依赖<");
    expect(source).toContain(">后置<");
    expect(source).toContain("legend-single");
    expect(source).toContain("legend-multi");
    expect(source).toContain("legend-flow");
    expect(source).toContain("legend-dependency");
    expect(source).toContain("legend-post");
    expect(source).not.toContain('id="inspector"');
    expect(css).toContain(".legend");
    expect(css).toContain(".legend-single");
    expect(css).toContain(".legend-multi");
    expect(css).toContain(".legend-flow");
    expect(css).toContain(".legend-dependency");
    expect(css).toContain(".legend-post");
  });

  it("uses React Flow handles and a single themed canvas background", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(source).toContain("Handle");
    expect(source).toContain("Position.Left");
    expect(source).toContain("Position.Right");
    expect(source).toContain("type=\"target\"");
    expect(source).toContain("type=\"source\"");
    expect(css).not.toContain(".react-flow { background-image");
    expect(css).toContain(".react-flow__controls");
    expect(css).toContain(".react-flow__edge-path");
  });

});
