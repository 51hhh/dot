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
});
