import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cli = path.resolve(import.meta.dirname, "../dist/index.js");
const config = path.resolve(import.meta.dirname, "../configs/tmux.yaml");
const dotConfig = path.resolve(import.meta.dirname, "../configs/dot.yaml");

function run(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf-8",
      cwd: path.resolve(import.meta.dirname, ".."),
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

describe("CLI --select", () => {
  it("selects leaf nodes", () => {
    const { stdout, exitCode } = run([
      "--config", dotConfig,
      "--select", "tmux-install-apt", "tmux-header",
      "--quiet", "--dry-run",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("#!/usr/bin/env bash");
    expect(stdout).toContain("tmux-install-apt");
    expect(stdout).toContain("tmux-header");
  });

  it("expands branch nodes to leaves", () => {
    const { stdout, exitCode } = run([
      "--config", config,
      "--select", "tmux-plugins",
      "--quiet", "--dry-run",
    ]);
    expect(exitCode).toBe(0);
    // tmux-plugins has 7 children (tpm + 6 plugins), all should be included
    expect(stdout).toContain("tmux-tpm");
    expect(stdout).toContain("tmux-plugin-resurrect");
    expect(stdout).toContain("tmux-plugin-yank");
  });

  it("auto-resolves dependencies", () => {
    const { stdout, exitCode } = run([
      "--config", config,
      "--select", "tmux-plugin-resurrect",
      "--quiet", "--dry-run",
    ]);
    expect(exitCode).toBe(0);
    // resurrect depends on tpm, which depends on tmux-header
    expect(stdout).toContain("tmux-tpm");
    expect(stdout).toContain("tmux-header");
  });

  it("errors on unknown id", () => {
    const { exitCode } = run([
      "--config", config,
      "--select", "nonexistent-node",
      "--quiet", "--dry-run",
    ]);
    expect(exitCode).toBe(1);
  });
});

describe("CLI --quiet", () => {
  it("suppresses banner in quiet mode", () => {
    const { stdout } = run([
      "--config", config,
      "--select", "tmux-install-apt", "tmux-header",
      "--quiet", "--dry-run",
    ]);
    expect(stdout).not.toContain("╔");
    expect(stdout).toContain("#!/usr/bin/env bash");
  });

  it("shows banner in non-quiet mode", () => {
    const { stdout } = run([
      "--config", config,
      "--select", "tmux-install-apt", "tmux-header",
      "--dry-run",
    ]);
    expect(stdout).toContain("╔");
  });
});

describe("CLI output path", () => {
  it("output ends with newline in --quiet --dry-run", () => {
    const { stdout } = run([
      "--config", config,
      "--select", "tmux-install-apt", "tmux-header",
      "--quiet", "--dry-run",
    ]);
    expect(stdout.endsWith("\n")).toBe(true);
  });
});


describe("CLI build", () => {
  it("generates a standalone script", () => {
    const output = path.resolve(import.meta.dirname, "../dist/test-dot.sh");
    const { exitCode } = run([
      "build",
      "--config", config,
      "--output", output,
      "--quiet",
    ]);
    expect(exitCode).toBe(0);

    const script = fs.readFileSync(output, "utf-8");
    expect(script).toContain("dot_choose_single()");
    expect(script).toContain("dot_run_flow()");
    expect(script).toContain("DOT_CHILDREN['__root']");
    expect(script).toContain('dot_main "$@"');
  });
});


describe("CLI build dot config", () => {
  it("root is the dot home screen", () => {
    const output = path.resolve(import.meta.dirname, "../dist/test-dot-root.sh");
    const { exitCode } = run([
      "build",
      "--config", dotConfig,
      "--output", output,
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    const script = fs.readFileSync(output, "utf-8");
    expect(script).toContain("DOT_TITLE='dot 安装器'");
    expect(script).toContain("DOT_CHILDREN['__root']='tmux'");
    expect(script).toContain("DOT_MODES['__root']='single'");
    expect(script).toContain("DOT_MODES['tmux']='flow'");
    expect(script).not.toContain("DOT_CHILDREN['__root']='tmux-install");
  });
});
