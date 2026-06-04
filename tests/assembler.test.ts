import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../src/generator/assembler.js";
import { serializeStandaloneData } from "../src/generator/standalone/data.js";
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
      env: { ...process.env, GENERATED_DOT_SCRIPT: scriptPath, DOT_INPUT_FD: "0" },
      input,
      timeout: 5000,
    }
  );
}

function expectBashSyntaxValid(script: string) {
  const result = spawnSync("bash", ["-n"], {
    encoding: "utf-8",
    input: script,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Generated bash syntax check failed");
  }
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

  it("rejects template paths outside the config directory or sibling templates root", () => {
    const dir = tmpDir();
    const secretDir = tmpDir();
    const secretPath = writeTmpFile(secretDir, "secret.sh", "echo secret");

    try {
      const config: Config = {
        name: "T",
        version: "1.0",
        output: { filename: "o.sh", dir },
        menu: [{ id: "a", label: "A", script: secretPath }],
      };

      expect(() =>
        assemble({ config, configPath: path.join(dir, "c.yaml"), selectedIds: new Set(["a"]) })
      ).toThrow(/Template path rejected/);
      expect(() => assembleStandalone({ config, configPath: path.join(dir, "c.yaml") })).toThrow(
        /Template path rejected/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(secretDir, { recursive: true, force: true });
    }
  });

  it("allows template paths under the config directory", () => {
    const dir = tmpDir();
    const scriptPath = writeTmpFile(dir, "local.sh", "echo local");

    try {
      const config: Config = {
        name: "T",
        version: "1.0",
        output: { filename: "o.sh", dir },
        menu: [{ id: "a", label: "A", script: scriptPath }],
      };

      const result = assembleStandalone({ config, configPath: path.join(dir, "c.yaml") });
      expect(result).toContain("echo local");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
  it("serializes standalone menu data independently", () => {
    const child: Config["menu"][number] = {
      id: "child",
      label: "Child",
      description: "Child description",
      script: "child.sh",
      deps: ["dependency"],
      prompt: { type: "key", var: "prefix", label: "Record prefix" },
      endFlow: true,
    };
    const dependency: Config["menu"][number] = {
      id: "dependency",
      label: "Dependency",
      script: "dependency.sh",
      hidden: true,
      post: true,
    };
    const parent: Config["menu"][number] = {
      id: "parent",
      label: "Parent",
      mode: "single",
      children: [child, dependency],
    };
    const config: Config = {
      name: "Standalone Data",
      version: "1.0",
      menuMode: "flow",
      output: { filename: "dot.sh", dir: "." },
      menu: [parent],
    };
    const allNodes = new Map([
      ["parent", parent],
      ["child", child],
      ["dependency", dependency],
    ]);
    const snippetFunctions = new Map([
      ["child", "dot_run_child_abc"],
      ["dependency", "dot_run_dependency_def"],
    ]);

    const result = serializeStandaloneData({ config, allNodes, snippetFunctions });

    expect(result).toContain("DOT_TITLE='Standalone Data'");
    expect(result).toContain("DOT_CHILDREN['__root']='parent'");
    expect(result).toContain("DOT_MODES['parent']='single'");
    expect(result).toContain("DOT_DEPS['child']='dependency'");
    expect(result).toContain("DOT_PROMPT_TYPES['child']='key'");
    expect(result).toContain("DOT_PROMPT_VARS['child']='prefix'");
    expect(result).toContain("DOT_PROMPT_LABELS['child']='Record prefix'");
    expect(result).toContain("DOT_END_FLOW['child']='1'");
    expect(result).toContain("DOT_HIDDEN['dependency']='1'");
    expect(result).toContain("DOT_POST['dependency']='1'");
    expect(result).toContain("DOT_SNIPPET_FUNCS['child']='dot_run_child_abc'");
  });

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
    expect(result).toContain("dot_warn_github_mirror_trust()");
    expect(result).toContain("DOT_GITHUB_MIRROR_TRUST_WARNED=0");
    expect(result).toContain("第三方镜像会成为下载/克隆内容的信任来源");
    expect(result).toContain("DOT_CHILDREN['__root']='a'");
    expect(result).toContain("echo standalone");
    expect(result).toContain('dot_main "$@"');
    expectBashSyntaxValid(result);

    fs.rmSync(dir, { recursive: true });
  });

  it("keeps normal header metadata readable and shell-safe", () => {
    const dir = tmpDir();
    const scriptPath = writeTmpFile(dir, "a.sh", "echo standalone");

    try {
      const config: Config = {
        name: "dot 安装器",
        version: "1.0",
        description: "Self-contained installer",
        output: { filename: "dot.sh", dir },
        menu: [{ id: "a", label: "A", script: scriptPath }],
      };

      const result = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expect(result).toContain("#  dot 安装器 v1.0");
      expect(result).toContain("#  Self-contained installer");
      expectBashSyntaxValid(result);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      const scriptPath = writeTmpFile(dir, "prefix.sh", 'CUSTOM_PREFIX="{{custom_prefix:C-x}}"\necho "prefix=$CUSTOM_PREFIX"');
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
      expect(generated).toContain("$(dot_get_var_or_default 'custom_prefix' 'C-x')");
      expect(generated).toContain('CUSTOM_PREFIX="$(dot_get_var_or_default');

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

  it("reads text prompts through the configured runtime input fd", () => {
    const dir = tmpDir();

    try {
      const scriptPath = writeTmpFile(dir, "name.sh", 'USER_NAME="{{user_name:default}}"\nprintf "name=%s\\n" "$USER_NAME"');
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [{
          id: "name",
          label: "Name",
          script: scriptPath,
          prompt: { type: "text", var: "user_name", label: "Name" },
        }],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expect(generated).toContain("DOT_INPUT_SRC=\"fd:${DOT_INPUT_FD}\"");
      expect(generated).toContain("dot_read_line()");
      expect(generated).toContain("dot_read_line value || return 1");

      const result = runGeneratedBash(
        dir,
        generated,
        'dot_text_input_prompt name; status=$?; printf "status=%s var=%s\\n" "$status" "${DOT_VARS[user_name]:-}"',
        "alice\n"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0 var=alice");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes guarded Oh My Zsh source lines in zshrc snippets", () => {
    const configPath = path.resolve(import.meta.dirname, "../configs/dot.yaml");
    const config = loadConfig(configPath);
    const dir = tmpDir();
    const home = path.join(dir, "home");

    try {
      fs.mkdirSync(home, { recursive: true });
      const generated = assembleStandalone({ config, configPath });
      const scriptPath = path.join(dir, "generated.sh");
      fs.writeFileSync(scriptPath, withoutEntrypoint(generated));

      const minimalFunc = bashFunctionNameForId("zsh-zshrc-minimal");
      const result = spawnSync(
        "bash",
        [
          "-lc",
          `source "$GENERATED_DOT_SCRIPT"
trap - EXIT INT TERM
${minimalFunc}; printf "status=%s\\n" "$?"`,
        ],
        {
          cwd: dir,
          encoding: "utf-8",
          env: { ...process.env, GENERATED_DOT_SCRIPT: scriptPath, HOME: home, DOT_INPUT_FD: "0" },
          timeout: 5000,
        }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0");

      const zshrc = fs.readFileSync(path.join(home, ".zshrc"), "utf-8");
      expect(zshrc).toContain('[[ -f "$ZSH/oh-my-zsh.sh" ]] && source "$ZSH/oh-my-zsh.sh"');
      expect(zshrc).not.toContain('\nsource "$ZSH/oh-my-zsh.sh"\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads zsh apt removal confirmation through the configured runtime input fd", () => {
    const configPath = path.resolve(import.meta.dirname, "../configs/dot.yaml");
    const config = loadConfig(configPath);
    const dir = tmpDir();
    const binDir = path.join(dir, "bin");
    const aptLog = path.join(dir, "apt.log");

    try {
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, "apt-get"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${aptLog}"\n`);
      fs.chmodSync(path.join(binDir, "apt-get"), 0o755);

      const generated = assembleStandalone({ config, configPath });
      fs.writeFileSync(path.join(dir, "generated.sh"), withoutEntrypoint(generated));
      const uninstallFunc = bashFunctionNameForId("zsh-uninstall-apt-remove");
      const result = spawnSync(
        "bash",
        [
          "-lc",
          `source "$GENERATED_DOT_SCRIPT"
trap - EXIT INT TERM
dot_sudo() { "$@"; }
${uninstallFunc}; printf "status=%s\\n" "$?"`,
        ],
        {
          cwd: dir,
          encoding: "utf-8",
          env: {
            ...process.env,
            GENERATED_DOT_SCRIPT: path.join(dir, "generated.sh"),
            DOT_INPUT_FD: "0",
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
            SHELL: "/bin/bash",
            USER: "dot-test-user",
            SUDO_USER: "",
          },
          input: "REMOVE_ZSH\n",
          timeout: 5000,
        }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status=0");
      expect(fs.readFileSync(aptLog, "utf-8")).toContain("remove -y zsh");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads SSH risk confirmations through the configured runtime input fd", () => {
    const configPath = path.resolve(import.meta.dirname, "../configs/dot.yaml");
    const config = loadConfig(configPath);
    const dir = tmpDir();
    const home = path.join(dir, "home");

    try {
      fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
      fs.writeFileSync(path.join(home, ".ssh", "authorized_keys"), "ssh-ed25519 AAAATEST dot-test\n");

      const generated = assembleStandalone({ config, configPath });
      const scriptPath = path.join(dir, "generated.sh");
      fs.writeFileSync(scriptPath, withoutEntrypoint(generated));

      const disablePasswordFunc = bashFunctionNameForId("ssh-disable-password");
      const disablePasswordResult = spawnSync(
        "bash",
        [
          "-lc",
          `source "$GENERATED_DOT_SCRIPT"
trap - EXIT INT TERM
${disablePasswordFunc}; printf "status=%s\\n" "$?"`,
        ],
        {
          cwd: dir,
          encoding: "utf-8",
          env: {
            ...process.env,
            GENERATED_DOT_SCRIPT: scriptPath,
            DOT_INPUT_FD: "0",
            HOME: home,
            SHELL: "/bin/bash",
            USER: "dot-test-user",
            SUDO_USER: "",
          },
          input: "skip\n",
          timeout: 5000,
        }
      );

      expect(disablePasswordResult.status).toBe(0);
      expect(disablePasswordResult.stdout).toContain("status=0");
      expect(disablePasswordResult.stdout).toContain("未确认禁止密码登录，已跳过。");

      const limitUsersFunc = bashFunctionNameForId("ssh-limit-users");
      const limitUsersResult = spawnSync(
        "bash",
        [
          "-lc",
          `source "$GENERATED_DOT_SCRIPT"
trap - EXIT INT TERM
DOT_VARS[allowed_users]='otheruser'
${limitUsersFunc}; printf "status=%s\\n" "$?"`,
        ],
        {
          cwd: dir,
          encoding: "utf-8",
          env: {
            ...process.env,
            GENERATED_DOT_SCRIPT: scriptPath,
            DOT_INPUT_FD: "0",
            HOME: home,
            SHELL: "/bin/bash",
            USER: "dot-test-user",
            SUDO_USER: "",
          },
          input: "skip\n",
          timeout: 5000,
        }
      );

      expect(limitUsersResult.status).toBe(0);
      expect(limitUsersResult.stdout).toContain("status=0");
      expect(limitUsersResult.stdout).toContain("未确认 AllowUsers 锁定风险，已跳过。");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats prompt fallback values as data instead of shell syntax", () => {
    const dir = tmpDir();

    try {
      const markerPath = path.join(dir, "prompt-injection-marker");
      const scriptPath = writeTmpFile(
        dir,
        "prefix.sh",
        `CUSTOM_PREFIX="{{custom_prefix:C-x;$(touch ${markerPath})}}"\nprintf 'prefix=<%s>\\n' "$CUSTOM_PREFIX"`
      );
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [{
          id: "prefix",
          label: "Prefix",
          script: scriptPath,
          prompt: { type: "text", var: "custom_prefix", label: "Prefix" },
        }],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expect(generated).toContain(`$(dot_get_var_or_default 'custom_prefix' 'C-x;$(touch ${markerPath})')`);

      const result = runGeneratedBash(dir, generated, `${bashFunctionNameForId("prefix")}`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`prefix=<C-x;$(touch ${markerPath})>`);
      expect(fs.existsSync(markerPath)).toBe(false);
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

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      const result = runGeneratedBash(
        dir,
        generated,
        `
DOT_GITHUB_SELECTED_PREFIX="https://selected.example/"
DOT_GITHUB_ORDERED_PREFIXES=("https://fallback.example/" "https://selected.example/")
mapfile -t ordered < <(dot_github_ordered_prefixes)
printf 'first=%s\\nsecond=%s\\nthird=%s\\n' "\${ordered[0]}" "\${ordered[1]}" "\${ordered[2]}"
printf 'mirrored=%s\\n' "$(dot_github_url "https://selected.example/" "https://github.com/org/repo")"
`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("first=https://selected.example/");
      expect(result.stdout).toContain("second=https://fallback.example/");
      expect(result.stdout).toContain("third=");
      expect(result.stdout).toContain("mirrored=https://selected.example/https://github.com/org/repo");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints a noninteractive dry-run plan with dependencies before post steps", () => {
    const dir = tmpDir();

    try {
      const dependencyPath = writeTmpFile(dir, "dependency.sh", "echo dependency");
      const featurePath = writeTmpFile(dir, "feature.sh", "echo feature");
      const postPath = writeTmpFile(dir, "post.sh", "echo post");
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [
          { id: "dependency", label: "Dependency", script: dependencyPath },
          { id: "feature", label: "Feature", script: featurePath, deps: ["dependency"] },
          { id: "post", label: "Post", script: postPath, post: true },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expectBashSyntaxValid(generated);

      const scriptPath = path.join(dir, "dot.sh");
      fs.writeFileSync(scriptPath, generated);
      const result = spawnSync("bash", [scriptPath, "--dry-run-plan", "--select", "feature", "post"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved execution plan");
      expect(result.stdout).toContain("Normal steps");
      expect(result.stdout).toContain("Post steps");
      expect(result.stdout).toContain("[dependency]");
      expect(result.stdout).toContain("[feature]");
      expect(result.stdout).toContain("[post]");
      expect(result.stdout).not.toContain("echo dependency");
      expect(result.stdout).not.toContain("echo feature");
      expect(result.stdout).not.toContain("echo post");

      const dependencyIndex = result.stdout.indexOf("[dependency]");
      const featureIndex = result.stdout.indexOf("[feature]");
      const postHeadingIndex = result.stdout.indexOf("Post steps");
      const postIndex = result.stdout.indexOf("[post]");
      expect(dependencyIndex).toBeGreaterThan(-1);
      expect(featureIndex).toBeGreaterThan(dependencyIndex);
      expect(postHeadingIndex).toBeGreaterThan(featureIndex);
      expect(postIndex).toBeGreaterThan(postHeadingIndex);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects noninteractive branch selection when it contains an explicit single-choice group", () => {
    const dir = tmpDir();

    try {
      const installPath = writeTmpFile(dir, "install.sh", "echo install");
      const skipPath = writeTmpFile(dir, "skip.sh", "echo skip");
      const config: Config = {
        name: "dot",
        version: "1.0",
        output: { filename: "dot.sh", dir },
        menu: [
          {
            id: "zsh",
            label: "Zsh",
            mode: "flow",
            children: [
              {
                id: "zsh-oh-my-zsh",
                label: "Oh My Zsh",
                mode: "single",
                children: [
                  { id: "zsh-oh-my-zsh-install", label: "Install", script: installPath },
                  { id: "zsh-oh-my-zsh-skip", label: "Skip", script: skipPath },
                ],
              },
            ],
          },
        ],
      };

      const generated = assembleStandalone({ config, configPath: path.join(dir, "config.yaml") });
      expectBashSyntaxValid(generated);

      const scriptPath = path.join(dir, "dot.sh");
      fs.writeFileSync(scriptPath, generated);
      const result = spawnSync("bash", [scriptPath, "--dry-run-plan", "--select", "zsh"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5000,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("single-choice group zsh-oh-my-zsh");
      expect(result.stdout).not.toContain("[zsh-oh-my-zsh-install]");
      expect(result.stdout).not.toContain("[zsh-oh-my-zsh-skip]");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});
