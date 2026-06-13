import { describe, it, expect } from "vitest";
import { validateConfigSemantics } from "../src/loader/loader.js";
import { ConfigSchema } from "../src/loader/schema.js";

const validConfig = {
  name: "test",
  menu: [{ id: "a", label: "A", script: "a.sh" }],
};

describe("ConfigSchema", () => {
  it("accepts minimal config", () => {
    const result = ConfigSchema.parse(validConfig);
    expect(result.name).toBe("test");
    expect(result.version).toBe("1.0");
    expect(result.output.filename).toBe("setup.sh");
    expect(result.output.dir).toBe("dist");
  });

  it("accepts full config", () => {
    const result = ConfigSchema.parse({
      name: "full",
      version: "2.0",
      description: "desc",
      output: { filename: "out.sh", dir: "build" },
      vars: { x: "1" },
      menu: [
        {
          id: "parent",
          label: "Parent",
          mode: "single",
          children: [
            { id: "child", label: "Child", script: "t.sh", deps: ["parent"], vars: { k: "v" } },
          ],
        },
      ],
    });
    expect(result.menu[0].children).toHaveLength(1);
  });

  it("accepts menu modes and hidden items", () => {
    const result = ConfigSchema.parse({
      name: "dot",
      menuMode: "single",
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            { id: "tmux-install", label: "Install", mode: "single", children: [{ id: "apt", label: "apt", script: "apt.sh" }] },
            { id: "tmux-header", label: "Header", hidden: true, prompt: { type: "key-compose", var: "custom_prefix", label: "Record key" } },
          ],
        },
      ],
    });
    expect(result.menuMode).toBe("single");
    expect(result.menu[0].mode).toBe("flow");
    expect(result.menu[0].children?.[1].hidden).toBe(true);
    expect(result.menu[0].children?.[1].prompt?.type).toBe("key-compose");
  });

  it("accepts all supported prompt types", () => {
    for (const promptType of ["key", "key-compose", "text", "number"] as const) {
      const result = ConfigSchema.parse({
        name: "dot",
        menu: [
          {
            id: `prompt-${promptType}`,
            label: "Prompt",
            prompt: { type: promptType, var: "custom_prefix", label: "Record key" },
          },
        ],
      });

      expect(result.menu[0].prompt?.type).toBe(promptType);
    }
  });

  it("rejects invalid prompt definitions", () => {
    expect(() =>
      ConfigSchema.parse({
        name: "dot",
        menu: [{ id: "prompt", label: "Prompt", prompt: { type: "unknown", var: "custom_prefix", label: "Record key" } }],
      })
    ).toThrow();
    expect(() =>
      ConfigSchema.parse({
        name: "dot",
        menu: [{ id: "prompt", label: "Prompt", prompt: { type: "key", var: "", label: "Record key" } }],
      })
    ).toThrow();
    expect(() =>
      ConfigSchema.parse({
        name: "dot",
        menu: [{ id: "prompt", label: "Prompt", prompt: { type: "key", var: "bad-name", label: "Record key" } }],
      })
    ).toThrow(/shell-safe identifier/);
    expect(() =>
      ConfigSchema.parse({
        name: "dot",
        menu: [{ id: "prompt", label: "Prompt", prompt: { type: "key", var: "custom_prefix", label: "" } }],
      })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => ConfigSchema.parse({ ...validConfig, name: "" })).toThrow();
  });

  it("rejects missing menu", () => {
    expect(() => ConfigSchema.parse({ name: "x" })).toThrow();
  });

  it("rejects empty menu", () => {
    expect(() => ConfigSchema.parse({ name: "x", menu: [] })).toThrow();
  });

  it("rejects menu item without id", () => {
    expect(() => ConfigSchema.parse({ name: "x", menu: [{ label: "no id" }] })).toThrow();
  });

  it("rejects menu item without label", () => {
    expect(() => ConfigSchema.parse({ name: "x", menu: [{ id: "a" }] })).toThrow();
  });

  it("rejects shell-unsafe menu ids", () => {
    for (const id of ["bad id", "bad.id", "bad;id", "bad[id]", "bad'id", 'bad"id']) {
      const config = ConfigSchema.parse({ name: "x", menu: [{ id, label: "Bad", script: "bad.sh" }] });
      expect(() => validateConfigSemantics(config)).toThrow(
        new RegExp(`Menu item id "${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}".*letters, digits`)
      );
    }
  });

  it("accepts shell-safe ids with leading and trailing valid characters", () => {
    const result = ConfigSchema.parse({
      name: "x",
      menu: [
        { id: "-leading", label: "Leading", script: "a.sh" },
        { id: "trailing_", label: "Trailing", script: "b.sh" },
        { id: "A_1-z", label: "Mixed", script: "c.sh" },
      ],
    });

    expect(result.menu.map((item) => item.id)).toEqual(["-leading", "trailing_", "A_1-z"]);
  });

  it("rejects generated header metadata with newlines or control characters", () => {
    for (const field of ["name", "version", "description"] as const) {
      expect(() =>
        ConfigSchema.parse({
          ...validConfig,
          [field]: `safe\nunsafe`,
        })
      ).toThrow(/Header metadata/);
    }

    expect(() => ConfigSchema.parse({ ...validConfig, description: "bad\rline" })).toThrow(
      /Header metadata/
    );
    expect(() => ConfigSchema.parse({ ...validConfig, description: "bad\u001b[31m" })).toThrow(
      /Header metadata/
    );
  });

  it("accepts normal generated header metadata", () => {
    const result = ConfigSchema.parse({
      ...validConfig,
      name: "dot 安装器",
      version: "1.0.0",
      description: "Self-contained installer",
    });

    expect(result.description).toBe("Self-contained installer");
  });

  it("default output values", () => {
    const result = ConfigSchema.parse(validConfig);
    expect(result.output).toEqual({ filename: "setup.sh", dir: "dist" });
  });

  it("default version", () => {
    const result = ConfigSchema.parse(validConfig);
    expect(result.version).toBe("1.0");
  });
});
