import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../src/generator/assembler.js";
import { assembleStandalone, bashFunctionNameForId } from "../src/generator/standalone-assembler.js";
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

  it("escapes special chars in global vars", () => {
    const dir = tmpDir();
    writeTmpFile(dir, "t.sh", 'echo "{{x}}"');

    const config: Config = {
      name: "T",
      version: "1.0",
      vars: { x: 'he said "hi" and $HOME' },
      output: { filename: "o.sh", dir },
      menu: [{ id: "a", label: "A", script: path.join(dir, "t.sh") }],
    };

    const result = assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a"]) });
    expect(result).toContain('x="he said \\"hi\\" and \\$HOME"');

    fs.rmSync(dir, { recursive: true });
  });
});


describe("assembleStandalone", () => {
  it("generates a self-contained interactive bash script", () => {
    const dir = tmpDir();
    const scriptPath = writeTmpFile(dir, "a.sh", "echo standalone");

    const config: Config = {
      name: "Standalone",
      version: "1.0",
      output: { filename: "dot.sh", dir },
      menu: [{ id: "a", label: "A", script: scriptPath }],
    };

    const result = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
    expect(result).toContain("#!/usr/bin/env bash");
    expect(result).toContain("dot_navigate()");
    expect(result).toContain("DOT_CHILDREN['__root']='a'");
    expect(result).toContain("echo standalone");
    expect(result).toContain('dot_main "$@"');

    fs.rmSync(dir, { recursive: true });
  });

  it("generates shell-safe function names", () => {
    const name = bashFunctionNameForId("tmux-plugin-yank");
    expect(name).toMatch(/^dot_run_tmux_plugin_yank_[a-z0-9]+$/);
    expect(name).not.toContain("-");
  });

  it("rejects ids that cannot be serialized safely", () => {
    const dir = tmpDir();
    const scriptPath = writeTmpFile(dir, "a.sh", "echo bad");
    const config: Config = {
      name: "Bad",
      version: "1.0",
      output: { filename: "dot.sh", dir },
      menu: [{ id: "bad.id", label: "Bad", script: scriptPath }],
    };

    expect(() => assembleStandalone({ config, configPath: path.join(dir, "config.yaml") })).toThrow("not shell-safe");

    fs.rmSync(dir, { recursive: true });
  });
});
