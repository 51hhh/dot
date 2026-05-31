import { describe, it, expect } from "vitest";
import { ConfigSchema } from "../src/loader/schema.js";

const validConfig = {
  name: "test",
  menu: [{ id: "a", label: "A" }],
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
            { id: "tmux-install", label: "Install", mode: "single", children: [{ id: "apt", label: "apt" }] },
            { id: "tmux-header", label: "Header", hidden: true },
          ],
        },
      ],
    });
    expect(result.menuMode).toBe("single");
    expect(result.menu[0].mode).toBe("flow");
    expect(result.menu[0].children?.[1].hidden).toBe(true);
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

  it("default output values", () => {
    const result = ConfigSchema.parse(validConfig);
    expect(result.output).toEqual({ filename: "setup.sh", dir: "dist" });
  });

  it("default version", () => {
    const result = ConfigSchema.parse(validConfig);
    expect(result.version).toBe("1.0");
  });
});
