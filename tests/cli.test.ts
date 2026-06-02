import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

function writeOverlayConfig(dir: string): string {
  const configPath = path.join(dir, "config.yaml");
  fs.writeFileSync(path.join(dir, "feature.sh"), "echo feature\n");
  fs.writeFileSync(
    configPath,
    [
      'name: "Overlay build"',
      'version: "1.0"',
      "menu:",
      '  - id: "feature"',
      '    label: "Feature"',
      '    description: "Original description"',
      '    script: "feature.sh"',
      "",
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(dir, "config.plan.json"),
    JSON.stringify({
      version: 1,
      disabled: ["feature"],
      overrides: {
        feature: {
          label: "Feature disabled by overlay",
          description: "Overlay description",
          hidden: false,
          post: true,
          script: "missing.sh",
        },
      },
    })
  );

  return configPath;
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


describe("CLI plan", () => {
  it("prints a tree preview", () => {
    const { stdout, exitCode } = run([
      "plan",
      "--config", dotConfig,
      "--format", "text",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Installation plan");
    expect(stdout).toContain("tmux");
    expect(stdout).toContain("dependency");
    expect(stdout).toContain("post");
  });

  it("writes a JSON plan snapshot", () => {
    const output = path.resolve(import.meta.dirname, "../dist/dot.plan.json");
    const { exitCode } = run([
      "plan",
      "--config", dotConfig,
      "--format", "json",
      "--write", output,
    ]);

    expect(exitCode).toBe(0);
    const plan = JSON.parse(fs.readFileSync(output, "utf-8"));
    expect(plan.version).toBe(1);
    expect(plan.nodes.tmux).toBeDefined();
  });

  it("renders sidecar overlay metadata from the same resolved plan path as build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-plan-overlay-"));
    try {
      const configPath = writeOverlayConfig(dir);
      const { stdout, exitCode } = run(["plan", "--config", configPath, "--format", "json"]);

      expect(exitCode).toBe(0);
      const plan = JSON.parse(stdout);
      expect(plan.nodes.feature.label).toBe("Feature disabled by overlay");
      expect(plan.nodes.feature.description).toBe("Overlay description");
      expect(plan.nodes.feature.hidden).toBe(true);
      expect(plan.nodes.feature.post).toBe(true);
      expect(plan.nodes.feature.script).toBe("feature.sh");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it("supports a noninteractive dry-run plan preview in the generated script", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-dry-run-"));
    try {
      const configPath = path.join(dir, "config.yaml");
      const output = path.join(dir, "dot.sh");
      fs.writeFileSync(path.join(dir, "base.sh"), "echo base\n");
      fs.writeFileSync(path.join(dir, "feature.sh"), "echo feature\n");
      fs.writeFileSync(
        configPath,
        [
          'name: "Dry run"',
          'version: "1.0"',
          "menu:",
          '  - id: "base"',
          '    label: "Base"',
          '    script: "base.sh"',
          '  - id: "feature"',
          '    label: "Feature"',
          '    script: "feature.sh"',
          '    deps: ["base"]',
          '  - id: "post"',
          '    label: "Post"',
          '    script: "feature.sh"',
          '    post: true',
          "",
        ].join("\n")
      );

      const { exitCode } = run(["build", "--config", configPath, "--output", output, "--quiet"]);
      expect(exitCode).toBe(0);
      execFileSync("bash", ["-n", output]);

      const result = execFileSync("bash", [output, "--dry-run-plan", "--select", "feature", "post"], {
        encoding: "utf-8",
        cwd: dir,
      });

      expect(result).toContain("Resolved execution plan");
      expect(result).toContain("Normal steps");
      expect(result).toContain("Post steps");
      expect(result).toContain("[base]");
      expect(result).toContain("[feature]");
      expect(result).toContain("[post]");
      expect(result).not.toContain("echo base");
      expect(result).not.toContain("echo feature");

      const baseIndex = result.indexOf("[base]");
      const featureIndex = result.indexOf("[feature]");
      const postHeadingIndex = result.indexOf("Post steps");
      const postIndex = result.indexOf("[post]");
      expect(baseIndex).toBeGreaterThan(-1);
      expect(featureIndex).toBeGreaterThan(baseIndex);
      expect(postHeadingIndex).toBeGreaterThan(featureIndex);
      expect(postIndex).toBeGreaterThan(postHeadingIndex);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports noninteractive execution in the generated script", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-run-plan-"));
    try {
      const configPath = path.join(dir, "config.yaml");
      const output = path.join(dir, "dot.sh");
      fs.writeFileSync(path.join(dir, "base.sh"), "echo base-ran\n");
      fs.writeFileSync(path.join(dir, "feature.sh"), "echo feature-ran\n");
      fs.writeFileSync(path.join(dir, "fail.sh"), "echo fail-ran\nreturn 7\n");
      fs.writeFileSync(
        configPath,
        [
          'name: "Run plan"',
          'version: "1.0"',
          "menu:",
          '  - id: "base"',
          '    label: "Base"',
          '    script: "base.sh"',
          '  - id: "feature"',
          '    label: "Feature"',
          '    script: "feature.sh"',
          '    deps: ["base"]',
          '  - id: "fail"',
          '    label: "Fail"',
          '    script: "fail.sh"',
          "",
        ].join("\n")
      );

      const { exitCode } = run(["build", "--config", configPath, "--output", output, "--quiet"]);
      expect(exitCode).toBe(0);
      execFileSync("bash", ["-n", output]);

      const result = execFileSync("bash", [output, "--run-plan", "--select", "feature"], {
        encoding: "utf-8",
        cwd: dir,
      });

      expect(result).toContain("Executing plan");
      expect(result).toContain("base-ran");
      expect(result).toContain("feature-ran");
      expect(result).toContain("Summary");
      expect(result.indexOf("base-ran")).toBeLessThan(result.indexOf("feature-ran"));

      let failureStdout = "";
      let failureStatus = 0;
      try {
        execFileSync("bash", [output, "--run-plan", "--select", "fail"], {
          encoding: "utf-8",
          cwd: dir,
        });
      } catch (err: unknown) {
        const e = err as { stdout?: string; status?: number };
        failureStdout = e.stdout ?? "";
        failureStatus = e.status ?? 1;
      }
      expect(failureStatus).toBe(1);
      expect(failureStdout).toContain("fail-ran");
      expect(failureStdout).toContain("Summary");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies a saved sidecar plan overlay during standalone build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-build-overlay-"));
    try {
      const configPath = writeOverlayConfig(dir);
      const output = path.join(dir, "dot.sh");

      const { exitCode } = run(["build", "--config", configPath, "--output", output, "--quiet"]);

      expect(exitCode).toBe(0);
      const script = fs.readFileSync(output, "utf-8");
      expect(script).toContain("DOT_LABELS['feature']='Feature disabled by overlay'");
      expect(script).toContain("DOT_DESCRIPTIONS['feature']='Overlay description'");
      expect(script).toContain("DOT_HIDDEN['feature']='1'");
      expect(script).toContain("DOT_POST['feature']='1'");
      expect(script).toContain("echo feature");
      execFileSync("bash", ["-n", output]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates sidecar plan overlay changes before standalone build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-build-overlay-"));
    try {
      const configPath = path.join(dir, "config.yaml");
      const output = path.join(dir, "dot.sh");
      fs.writeFileSync(path.join(dir, "base.sh"), "echo base\n");
      fs.writeFileSync(path.join(dir, "feature.sh"), "echo feature\n");
      fs.writeFileSync(
        configPath,
        [
          'name: "Overlay build"',
          'version: "1.0"',
          "menu:",
          '  - id: "base"',
          '    label: "Base"',
          '    script: "base.sh"',
          '  - id: "feature"',
          '    label: "Feature"',
          '    script: "feature.sh"',
          '    deps: ["base"]',
          "",
        ].join("\n")
      );
      fs.writeFileSync(
        path.join(dir, "config.plan.json"),
        JSON.stringify({
          version: 1,
          overrides: {
            base: {
              post: true,
            },
          },
        })
      );

      const { exitCode } = run(["build", "--config", configPath, "--output", output, "--quiet"]);

      expect(exitCode).toBe(1);
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails hard when resolved plan validation reports an error", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-build-plan-error-"));
    try {
      const configPath = path.join(dir, "config.yaml");
      const output = path.join(dir, "dot.sh");
      fs.writeFileSync(path.join(dir, "a.sh"), "echo a\n");
      fs.writeFileSync(path.join(dir, "b.sh"), "echo b\n");
      fs.writeFileSync(
        configPath,
        [
          'name: "Plan validation"',
          'version: "1.0"',
          "menu:",
          '  - id: "a"',
          '    label: "A"',
          '    script: "a.sh"',
          '    deps: ["b"]',
          '  - id: "b"',
          '    label: "B"',
          '    script: "b.sh"',
          '    deps: ["a"]',
          "",
        ].join("\n")
      );

      const planResult = run(["plan", "--config", configPath, "--format", "text"]);
      expect(planResult.exitCode).toBe(0);
      expect(planResult.stdout).toContain("error: circular-dependency");

      const buildResult = run(["build", "--config", configPath, "--output", output, "--quiet"]);
      expect(buildResult.exitCode).toBe(1);
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
    expect(script).toContain("DOT_CHILDREN['__root']='tmux zsh'");
    expect(script).toContain("DOT_MODES['__root']='single'");
    expect(script).toContain("DOT_MODES['tmux']='flow'");
    expect(script).toContain("DOT_CHILDREN['tmux']='tmux-install tmux-github-mirror tmux-prefix tmux-plugins tmux-status tmux-options tmux-finalize tmux-font-jetbrainsmono tmux-header'");
    expect(script).toContain("DOT_MODES['tmux-plugins']='flow'");
    expect(script).toContain(
      "DOT_CHILDREN['tmux-plugins']='tmux-plugin-foundation tmux-plugin-session tmux-plugin-productivity tmux-plugin-status tmux-plugin-themes tmux-plugin-navigation'"
    );
    expect(script).toContain("DOT_MODES['tmux-plugin-status']='multi'");
    expect(script).toContain("DOT_MODES['tmux-plugin-themes']='multi'");
    expect(script).toContain("tmux-prefix-record");
    expect(script).toContain("tmux-prefix-compose");
    expect(script).toContain("tmux-plugin-prefix-highlight");
    expect(script).toContain("tmux-plugins/tmux-prefix-highlight");
    expect(script).toContain("tmux-plugin-cpu");
    expect(script).toContain("tmux-plugins/tmux-cpu");
    expect(script).toContain("tmux-plugin-battery");
    expect(script).toContain("tmux-plugins/tmux-battery");
    expect(script).toContain("tmux-plugin-sidebar");
    expect(script).toContain("tmux-plugins/tmux-sidebar");
    expect(script).toContain("tmux-plugin-catppuccin");
    expect(script).toContain("catppuccin/tmux");
    expect(script).toContain("RESURRECT_DIR=\"$HOME/.tmux/resurrect\"");
    expect(script).toContain("mkdir -p \"$RESURRECT_DIR\"");
    expect(script).toContain("set -g @resurrect-dir '$RESURRECT_DIR'");
    expect(script).toContain("已添加 tmux-resurrect 插件，保存目录: $RESURRECT_DIR");
    expect(script).toContain("dracula/tmux");
    expect(script).toContain("tmux-plugin-vim-navigator");
    expect(script).toContain("christoomey/vim-tmux-navigator");
    expect(script).toContain("dot_sudo apt-get update -qq");
    expect(script).toContain("command -v tmux");
    expect(script).toContain("tmux -V");
    expect(script).toContain("更新 TPM（镜像）");
    expect(script).toContain("TPM 更新失败；将继续使用本地已有 TPM。");
    expect(script).toContain("dot_git_clone_with_fallback \"$TPM_REPO\" \"$TPM_DIR\" --depth 1");
    expect(script).toContain("TPM_INSTALLER=\"$TPM_DIR/bin/install_plugins\"");
    expect(script).toContain("export TMUX_PLUGIN_MANAGER_PATH=\"$TPM_PATH\"");
    expect(script).toContain("tmux -L \"$TPM_SOCKET\" run-shell \"$TPM_INSTALLER\"");
    expect(script).toContain("请启动 tmux 后按 prefix + I 手动安装插件");
    expect(script).toContain("TPM install_plugins 不存在或不可执行");
    expect(script).not.toContain("install_plugins\" 2>/dev/null || true");
    expect(script).toContain("https://gh.ddlc.top/");
    expect(script).toContain("https://gh.llkk.cc/");
    expect(script).toContain("https://ghfast.top/");
    expect(script).toContain("https://gh-proxy.com/");
    expect(script).toContain("https://ghproxy.net/");
    expect(script).toContain("https://hub.gitmirror.com/");
    expect(script).toContain("DOT_DEPS['tmux-plugin-catppuccin']='tmux-tpm tmux-font-jetbrainsmono'");
    expect(script).toContain("DOT_HIDDEN['tmux-font-jetbrainsmono']='1'");
    expect(script).toContain("DOT_CHILDREN['tmux-install']='tmux-install-apt tmux-install-source tmux-install-recommended'");
    expect(script).toContain("DOT_LABELS['tmux-install-recommended']='安装推荐tmux安装配置'");
    expect(script).toContain("DOT_POST['tmux-install-recommended']='1'");
    expect(script).toContain("DOT_END_FLOW['tmux-install-recommended']='1'");
    expect(script).toContain('if [[ "${DOT_END_FLOW[$choice]:-0}" == "1" ]]; then');
    expect(script).toContain("DOT_GITHUB_MIRROR_TESTED=0");
    expect(script).toContain("DOT_GITHUB_MIRROR_TRUST_WARNED=0");
    expect(script).toContain("第三方镜像可观察请求并提供下载内容");
    expect(script).toContain("第三方镜像会成为下载/克隆内容的信任来源");
    expect(script).toContain("if [[ \"${DOT_GITHUB_MIRROR_TESTED:-0}\" == \"1\" ]]");
    expect(script).toContain("$'\\eOD'");
    expect(script).toContain("jimeh/tmuxifier");
    expect(script).toContain("#{E:@catppuccin_status_application}");
    expect(script).toContain("set -g prefix C-Space");
    expect(script).toContain("$'\\eOD'");
    expect(script).toContain("DOT_GITHUB_SELECTED_PREFIX=");
    expect(script).toContain("DOT_GITHUB_ORDERED_PREFIXES=()");
    expect(script).toContain("dot_github_ordered_prefixes()");
    expect(script).toContain("dot_github_url()");
    expect(script).toContain("dot_git_pull_with_fallback()");
    expect(script).toContain("DOT_LABELS['tmux-github-mirror']='GitHub 加速源'");
    expect(script).toContain("DOT_SNIPPET_FUNCS['tmux-github-mirror']");
    expect(script).toContain("while IFS= read -r prefix; do");
    expect(script).toContain('candidate="$(dot_github_url "$prefix" "$url")"');
    expect(script).toContain('candidate="$(dot_github_url "$prefix" "$repo")"');
    expect(script).toContain('git -C "$repo_dir" remote set-url origin "$candidate"');
    expect(script).toContain('dot_git_pull_with_fallback "$TPM_DIR" "$TPM_REPO"');
    expect(script).toContain('dot_download_with_fallback "$NERD_FONT_URL" "$FONT_ZIP"');
    expect(script).toContain("镜像是第三方信任来源，直连优先保留为可选项");
    expect(script).not.toContain("JetBrainsMono Nerd Font 下载源");
    expect(script).toContain("https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip");
    expect(script).toContain("tmux-font-jetbrainsmono");
    expect(script).not.toContain("tmux-font-skip");
    expect(script).toContain("tmux-cleanup-sockets");
    expect(script).toContain("tmux-final-notes");
    expect(script).not.toContain("DOT_CHILDREN['__root']='tmux-install");
    expect(script).toContain("DOT_MODES['zsh']='flow'");
    expect(script).toContain("DOT_MODES['zsh-plugins']='flow'");
    expect(script).toContain("DOT_CHILDREN['zsh']='zsh-install zsh-oh-my-zsh zsh-powerlevel10k zsh-plugins zsh-zshrc-recommended zsh-default-shell zsh-final-notes'");
    expect(script).toContain("DOT_CHILDREN['zsh-install']='zsh-install-apt zsh-install-skip'");
    expect(script).toContain("DOT_CHILDREN['zsh-powerlevel10k']='zsh-powerlevel10k-github zsh-powerlevel10k-gitee'");
    expect(script).toContain("DOT_CHILDREN['zsh-plugins']='zsh-plugin-autosuggestions zsh-plugin-syntax-highlighting'");
    expect(script).toContain("DOT_CHILDREN['zsh-default-shell']='zsh-chsh-default zsh-chsh-skip'");
    expect(script).toContain("DOT_POST['zsh-final-notes']='1'");
    expect(script).toContain("dot_sudo apt-get install -y \"${ZSH_APT_PACKAGES[@]}\"");
    expect(script).toContain("RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh \"$installer\" --unattended --keep-zshrc");
    expect(script).toContain("https://install.ohmyz.sh/");
    expect(script).toContain("https://github.com/romkatv/powerlevel10k.git");
    expect(script).toContain("https://gitee.com/romkatv/powerlevel10k.git");
    expect(script).toContain("https://github.com/zsh-users/zsh-autosuggestions.git");
    expect(script).toContain("https://github.com/zsh-users/zsh-syntax-highlighting.git");
    expect(script).toContain("ZSH_THEME=\"powerlevel10k/powerlevel10k\"");
    expect(script).toContain("plugins=(git z extract zsh-autosuggestions zsh-syntax-highlighting)");
    expect(script).toContain("source \"$ZSH/oh-my-zsh.sh\"");
    expect(script).toContain("[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh");
    expect(script).toContain("chsh -s \"$ZSH_PATH\" \"$CURRENT_USER\"");
    expect(script).toContain("exec zsh");
    expect(script).toContain("p10k configure");
  });
});
