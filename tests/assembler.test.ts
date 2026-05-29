import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../src/generator/assembler.js";
import type { Config } from "../src/loader/schema.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dot-test-"));
}

function writeTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

describe("assemble", () => {
  it("generates header and footer", () => {
    const dir = tmpDir();
    const scriptPath = writeTmpFile(dir, "a.sh", 'echo "hello"');

    const config: Config = {
      name: "Test",
      version: "1.0",
      output: { filename: "out.sh", dir },
      menu: [{ id: "a", label: "A", script: scriptPath }],
    };

    const result = assemble({ config, configPath: path.join(dir, "config.yaml"), selectedIds: new Set(["a"]) });
    expect(result).toContain("#!/usr/bin/env bash");
    expect(result).toContain("Test v1.0");
    expect(result).toContain('echo "hello"');
    expect(result).toContain("配置完成");

    fs.rmSync(dir, { recursive: true });
  });

  it("respects dependency order", () => {
    const dir = tmpDir();
    writeTmpFile(dir, "a.sh", 'echo "a"');
    writeTmpFile(dir, "b.sh", 'echo "b"');

    const config: Config = {
      name: "T",
      version: "1.0",
      output: { filename: "o.sh", dir },
      menu: [
        { id: "a", label: "A", script: path.join(dir, "a.sh"), deps: ["b"] },
        { id: "b", label: "B", script: path.join(dir, "b.sh") },
      ],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a", "b"]) });
    const idxB = result.indexOf('echo "b"');
    const idxA = result.indexOf('echo "a"');
    expect(idxB).toBeLessThan(idxA);

    fs.rmSync(dir, { recursive: true });
  });

  it("post nodes come last", () => {
    const dir = tmpDir();
    writeTmpFile(dir, "a.sh", 'echo "a"');
    writeTmpFile(dir, "post.sh", 'echo "post"');

    const config: Config = {
      name: "T",
      version: "1.0",
      output: { filename: "o.sh", dir },
      menu: [
        { id: "a", label: "A", script: path.join(dir, "a.sh") },
        { id: "post", label: "Post", script: path.join(dir, "post.sh"), post: true },
      ],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a", "post"]) });
    const idxA = result.indexOf('echo "a"');
    const idxPost = result.indexOf('echo "post"');
    expect(idxA).toBeLessThan(idxPost);

    fs.rmSync(dir, { recursive: true });
  });

  it("template vars are replaced", () => {
    const dir = tmpDir();
    writeTmpFile(dir, "t.sh", 'echo "{{msg:hi}}"');

    const config: Config = {
      name: "T",
      version: "1.0",
      vars: { msg: "hello" },
      output: { filename: "o.sh", dir },
      menu: [{ id: "a", label: "A", script: path.join(dir, "t.sh") }],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a"]) });
    expect(result).toContain('echo "hello"');

    fs.rmSync(dir, { recursive: true });
  });

  it("node vars override global vars", () => {
    const dir = tmpDir();
    writeTmpFile(dir, "t.sh", 'echo "{{x}}"');

    const config: Config = {
      name: "T",
      version: "1.0",
      vars: { x: "global" },
      output: { filename: "o.sh", dir },
      menu: [{ id: "a", label: "A", script: path.join(dir, "t.sh"), vars: { x: "local" } }],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a"]) });
    expect(result).toContain('echo "local"');

    fs.rmSync(dir, { recursive: true });
  });

  it("skips nodes without script", () => {
    const dir = tmpDir();

    const config: Config = {
      name: "T",
      version: "1.0",
      output: { filename: "o.sh", dir },
      menu: [{ id: "branch", label: "Branch" }],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["branch"]) });
    expect(result).toContain("#!/usr/bin/env bash");
    expect(result).not.toContain("# ─── Branch");

    fs.rmSync(dir, { recursive: true });
  });
});
