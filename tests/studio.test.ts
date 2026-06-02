import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/loader/loader.js";
import { buildInstallationPlan } from "../src/planner/index.js";
import { buildStudioGraph } from "../src/studio/projection.js";
import { isPathInside } from "../src/studio/server.js";

const dotConfig = path.resolve(import.meta.dirname, "../configs/dot.yaml");
const approxNodeWidth = 260;
const approxNodeHeight = 132;
const minNodeGap = 24;

function expectNoProjectedNodeOverlap(graph: ReturnType<typeof buildStudioGraph>) {
  for (let outer = 0; outer < graph.nodes.length; outer += 1) {
    for (let inner = outer + 1; inner < graph.nodes.length; inner += 1) {
      const a = graph.nodes[outer];
      const b = graph.nodes[inner];
      const overlapsX = Math.abs(a.position.x - b.position.x) < approxNodeWidth + minNodeGap;
      const overlapsY = Math.abs(a.position.y - b.position.y) < approxNodeHeight + minNodeGap;
      expect(overlapsX && overlapsY, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe("studio canvas", () => {
  it("checks Studio asset paths with path-relative directory boundaries", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/server.ts"), "utf-8");
    const root = path.resolve("/tmp/dot/dist/studio");

    expect(isPathInside(root, path.join(root, "app.js"))).toBe(true);
    expect(isPathInside(root, path.join(root, "assets/style.css"))).toBe(true);
    expect(isPathInside(root, path.resolve("/tmp/dot/dist/studio-evil/app.js"))).toBe(false);
    expect(isPathInside(root, path.resolve("/tmp/dot/dist/secret.js"))).toBe(false);
    expect(source).toContain("path.relative(rootPath, candidatePath)");
    expect(source).not.toContain("assetPath.startsWith(studioRoot)");
  });

  it("keeps the React Flow shell left-to-right with visible graph affordances", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(source).toContain("buildStudioGraph(plan, { showDependencies, expandedNodeIds })");
    expect(source).toContain("badgeForNode(data)");
    expect(source).toContain("badgeForNodeId(node.id, plan)");
    expect(source).toContain("single = exclusive branch");
    expect(source).toContain("multi = selectable independent group");
    expect(source).toContain("flow = linear chain");
    expect(source).toContain("sourcePosition: Position.Right");
    expect(source).toContain("targetPosition: Position.Left");
    expect(source).toContain("nested-flow-summary");
    expect(source).toContain('data-action="toggle-dependencies"');
    expect(source).toContain('aria-label="Plan diagnostics"');
    expect(source).toContain("Save failed:");
    expect(source).toContain("base: plan?.overlay");
    expect(source).toContain('data-action="draft-edge-type"');
    expect(source).toContain('data-action="export-draft"');
    expect(source).toContain('data-action="clear-draft"');
    expect(source).toContain("type OnConnect");
    expect(source).toContain("onConnect={onConnect}");
    expect(source).toContain("nodesConnectable");
    expect(source).toContain('deleteKeyCode={["Backspace", "Delete"]}');
    expect(source).not.toContain("nodesConnectable={false}");
    expect(source).not.toContain("deleteKeyCode={null}");
    expect(source).toContain("patch: { version: 1, positions }");
    expect(source).toContain("buildAgentDraftExport(plan, draftEdgeChanges)");
    expect(source).toContain("changedOperations:");
    expect(source).toContain("overlayPatchDraft:");
    expect(source).toContain("sourceOnlyOperations:");
    expect(source).not.toContain("optionGroups");
    expect(source).not.toContain("postItems");
    expect(source).not.toContain("join-affordance");
    expect(css).toContain(".plan-node-mode-single");
    expect(css).toContain(".plan-node-mode-multi");
    expect(css).toContain(".plan-node-mode-flow");
    expect(css).toContain(".nested-flow-summary");
    expect(css).toContain(".diagnostics-panel");
    expect(css).toContain(".status-error");
    expect(css).toContain(".draft-panel");
    expect(css).toContain(".draft-export");
    expect(css).toContain(".edge-draft .react-flow__edge-path");
    expect(css).not.toContain(".option-chip-single");
    expect(css).not.toContain(".option-chip-multi");
    expect(css).not.toContain(".post-list");
  });

  it("projects the real tmux plan as a seven-step horizontal primary spine", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));
    const graph = buildStudioGraph(plan);
    const expectedSpine = [
      "tmux-install",
      "tmux-github-mirror",
      "tmux-prefix",
      "tmux-plugins",
      "tmux-status",
      "tmux-options",
      "tmux-finalize",
    ];

    expect(graph.primarySpines.tmux).toEqual(expectedSpine);
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["tmux", ...expectedSpine]));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-install", target: "tmux-github-mirror", type: "flow" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-options", target: "tmux-finalize", type: "flow" }));

    const spineNodes = expectedSpine.map((id) => graph.nodes.find((node) => node.id === id));
    expect(spineNodes.every(Boolean)).toBe(true);
    for (let index = 1; index < spineNodes.length; index += 1) {
      expect(spineNodes[index]!.position.x).toBeGreaterThan(spineNodes[index - 1]!.position.x);
      expect(spineNodes[index]!.position.y).toBe(spineNodes[0]!.position.y);
    }
  });

  it("renders single and multi options as visible local nodes by default", () => {
    const graph = buildStudioGraph(buildInstallationPlan(loadConfig(dotConfig)));
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const install = graph.nodes.find((node) => node.id === "tmux-install")!;
    const prefix = graph.nodes.find((node) => node.id === "tmux-prefix")!;
    const options = graph.nodes.find((node) => node.id === "tmux-options")!;
    const installApt = graph.nodes.find((node) => node.id === "tmux-install-apt")!;
    const ctrlA = graph.nodes.find((node) => node.id === "tmux-prefix-ctrl-a")!;
    const mouse = graph.nodes.find((node) => node.id === "tmux-opt-mouse")!;

    expect([...nodeIds]).toEqual(expect.arrayContaining([
      "tmux-install-apt",
      "tmux-install-source",
      "tmux-prefix-ctrl-a",
      "tmux-prefix-compose",
      "tmux-opt-mouse",
      "tmux-opt-reload",
    ]));
    expect(graph.compactNodeIds.has("tmux-install-apt")).toBe(false);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-install", target: "tmux-install-apt", type: "single" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-prefix", target: "tmux-prefix-ctrl-a", type: "single" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-options", target: "tmux-opt-mouse", type: "multi" }));
    expect(installApt.position.y).toBeLessThan(install.position.y);
    expect(ctrlA.position.y).toBeLessThan(prefix.position.y);
    expect(mouse.position.y).toBeGreaterThan(options.position.y);
    expect(mouse.position.x).toBeGreaterThan(options.position.x);
  });

  it("projects local lanes without default card overlap", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));
    const collapsed = buildStudioGraph(plan);
    const expanded = buildStudioGraph(plan, { expandedNodeIds: new Set(["tmux-plugins"]) });
    const install = collapsed.nodes.find((node) => node.id === "tmux-install")!;
    const installApt = collapsed.nodes.find((node) => node.id === "tmux-install-apt")!;
    const recommended = collapsed.nodes.find((node) => node.id === "tmux-install-recommended")!;
    const options = collapsed.nodes.find((node) => node.id === "tmux-options")!;
    const mouse = collapsed.nodes.find((node) => node.id === "tmux-opt-mouse")!;
    const cleanup = collapsed.nodes.find((node) => node.id === "tmux-cleanup-sockets")!;

    expectNoProjectedNodeOverlap(collapsed);
    expectNoProjectedNodeOverlap(expanded);
    expect(installApt.position.x).toBeGreaterThan(install.position.x);
    expect(installApt.position.y).toBeLessThan(install.position.y);
    expect(recommended.position.y).toBeGreaterThan(install.position.y);
    expect(mouse.position.x).toBeGreaterThan(options.position.x);
    expect(mouse.position.y).toBeGreaterThan(options.position.y);
    expect(cleanup.position.y).toBeGreaterThan(mouse.position.y);
  });

  it("hides dependency edges by default and toggles them as low-emphasis dashed edges", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));
    const hidden = buildStudioGraph(plan);
    const shown = buildStudioGraph(plan, { showDependencies: true });
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/main.tsx"), "utf-8");
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/studio/studio.css"), "utf-8");

    expect(hidden.edges.some((edge) => edge.type === "dependency")).toBe(false);
    expect(shown.edges.some((edge) => edge.type === "dependency")).toBe(true);
    expect(source).toContain("showDependencies, setShowDependencies");
    expect(source).toContain('data-action="toggle-dependencies"');
    expect(source).toContain("strokeDasharray: \"8 7\"");
    expect(source).toContain("opacity: 0.62");
    expect(css).toContain(".edge-dependency .react-flow__edge-path");
    expect(css).toContain("stroke-dasharray: 8 7");
    expect(css).toContain("opacity: .62");
  });

  it("collapses tmux plugin nested flow by default and expands it locally", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));
    const collapsed = buildStudioGraph(plan);
    const expanded = buildStudioGraph(plan, { expandedNodeIds: new Set(["tmux-plugins"]) });
    const collapsedIds = new Set(collapsed.nodes.map((node) => node.id));
    const expandedIds = new Set(expanded.nodes.map((node) => node.id));
    const pluginsNode = collapsed.nodes.find((node) => node.id === "tmux-plugins")!;
    const foundationNode = expanded.nodes.find((node) => node.id === "tmux-plugin-foundation")!;

    expect(pluginsNode.data.nestedFlow).toEqual({
      expanded: false,
      stepCount: 6,
      optionCount: 13,
      postCount: 1,
    });
    expect(collapsedIds.has("tmux-plugin-foundation")).toBe(false);
    expect(expandedIds.has("tmux-plugin-foundation")).toBe(true);
    expect(expanded.edges).toContainEqual(expect.objectContaining({
      source: "tmux-plugins",
      target: "tmux-plugin-foundation",
      type: "flow",
      nested: true,
    }));
    expect(foundationNode.position.y).toBeGreaterThan(pluginsNode.position.y);
    expect(expandedIds.has("tmux-tpm")).toBe(true);
    expect(expandedIds.has("tmux-tpm-finalize")).toBe(true);
    expect(expanded.edges).toContainEqual(expect.objectContaining({ source: "tmux-plugin-foundation", target: "tmux-tpm", type: "multi", nested: true }));
    expect(expanded.edges).toContainEqual(expect.objectContaining({ source: "tmux-plugin-foundation", target: "tmux-tpm-finalize", type: "post", nested: true }));
  });

  it("keeps a terminal nested flow collapsed until explicitly expanded", () => {
    const plan = buildInstallationPlan({
      name: "terminal nested flow",
      version: "1.0",
      menuMode: "single",
      menu: [{
        id: "flow-root",
        label: "Flow root",
        mode: "flow",
        children: [{
          id: "nested-flow",
          label: "Nested flow",
          mode: "flow",
          children: [
            { id: "nested-first", label: "Nested first" },
            { id: "nested-second", label: "Nested second" },
          ],
        }],
      }],
    });
    const collapsed = buildStudioGraph(plan);
    const expanded = buildStudioGraph(plan, { expandedNodeIds: new Set(["nested-flow"]) });

    expect(collapsed.primarySpines["flow-root"]).toEqual(["nested-flow"]);
    expect(collapsed.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["flow-root", "nested-flow"]));
    expect(collapsed.nodes.map((node) => node.id)).not.toEqual(expect.arrayContaining(["nested-first"]));
    expect(collapsed.nodes.find((node) => node.id === "nested-flow")!.data.nestedFlow).toEqual({
      expanded: false,
      stepCount: 2,
      optionCount: 0,
      postCount: 0,
    });
    expect(expanded.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["nested-first", "nested-second"]));
    expect(expanded.edges).toContainEqual(expect.objectContaining({
      source: "nested-flow",
      target: "nested-first",
      type: "flow",
      nested: true,
    }));
  });

  it("renders post nodes visibly without adding them to the main spine", () => {
    const graph = buildStudioGraph(buildInstallationPlan(loadConfig(dotConfig)));
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const finalize = graph.nodes.find((node) => node.id === "tmux-finalize")!;
    const recommended = graph.nodes.find((node) => node.id === "tmux-install-recommended")!;
    const cleanup = graph.nodes.find((node) => node.id === "tmux-cleanup-sockets")!;

    expect(graph.primarySpines.tmux).not.toContain("tmux-cleanup-sockets");
    expect(graph.primarySpines.tmux).not.toContain("tmux-final-notes");
    expect(nodeIds.has("tmux-install-recommended")).toBe(true);
    expect(nodeIds.has("tmux-cleanup-sockets")).toBe(true);
    expect(nodeIds.has("tmux-final-notes")).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-install", target: "tmux-install-recommended", type: "post" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "tmux-finalize", target: "tmux-cleanup-sockets", type: "post" }));
    expect(recommended.position.y).toBeGreaterThan(graph.nodes.find((node) => node.id === "tmux-install")!.position.y);
    expect(cleanup.position.y).toBeGreaterThan(finalize.position.y);
  });

  it("uses saved positions for every visible node including the root", () => {
    const plan = buildInstallationPlan(loadConfig(dotConfig));
    plan.nodes[plan.root] = { ...plan.nodes[plan.root], position: { x: 11, y: 22 } };
    plan.nodes.tmux = { ...plan.nodes.tmux, position: { x: 333, y: 444 } };
    plan.nodes["tmux-prefix-ctrl-a"] = { ...plan.nodes["tmux-prefix-ctrl-a"], position: { x: 555, y: 666 } };

    const graph = buildStudioGraph(plan);

    expect(graph.nodes.find((node) => node.id === plan.root)!.position).toEqual({ x: 11, y: 22 });
    expect(graph.nodes.find((node) => node.id === "tmux")!.position).toEqual({ x: 333, y: 444 });
    expect(graph.nodes.find((node) => node.id === "tmux-prefix-ctrl-a")!.position).toEqual({ x: 555, y: 666 });
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
