import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/loader/loader.js";
import type { Config } from "../src/loader/schema.js";
import {
  applyPlanOverlay,
  loadPlanOverlay,
  mergePlanOverlay,
  parsePlanOverlayPayload,
  PlanOverlayValidationError,
  savePlanOverlay,
} from "../src/planner/overlay.js";
import { buildInstallationPlan, resolveInstallationPlan } from "../src/planner/index.js";
import { renderPlanTree } from "../src/planner/render-tree.js";
import type { InstallationPlan, PlanEdge } from "../src/planner/types.js";
import { startStudio } from "../src/studio/server.js";

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

  it("rejects unsafe overlay field types at the file boundary", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-overlay-"));
    try {
      const overlayPath = path.join(dir, "dot.plan.json");
      fs.writeFileSync(
        overlayPath,
        JSON.stringify({
          version: 1,
          overrides: {
            "tmux-install-apt": {
              label: ["not", "a", "label"],
              mode: "shell",
            },
          },
        })
      );

      expect(() => loadPlanOverlay(overlayPath)).toThrow(/Invalid plan overlay/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates Studio overlay API payloads before merge", () => {
    expect(() => parsePlanOverlayPayload({})).toThrow(PlanOverlayValidationError);
    expect(() => parsePlanOverlayPayload({ patch: { version: 1, positions: { tmux: { x: Number.POSITIVE_INFINITY, y: 0 } } } }))
      .toThrow(/Invalid plan overlay patch/);
    expect(parsePlanOverlayPayload({ patch: { version: 1, disabled: ["tmux"] } })).toEqual({
      version: 1,
      disabled: ["tmux"],
    });
  });

  it("merges Studio overlay API patches without mutating the current overlay", () => {
    const current = {
      version: 1 as const,
      positions: {
        tmux: { x: 10, y: 20 },
      },
      disabled: ["tmux-prefix", "tmux-status"],
      overrides: {
        "tmux-prefix": { hidden: false },
      },
    };
    const patch = {
      version: 1 as const,
      positions: {
        tmux: { x: 30, y: 40 },
        "tmux-options": { x: 50, y: 60 },
      },
      disabled: ["tmux-status", "tmux-options"],
      overrides: {
        "tmux-options": { label: "Options", hidden: false },
      },
    };

    const merged = mergePlanOverlay(current, patch);

    expect(merged).toEqual({
      version: 1,
      positions: {
        tmux: { x: 30, y: 40 },
        "tmux-options": { x: 50, y: 60 },
      },
      disabled: ["tmux-prefix", "tmux-status", "tmux-options"],
      overrides: {
        "tmux-prefix": { hidden: false },
        "tmux-options": { label: "Options", hidden: false },
      },
    });
    expect(current.positions.tmux).toEqual({ x: 10, y: 20 });
    expect(current.disabled).toEqual(["tmux-prefix", "tmux-status"]);
    expect(current.overrides["tmux-prefix"]).toEqual({ hidden: false });
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

  it("resolves configs through the overlay-applied plan source of truth", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-resolve-plan-"));
    try {
      const configPath = path.join(dir, "config.yaml");
      fs.writeFileSync(path.join(dir, "setup.sh"), "echo setup\n");
      fs.writeFileSync(
        configPath,
        [
          'name: "Resolved plan"',
          'version: "1.0"',
          "menu:",
          '  - id: "feature"',
          '    label: "Feature"',
          '    description: "Original description"',
          '    script: "setup.sh"',
          "",
        ].join("\n")
      );
      fs.writeFileSync(
        path.join(dir, "config.plan.json"),
        JSON.stringify({
          version: 1,
          positions: { feature: { x: 42, y: 84 } },
          disabled: ["feature"],
          overrides: {
            feature: {
              label: "Feature from overlay",
              description: "Overlay description",
              hidden: false,
              mode: "flow",
              script: "missing.sh",
            },
          },
        })
      );

      const resolved = resolveInstallationPlan(configPath);
      const feature = resolved.allNodes.get("feature");

      expect(resolved.loadedConfig.menu[0].label).toBe("Feature");
      expect(feature?.label).toBe("Feature from overlay");
      expect(feature?.description).toBe("Overlay description");
      expect(feature?.hidden).toBe(true);
      expect(feature?.script).toBe("setup.sh");
      expect(resolved.plan.nodes.feature).toEqual(
        expect.objectContaining({
          label: "Feature from overlay",
          description: "Overlay description",
          hidden: true,
          mode: "flow",
          position: { x: 42, y: 84 },
          script: "setup.sh",
        })
      );
      expect(resolved.diagnostics).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
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

  it("handles invalid and valid Studio plan overlay API writes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-studio-api-"));
    const configPath = path.join(dir, "dot.yaml");
    fs.writeFileSync(
      configPath,
      [
        "name: dot",
        "version: '1.0'",
        "menu:",
        "  - id: tmux",
        "    label: Tmux",
        "    children:",
        "      - id: tmux-install-apt",
        "        label: APT",
        "        script: templates/tmux/install-apt.sh",
        "",
      ].join("\n")
    );

    const server = await startStudio({ configPath, port: 0 });
    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const invalidJson = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: "{",
      });
      expect(invalidJson.status).toBe(400);
      await expect(invalidJson.json()).resolves.toMatchObject({
        error: { code: "invalid_json" },
      });

      const oversized = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: JSON.stringify({ patch: { version: 1, disabled: ["x".repeat(256 * 1024)] } }),
      });
      expect(oversized.status).toBe(413);
      await expect(oversized.json()).resolves.toMatchObject({
        error: { code: "body_too_large" },
      });

      const missingPatch = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      expect(missingPatch.status).toBe(400);
      await expect(missingPatch.json()).resolves.toMatchObject({
        error: { code: "missing_patch" },
      });

      const invalidOverlay = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: JSON.stringify({ patch: { version: 1, positions: { "tmux-install-apt": { x: "left", y: 0 } } } }),
      });
      expect(invalidOverlay.status).toBe(422);
      await expect(invalidOverlay.json()).resolves.toMatchObject({
        error: { code: "invalid_overlay" },
      });

      const validPatch = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: JSON.stringify({
          patch: {
            version: 1,
            positions: { "tmux-install-apt": { x: 320, y: 180 } },
            disabled: ["tmux-install-apt"],
          },
        }),
      });
      expect(validPatch.status).toBe(204);

      const plan = await fetch(`${baseUrl}/api/plan`);
      expect(await plan.json()).toMatchObject({
        nodes: {
          "tmux-install-apt": {
            position: { x: 320, y: 180 },
            hidden: true,
          },
        },
      });
      expect(JSON.parse(fs.readFileSync(path.join(dir, "dot.plan.json"), "utf-8"))).toEqual({
        version: 1,
        positions: { "tmux-install-apt": { x: 320, y: 180 } },
        disabled: ["tmux-install-apt"],
      });
    } finally {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps Studio plan state unchanged when overlay save fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-studio-save-failure-"));
    const configPath = path.join(dir, "dot.yaml");
    fs.writeFileSync(
      configPath,
      [
        "name: dot",
        "version: '1.0'",
        "menu:",
        "  - id: tmux-install-apt",
        "    label: APT",
        "    script: templates/tmux/install-apt.sh",
        "",
      ].join("\n")
    );

    const server = await startStudio({ configPath, port: 0 });
    fs.mkdirSync(path.join(dir, "dot.plan.json"));
    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const response = await fetch(`${baseUrl}/api/plan`, {
        method: "PUT",
        body: JSON.stringify({
          patch: {
            version: 1,
            disabled: ["tmux-install-apt"],
          },
        }),
      });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "save_failed" },
      });

      const plan = await fetch(`${baseUrl}/api/plan`);
      const planJson = await plan.json();
      expect(planJson.nodes["tmux-install-apt"].hidden).toBeUndefined();
    } finally {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
