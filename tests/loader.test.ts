import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { loadConfig } from "../src/loader/loader.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dot-loader-test-"));
}

describe("loadConfig", () => {
  it("loads valid YAML", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({ name: "test", menu: [{ id: "a", label: "A" }] }));
    const config = loadConfig(p);
    expect(config.name).toBe("test");
    fs.rmSync(dir, { recursive: true });
  });

  it("loads valid JSON", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.json");
    fs.writeFileSync(p, JSON.stringify({ name: "json", menu: [{ id: "a", label: "A" }] }));
    const config = loadConfig(p);
    expect(config.name).toBe("json");
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on missing file", () => {
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow("not found");
  });

  it("throws on unsupported extension", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.txt");
    fs.writeFileSync(p, "name: x");
    expect(() => loadConfig(p)).toThrow("Unsupported");
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on invalid YAML content", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({ menu: [] })); // missing name
    expect(() => loadConfig(p)).toThrow();
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on duplicate ids", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({
      name: "test",
      menu: [
        { id: "a", label: "A" },
        { id: "a", label: "A2" },
      ],
    }));
    expect(() => loadConfig(p)).toThrow(/Duplicate/);
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on nested duplicate ids", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({
      name: "test",
      menu: [
        { id: "parent", label: "P", children: [{ id: "a", label: "A1" }] },
        { id: "a", label: "A2" },
      ],
    }));
    expect(() => loadConfig(p)).toThrow(/Duplicate/);
    fs.rmSync(dir, { recursive: true });
  });

  it("throws on unknown dep", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({
      name: "test",
      menu: [{ id: "a", label: "A", deps: ["nonexistent"] }],
    }));
    expect(() => loadConfig(p)).toThrow(/unknown item/);
    fs.rmSync(dir, { recursive: true });
  });

  it("throws when non-post depends on post item", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({
      name: "test",
      menu: [
        { id: "a", label: "A", deps: ["b"] },
        { id: "b", label: "B", post: true },
      ],
    }));
    expect(() => loadConfig(p)).toThrow(/post/);
    fs.rmSync(dir, { recursive: true });
  });

  it("allows post depending on non-post", () => {
    const dir = tmpDir();
    const p = path.join(dir, "config.yaml");
    fs.writeFileSync(p, yaml.dump({
      name: "test",
      menu: [
        { id: "a", label: "A" },
        { id: "b", label: "B", post: true, deps: ["a"] },
      ],
    }));
    const config = loadConfig(p);
    expect(config.menu).toHaveLength(2);
    fs.rmSync(dir, { recursive: true });
  });
});
