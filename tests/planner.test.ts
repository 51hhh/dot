import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/loader/loader.js";
import type { Config } from "../src/loader/schema.js";
import { applyPlanOverlay, loadPlanOverlay, savePlanOverlay } from "../src/planner/overlay.js";
import { buildInstallationPlan } from "../src/planner/index.js";
import { renderPlanTree } from "../src/planner/render-tree.js";
import type { InstallationPlan, PlanEdge } from "../src/planner/types.js";

describe("buildInstallationPlan", () => {
  it("models single, multi, and flow structures distinctly", () => {
    const config: Config = {
      name: "dot",
      version: "1.0",
      menuMode: "single",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            {
              id: "install",
              label: "Install",
              mode: "single",
              children: [
                { id: "install-apt", label: "APT", script: "templates/tmux/install-apt.sh" },
                { id: "install-source", label: "Source", script: "templates/tmux/install-source.sh" },
              ],
            },
            {
              id: "plugins",
              label: "Plugins",
              mode: "multi",
              children: [
                { id: "plugin-a", label: "Plugin A", script: "templates/tmux/plugin-a.sh" },
                { id: "plugin-b", label: "Plugin B", script: "templates/tmux/plugin-b.sh" },
              ],
            },
            { id: "notes", label: "Notes", script: "templates/tmux/final-notes.sh", post: true },
          ],
        },
      ],
    };

    const plan = buildInstallationPlan(config);

    expect(plan.nodes.__root.mode).toBe("single");
    expect(plan.nodes.tmux.mode).toBe("flow");
    expect(plan.nodes.install.mode).toBe("single");
    expect(plan.nodes.plugins.mode).toBe("multi");
    expect(plan.edges).toContainEqual({ from: "__root", to: "tmux", type: "single" });
    expect(plan.edges).toContainEqual({ from: "tmux", to: "install", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "install", to: "plugins", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "install", to: "install-apt", type: "single" });
    expect(plan.edges).toContainEqual({ from: "install", to: "install-source", type: "single" });
    expect(plan.edges).toContainEqual({ from: "plugins", to: "plugin-a", type: "multi" });
    expect(plan.edges).toContainEqual({ from: "plugins", to: "plugin-b", type: "multi" });
    expect(plan.edges).toContainEqual({ from: "plugins", to: "notes", type: "post" });
    expect(structureEdgesFrom(plan, "install")).toEqual([
      { from: "install", to: "install-apt", type: "single" },
      { from: "install", to: "install-source", type: "single" },
      { from: "install", to: "plugins", type: "flow" },
    ]);
    expect(structureEdgesFrom(plan, "plugins")).toEqual([
      { from: "plugins", to: "plugin-a", type: "multi" },
      { from: "plugins", to: "plugin-b", type: "multi" },
      { from: "plugins", to: "notes", type: "post" },
    ]);
    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "plugins", type: "flow" });
  });

  it("loads and saves overlay files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-overlay-"));
    try {
      const overlayPath = path.join(dir, "dot.plan.json");
      const overlay = {
        version: 1 as const,
        positions: { "tmux-install-apt": { x: 12, y: 34 } },
        disabled: ["tmux-install-apt"],
      };

      savePlanOverlay(overlayPath, overlay);
      const loaded = loadPlanOverlay(overlayPath);

      expect(loaded).toEqual(overlay);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies an overlay to positions and disabled nodes", () => {
    const config: Config = {
      name: "dot",
      version: "1.0",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          children: [{ id: "tmux-install-apt", label: "APT", script: "templates/tmux/install-apt.sh" }],
        },
      ],
    };

    const plan = buildInstallationPlan(config);
    const overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-overlay-"));
    try {
      const overlayPath = path.join(overlayDir, "dot.plan.json");
      fs.writeFileSync(
        overlayPath,
        JSON.stringify({
          version: 1,
          positions: { "tmux-install-apt": { x: 320, y: 180 } },
          disabled: ["tmux-install-apt"],
        })
      );

      const merged = applyPlanOverlay(plan, JSON.parse(fs.readFileSync(overlayPath, "utf-8")));
      expect(merged.nodes["tmux-install-apt"].position).toEqual({ x: 320, y: 180 });
      expect(merged.nodes["tmux-install-apt"].hidden).toBe(true);
    } finally {
      fs.rmSync(overlayDir, { recursive: true, force: true });
    }
  });

  it("builds display tree, dependency edges, and execution order", () => {
    const config: Config = {
      name: "dot",
      version: "1.0",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            { id: "tmux-header", label: "Header", script: "templates/tmux/header.sh", hidden: true },
            { id: "tmux-install-apt", label: "APT", script: "templates/tmux/install-apt.sh", deps: ["tmux-header"] },
            {
              id: "tmux-plugin-resurrect",
              label: "Resurrect",
              script: "templates/tmux/plugin-resurrect.sh",
              deps: ["tmux-install-apt"],
            },
            { id: "tmux-final-notes", label: "Notes", script: "templates/tmux/final-notes.sh", post: true },
          ],
        },
      ],
    };

    const plan = buildInstallationPlan(config);

    expect(plan.root).toBe("__root");
    expect(plan.nodes["tmux"].kind).toBe("group");
    expect(plan.nodes["tmux-final-notes"].post).toBe(true);
    expect(plan.edges).toContainEqual({ from: "__root", to: "tmux", type: "single" });
    expect(plan.edges).toContainEqual({ from: "tmux", to: "tmux-install-apt", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "tmux-install-apt", to: "tmux-plugin-resurrect", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "tmux-plugin-resurrect", to: "tmux-final-notes", type: "post" });
    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "tmux-header", type: "flow" });
    expect(plan.edges).not.toContainEqual({ from: "tmux-header", to: "tmux-install-apt", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "tmux-install-apt", to: "tmux-plugin-resurrect", type: "dependency" });
    expect(plan.execution.normalSteps.map((step) => step.id)).toEqual([
      "tmux-header",
      "tmux-install-apt",
      "tmux-plugin-resurrect",
    ]);
    expect(plan.execution.postSteps.map((step) => step.id)).toEqual(["tmux-final-notes"]);
  });

  it("keeps the real tmux flow as seven visible linear steps", () => {
    const config = loadConfig(path.resolve(import.meta.dirname, "../configs/dot.yaml"));
    const plan = buildInstallationPlan(config);
    const mainFlow = [
      "tmux-install",
      "tmux-github-mirror",
      "tmux-prefix",
      "tmux-plugins",
      "tmux-status",
      "tmux-options",
      "tmux-finalize",
    ];

    expect(plan.edges).toContainEqual({ from: "__root", to: "tmux", type: "single" });
    expect(plan.edges).toContainEqual({ from: "tmux", to: mainFlow[0], type: "flow" });
    for (let index = 0; index < mainFlow.length - 1; index += 1) {
      expect(plan.edges).toContainEqual({ from: mainFlow[index], to: mainFlow[index + 1], type: "flow" });
    }

    for (const step of mainFlow.slice(1)) {
      expect(plan.edges).not.toContainEqual({ from: "tmux", to: step, type: "flow" });
    }
    expect(structureEdgesFrom(plan, "tmux")).toEqual([{ from: "tmux", to: "tmux-install", type: "flow" }]);

    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "tmux-header", type: "flow" });
    expect(plan.edges).not.toContainEqual({ from: "tmux", to: "tmux-font-jetbrainsmono", type: "flow" });
    expect(plan.execution.postSteps.map((step) => step.id)).toEqual(
      expect.arrayContaining([
        "tmux-install-recommended",
        "tmux-tpm-finalize",
        "tmux-cleanup-sockets",
        "tmux-final-notes",
      ])
    );
  });

  it("keeps post nodes out of the visible flow spine", () => {
    const config: Config = {
      name: "dot",
      version: "1.0",
      menuMode: "single",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            { id: "install", label: "Install", script: "templates/tmux/install-apt.sh" },
            { id: "notes", label: "Notes", script: "templates/tmux/final-notes.sh", post: true },
            { id: "finalize", label: "Finalize", script: "templates/tmux/finalize.sh" },
          ],
        },
      ],
    };

    const plan = buildInstallationPlan(config);

    expect(plan.edges).toContainEqual({ from: "tmux", to: "install", type: "flow" });
    expect(plan.edges).toContainEqual({ from: "install", to: "notes", type: "post" });
    expect(plan.edges).toContainEqual({ from: "install", to: "finalize", type: "flow" });
    expect(plan.edges).not.toContainEqual({ from: "notes", to: "finalize", type: "flow" });
  });

  it("renders the plan tree from structure edges", () => {
    const config: Config = {
      name: "dot",
      version: "1.0",
      menuMode: "single",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            { id: "install", label: "Install", mode: "single", children: [{ id: "apt", label: "APT" }] },
            { id: "finalize", label: "Finalize", script: "templates/tmux/final-notes.sh", post: true },
          ],
        },
      ],
    };

    const plan = buildInstallationPlan(config);
    plan.edges.push({ from: "tmux", to: "legacy-child", type: "child" });
    plan.nodes["legacy-child"] = {
      id: "legacy-child",
      label: "Legacy child",
      kind: "action",
    };
    plan.edges.push({ from: "apt", to: "finalize", type: "dependency" });
    plan.execution.normalSteps.push({
      id: "apt",
      label: "APT",
      reason: "selected",
    });
    plan.execution.postSteps.push({
      id: "finalize",
      label: "Finalize",
      reason: "post",
      script: "templates/tmux/final-notes.sh",
    });
    plan.diagnostics.push({
      level: "warn",
      code: "example",
      message: "example diagnostic",
    });

    const tree = renderPlanTree(plan);

    expect(tree).toContain("single: tmux");
    expect(tree).toContain("flow: install");
    expect(tree).toContain("single: apt");
    expect(tree).toContain("post: finalize");
    expect(tree).not.toContain("child: legacy-child");
    expect(tree).not.toContain("Legacy child");
    expect(tree).toContain("dependency: finalize depends on: apt");
    expect(tree).toContain("1. apt (selected)");
    expect(tree).toContain("post 1. finalize");
    expect(tree).toContain("warn: example: example diagnostic");
  });
});

function structureEdgesFrom(plan: InstallationPlan, from: string): PlanEdge[] {
  return plan.edges.filter(
    (edge) => edge.from === from && (edge.type === "single" || edge.type === "multi" || edge.type === "flow" || edge.type === "post")
  );
}
