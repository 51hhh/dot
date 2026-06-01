import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../src/generator/assembler.js";
import { assembleStandalone, bashFunctionNameForId } from "../src/generator/standalone-assembler.js";
import { loadConfig } from "../src/loader/loader.js";
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

function withoutEntrypoint(script: string): string {
  return script.replace(/\ndot_main "\$@"\n$/, "\n");
}

function runGeneratedBash(dir: string, script: string, command: string, input = "") {
  const scriptPath = path.join(dir, "generated.sh");
  fs.writeFileSync(scriptPath, withoutEntrypoint(script));

  return spawnSync(
    "bash",
    [
      "-lc",
      `source "$GENERATED_DOT_SCRIPT"
trap - EXIT INT TERM
${command}`,
    ],
    {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, GENERATED_DOT_SCRIPT: scriptPath },
      input,
      timeout: 5000,
    }
  );
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

  it("serializes flow modes and hidden items", () => {
    const dir = tmpDir();
    const headerPath = writeTmpFile(dir, "header.sh", "echo header");
    const aptPath = writeTmpFile(dir, "apt.sh", "echo apt");
    const config: Config = {
      name: "dot",
      version: "1.0",
      menuMode: "single",
      output: { filename: "dot.sh", dir },
      menu: [
        {
          id: "tmux",
          label: "Tmux",
          mode: "flow",
          children: [
            {
              id: "tmux-install",
              label: "Install",
              mode: "single",
              children: [{ id: "tmux-install-apt", label: "apt", script: aptPath, deps: ["tmux-header"] }],
            },
            { id: "tmux-header", label: "Header", script: headerPath, hidden: true },
          ],
        },
      ],
    };

    const result = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
    expect(result).toContain("DOT_MODES['__root']='single'");
    expect(result).toContain("DOT_MODES['tmux']='flow'");
    expect(result).toContain("DOT_MODES['tmux-install']='single'");
    expect(result).toContain("DOT_MODES['tmux-header']='flow'");
    expect(result).toContain("DOT_HIDDEN['tmux-header']='1'");
    expect(result).toContain("DOT_CHILDREN['__root']='tmux'");
    expect(result).toContain("DOT_CHILDREN['tmux']='tmux-install tmux-header'");
    expect(result).toContain("DOT_SNIPPET_FUNCS['tmux-header']");

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
    expect(result).toContain("dot_choose_single()");
    expect(result).toContain("dot_run_flow()");
    expect(result).toContain("dot_sudo()");
    expect(result).toContain("${EUID:-$(id -u)}");
    expect(result).toContain("dot_download_with_fallback()");
    expect(result).toContain("dot_git_clone_with_fallback()");
    expect(result).toContain("DOT_GITHUB_MIRRORS");
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

  it("treats b and terminal left-arrow variants as back in single menus", () => {
    const dir = tmpDir();

    try {
      const childPath = writeTmpFile(dir, "child.sh", "echo child");
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "parent",
            label: "Parent",
            mode: "single",
            children: [{ id: "child", label: "Child", script: childPath }],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      const cases = ["b", "B", "\u001b[D", "\u001bOD", "\u001b[1;5D"];

      for (const input of cases) {
        const result = runGeneratedBash(
          dir,
          generated,
          'dot_choose_single parent "Parent" >/dev/null; printf "status=%s\\n" "$?"',
          input
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("status=2");
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns to the previous interactive step when back is pressed inside a flow", () => {
    const dir = tmpDir();

    try {
      const config: Config = {
        name: "dot",
        version: "1.0",
        menuMode: "single",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "tmux",
            label: "Tmux",
            mode: "flow",
            children: [
              {
                id: "tmux-install",
                label: "Install",
                mode: "single",
                children: [{ id: "tmux-install-apt", label: "apt" }],
              },
              { id: "tmux-github-mirror", label: "Mirror" },
              {
                id: "tmux-prefix",
                label: "Prefix",
                mode: "single",
                children: [{ id: "tmux-prefix-ctrl-a", label: "Ctrl+A" }],
              },
            ],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      const result = runGeneratedBash(
        dir,
        generated,
        'dot_run_flow tmux; printf "status=%s selected=%s\\n" "$?" "${DOT_SELECTED[tmux-install-apt]:-0}"',
        "\n\u001b[D\n\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0 selected=1");
      expect(result.stdout.match(/步骤 1\/3: Install/g)).toHaveLength(2);
      expect(result.stdout).not.toContain("步骤 2/3: Mirror");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates endFlow from a leaf to the whole flow", () => {
    const dir = tmpDir();

    try {
      const config: Config = {
        name: "dot",
        version: "1.0",
        menuMode: "single",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "tmux",
            label: "Tmux",
            mode: "flow",
            children: [
              {
                id: "tmux-install",
                label: "Install",
                mode: "single",
                children: [
                  {
                    id: "tmux-install-recommended",
                    label: "Recommended",
                    endFlow: true,
                  },
                ],
              },
              {
                id: "tmux-later",
                label: "Later",
                mode: "single",
                children: [{ id: "tmux-later-choice", label: "Later choice" }],
              },
            ],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      const result = runGeneratedBash(
        dir,
        generated,
        'dot_run_flow tmux; printf "status=%s recommended=%s later=%s\\n" "$?" "${DOT_SELECTED[tmux-install-recommended]:-0}" "${DOT_SELECTED[tmux-later-choice]:-0}"',
        "\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=3 recommended=1 later=0");
      expect(result.stdout).not.toContain("步骤 2/2: Later");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("auto-selects direct flow action steps into the execution plan", () => {
    const dir = tmpDir();

    try {
      const actionPath = writeTmpFile(dir, "action.sh", "echo action");
      const choicePath = writeTmpFile(dir, "choice.sh", "echo choice");
      const config: Config = {
        name: "dot",
        version: "1.0",
        menuMode: "single",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "flow",
            label: "Flow",
            mode: "flow",
            children: [
              { id: "direct-action", label: "Direct action", script: actionPath },
              {
                id: "choice",
                label: "Choice",
                mode: "single",
                children: [{ id: "choice-a", label: "Choice A", script: choicePath }],
              },
            ],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      const result = runGeneratedBash(
        dir,
        generated,
        'dot_run_flow flow; status=$?; dot_build_plan; printf "status=%s direct=%s choice=%s plan=%s\\n" "$status" "${DOT_SELECTED[direct-action]:-0}" "${DOT_SELECTED[choice-a]:-0}" "${DOT_PLAN[*]}"',
        "\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0 direct=1 choice=1");
      expect(result.stdout).toContain("plan=direct-action choice-a");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds a runtime execution plan for the real tmux flow action", () => {
    const configPath = path.resolve(import.meta.dirname, "../configs/dot.yaml");
    const config = loadConfig(configPath);
    const dir = tmpDir();

    try {
      const generated = assembleStandalone({ config, configPath });
      const result = runGeneratedBash(
        dir,
        generated,
        'dot_run_flow tmux; status=$?; dot_build_plan; printf "status=%s mirror=%s plan=%s\\n" "$status" "${DOT_SELECTED[tmux-github-mirror]:-0}" "${DOT_PLAN[*]}"',
        "\n\n\n\n\n\n\n\n\n\n\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0 mirror=1");
      expect(result.stdout).toContain("tmux-github-mirror");
      expect(result.stdout).toMatch(/plan=.*tmux-install-apt.*tmux-github-mirror.*tmux-prefix-ctrl-a.*tmux-status-minimal/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs compose prompt under nounset and feeds prompted value to snippet", () => {
    const dir = tmpDir();

    try {
      const scriptPath = writeTmpFile(dir, "prefix.sh", "echo prefix={{custom_prefix:C-x}}");
      const config: Config = {
        name: "dot",
        version: "1.0",
        menuMode: "single",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "tmux",
            label: "Tmux",
            mode: "flow",
            children: [
              {
                id: "tmux-prefix",
                label: "Prefix",
                mode: "single",
                children: [
                  {
                    id: "tmux-prefix-compose",
                    label: "Custom",
                    script: scriptPath,
                    vars: { custom_prefix: "C-x" },
                    prompt: { type: "key-compose", var: "custom_prefix", label: "Record prefix" },
                  },
                ],
              },
            ],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expect(generated).toMatch(/\ndot_main "\$@"\n$/);
      expect(generated).toContain("dot_record_key_prompt()");
      expect(generated).toContain("dot_compose_tmux_key_prompt()");
      expect(generated).toContain("DOT_PROMPT_TYPES['tmux-prefix-compose']='key-compose'");
      expect(generated).toContain("DOT_PROMPT_VARS['tmux-prefix-compose']='custom_prefix'");
      expect(generated).toContain("DOT_PROMPT_LABELS['tmux-prefix-compose']='Record prefix'");
      expect(generated).toContain('key-compose)');
      expect(generated).toContain('dot_compose_tmux_key_prompt "$choice"');
      expect(generated).toContain("${DOT_VARS[custom_prefix]:-C-x}");
      expect(generated).toContain("prefix=${DOT_VARS[custom_prefix]:-C-x}");

      const result = runGeneratedBash(
        dir,
        generated,
        'dot_run_flow tmux; status=$?; printf "status=%s selected=%s var=%s\\n" "$status" "${DOT_SELECTED[tmux-prefix-compose]:-0}" "${DOT_VARS[custom_prefix]:-}"',
        "\n\n\n\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0 selected=1 var=C-a");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("orders GitHub mirrors with the selected prefix first", () => {
    const dir = tmpDir();

    try {
      const scriptPath = writeTmpFile(dir, "noop.sh", "echo ok");
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [{ id: "noop", label: "Noop", script: scriptPath }],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") }).replace(
        /\ndot_main "\$@"\n$/,
        "\n"
      );
      expect(generated).toContain('if [[ -n "${DOT_GITHUB_SELECTED_PREFIX:-}" ]]; then');
      expect(generated).toContain('ordered+=("$DOT_GITHUB_SELECTED_PREFIX")');
      expect(generated).toContain("printf '%s");
      expect(generated).toContain('"${ordered[@]}"');
      expect(generated).toContain("printf '%s%s' \"$prefix\" \"$url\"");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});
