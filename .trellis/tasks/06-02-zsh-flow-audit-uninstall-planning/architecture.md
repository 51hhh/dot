# Zsh Flow Audit and Uninstall Planning

## Scope

This document started as a planning document for evaluating the current Zsh one-click flow against the more mature Tmux flow. The task was later upgraded by user instruction to implement the first four findings: diagnostics, optional choices, uninstall/recovery, and risk fixes.

## Current Zsh Flow

Initial menu shape before implementation:

1. `zsh-install`
   - `zsh-install-apt`
   - `zsh-install-skip`
2. `zsh-oh-my-zsh`
3. `zsh-powerlevel10k`
   - `zsh-powerlevel10k-github`
   - `zsh-powerlevel10k-gitee`
4. `zsh-plugins`
   - `zsh-plugin-autosuggestions`
   - `zsh-plugin-syntax-highlighting`
5. `zsh-zshrc-recommended`
6. `zsh-default-shell`
   - `zsh-chsh-default`
   - `zsh-chsh-skip`
7. `zsh-final-notes`

The initial flow was technically usable and mostly idempotent, but it was still a linear recommended install path. It lacked the richer branching, diagnostics, recovery, and personalization that the Tmux flow already has.

## Tmux Capabilities Worth Reusing

The Tmux flow has several patterns that should be reused for Zsh:

- A complete recommended setup path for users who want the old script behavior without answering every intermediate option.
- Explicit skip/custom choices instead of forcing every feature.
- Source/mirror selection where network reliability matters.
- Hidden setup dependencies for internal initialization.
- Post/finalize steps for cleanup and user instructions.
- User personalization for key behavior and visual style.
- Clear separation between install, configuration, plugins, and final notes.

Zsh should follow the same product shape: first let users check what they already have, then let them either run a recommended setup or choose individual install/configuration parts.

## Gaps in the Current Zsh Flow

### Missing Diagnostics

The current flow does not provide a first-class environment check. `zsh-install-skip` checks only `zsh`, `git`, and `curl`, but there is no unified status page for:

- `zsh` presence and version.
- `git`, `curl`, and `ca-certificates`.
- Oh My Zsh installation state.
- Powerlevel10k theme directory.
- Plugin directories and whether they are Git repos.
- `~/.zshrc` theme line.
- `~/.zshrc` plugin list.
- Whether `source "$ZSH/oh-my-zsh.sh"` exists.
- Whether `~/.p10k.zsh` is sourced.
- Current process shell and login shell.
- Whether `zsh` is listed in `/etc/shells`.

### Missing Optionality

The current flow always installs Oh My Zsh, always installs Powerlevel10k, always installs two plugins, and always writes the full recommended zshrc. That is acceptable for a quick-start path, but not enough for users who already have a customized shell.

### Missing Uninstall and Recovery

There is no supported way to:

- Restore a previous `~/.zshrc` backup.
- Remove only the installed plugins.
- Remove only Powerlevel10k.
- Run Oh My Zsh uninstall safely.
- Reset login shell back to bash.
- Optionally remove the `zsh` package.

This should be added carefully because shell configuration is user data.

### Risky Areas in Current Scripts

- `zshrc-recommended.sh` performs several file rewrites; the future implementation should keep explicit error checks around temporary file creation, `awk`, and `mv`.
- `oh-my-zsh-install.sh` downloads and executes a remote installer. The flow should show a trust warning or at least describe the source before execution.
- `chsh-default.sh` uses `${USER:-$(id -un)}`. If the generated script is run with `sudo`, this may target `root`. It should prefer `SUDO_USER` for interactive sudo runs or explicitly warn when the target user is `root`.

## Recommended New Menu Structure

Suggested high-level structure:

```yaml
- id: zsh
  label: Zsh 一键配置
  mode: flow
  children:
    - id: zsh-diagnose
      label: 检查当前 Zsh 环境

    - id: zsh-install
      label: 安装方式
      mode: single
      children:
        - zsh-install-apt
        - zsh-install-skip

    - id: zsh-setup-mode
      label: 配置模式
      mode: single
      children:
        - zsh-setup-recommended
        - zsh-setup-custom
        - zsh-setup-uninstall

    - id: zsh-oh-my-zsh
      label: Oh My Zsh
      mode: single
      children:
        - zsh-oh-my-zsh-install
        - zsh-oh-my-zsh-skip

    - id: zsh-theme
      label: 主题
      mode: single
      children:
        - zsh-theme-p10k-github
        - zsh-theme-p10k-gitee
        - zsh-theme-skip

    - id: zsh-plugins
      label: 插件
      mode: multi
      children:
        - zsh-plugin-autosuggestions
        - zsh-plugin-syntax-highlighting
        - zsh-plugin-completions
        - zsh-plugin-fzf-tab

    - id: zsh-zshrc
      label: zshrc 配置
      mode: single
      children:
        - zsh-zshrc-recommended
        - zsh-zshrc-minimal
        - zsh-zshrc-patch-only
        - zsh-zshrc-restore-backup
        - zsh-zshrc-skip

    - id: zsh-default-shell
      label: 默认终端
      mode: single
      children:
        - zsh-chsh-default
        - zsh-chsh-skip
        - zsh-chsh-reset-bash

    - id: zsh-uninstall
      label: 卸载与恢复
      mode: multi
      children:
        - zsh-uninstall-plugins
        - zsh-uninstall-theme-p10k
        - zsh-uninstall-oh-my-zsh
        - zsh-restore-zshrc-backup
        - zsh-reset-shell-bash
        - zsh-apt-remove

    - id: zsh-final-notes
      label: 显示最终提示
      post: true
```

The exact implementation can be split into two modes:

- Recommended mode: quickly installs the same opinionated setup users expect today.
- Custom mode: lets users choose theme, plugins, zshrc strategy, and default shell separately.

## Recommended Personalization Options

### Theme

- Powerlevel10k from GitHub.
- Powerlevel10k from Gitee.
- Skip theme installation.
- Future option: keep existing `ZSH_THEME` unchanged.

### Plugins

Default recommended plugins:

- `git`
- `z`
- `extract`
- `zsh-autosuggestions`
- `zsh-syntax-highlighting`

Optional plugins worth adding:

- `zsh-completions`: broader completion support.
- `fzf-tab`: stronger tab completion UX, but depends on user preference and may interact with existing completion config.

Implementation rule: `zsh-syntax-highlighting` must be last in the `plugins=(...)` list.

### zshrc Write Mode

- Full recommended zshrc patch: theme, plugin list, OMZ source, P10k source.
- Minimal patch: only ensure OMZ source and selected plugins.
- Theme/plugin patch only: preserve custom aliases/options as much as possible.
- Restore latest backup.
- Skip writing zshrc.

### Default Shell

- Change login shell to zsh.
- Skip.
- Reset login shell to bash.

Changing shell should show the target username and target shell before running.

## Diagnostics Design

Add a `zsh-diagnose` script that prints a compact status report and exits successfully unless the diagnostic itself fails.

Suggested checks:

```bash
command -v zsh
zsh --version
command -v git
command -v curl
test -f "$HOME/.oh-my-zsh/oh-my-zsh.sh"
test -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
test -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions"
test -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting"
grep -E '^[[:space:]]*ZSH_THEME=' "$HOME/.zshrc"
grep -E '^[[:space:]]*plugins=' "$HOME/.zshrc"
grep -E 'oh-my-zsh\.sh' "$HOME/.zshrc"
grep -F '.p10k.zsh' "$HOME/.zshrc"
printf '%s\n' "$SHELL"
getent passwd "$USER"
grep -qx "$(command -v zsh)" /etc/shells
```

The output should be human-readable, for example:

- `[OK] zsh: zsh 5.9`
- `[MISSING] Oh My Zsh: ~/.oh-my-zsh/oh-my-zsh.sh`
- `[WARN] login shell is /bin/bash, not /usr/bin/zsh`

This diagnostic step should not mutate files.

## Uninstall and Recovery Design

Uninstall must be conservative. It should never silently delete user-owned configuration.

Recommended actions:

### Remove Plugins

Remove only known managed plugin directories:

- `${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions`
- `${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting`
- future managed plugin directories

Before deletion:

- Verify the path is under the expected Oh My Zsh custom plugin directory.
- Verify it is a directory.
- Prefer moving to a timestamped backup under `~/.dot-backups/zsh/` rather than hard deleting.

### Remove Powerlevel10k

Move `${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k` to a backup path.

### Restore zshrc

Support restoring the newest matching backup:

- `~/.zshrc.bak.YYYYMMDDHHMMSS`
- future `~/.dot-backups/zsh/zshrc.*`

Before restore:

- Back up the current `~/.zshrc`.
- Show the chosen backup path.

### Uninstall Oh My Zsh

Oh My Zsh has its own uninstall flow, but automatic execution can modify shell files. Treat this as an explicit option, not part of default uninstall.

Safer approach:

- Show the target directory.
- If possible, move `~/.oh-my-zsh` to backup instead of running remote code.
- Restore zshrc backup if available.
- Leave final shell reset as a separate option.

### Reset Shell to Bash

Use `chsh -s "$(command -v bash)" "$TARGET_USER"`.

Target user rule:

1. If `SUDO_USER` is set and not `root`, target `SUDO_USER`.
2. Otherwise target `${USER:-$(id -un)}`.
3. If target is `root`, warn clearly.

### Remove zsh Package

This should be a separate dangerous option:

- `apt-get remove zsh`
- Do not remove user configuration.
- Require that login shell is no longer zsh first, or print an explicit warning.

## Flow Recommendation

The MVP should not put uninstall inside the normal install path by default. The top-level Zsh menu should include either:

- `安装/配置 Zsh`
- `检查当前 Zsh 环境`
- `卸载/恢复 Zsh 配置`

This avoids making a new user pass through uninstall choices during a normal setup.

## Implementation Phases

### Phase 1: Diagnostics and Safer Existing Scripts

- Add `zsh-diagnose`.
- Add better target user detection for `chsh-default`.
- Add explicit error checks around `zshrc-recommended` rewrite operations.
- Add tests for generated script content and template inclusion.

### Phase 2: Optional Theme and Plugin Choices

- Convert plugin installation from forced flow to `multi`.
- Add theme skip option.
- Add optional `zsh-completions` and maybe `fzf-tab`.
- Ensure `zsh-syntax-highlighting` remains last in zshrc plugin list.

### Phase 3: zshrc Strategy

- Split recommended zshrc from patch-only/minimal/skip/restore.
- Add backup discovery and restore scripts.
- Add tests for zshrc patch behavior.

### Phase 4: Uninstall and Recovery

- Add uninstall menu.
- Implement plugin/theme move-to-backup.
- Implement shell reset.
- Add dangerous apt removal as a separate explicit option.

### Phase 5: Recommended One-Click Path

- Add a one-click recommended setup path similar to Tmux recommended install.
- Mark final notes as post.
- Keep manual instructions for `exec zsh`, `source ~/.zshrc`, and `p10k configure`.

## Test Coverage Suggestions

- Unit tests for config schema and build output containing new Zsh nodes.
- Generated script syntax check with `bash -n`.
- Bash behavior tests for:
  - diagnostic output against temporary `$HOME`.
  - zshrc backup and patch mode.
  - plugin list ordering.
  - uninstall moving directories to backups.
  - shell target user selection.
- CLI smoke test selecting recommended Zsh path in dry-run mode.

## Recommendation

The current flow is reasonable as a first version, but it is not complete enough for long-term use. The next implementation should prioritize diagnostics first, then optional install/config choices, then uninstall/recovery.

The most important product rule is: install should be helpful and fast, uninstall should be conservative and reversible.

## Implementation Addendum

Implemented shape:

- `zsh` remains the install/configuration flow.
- `zsh-recovery` is a separate top-level recovery/uninstall branch.
- `zsh-diagnose` runs as part of the install flow.
- `zsh-recovery-diagnose` reuses the diagnostic template in the recovery branch.
- Oh My Zsh is now a `single` step with install/skip choices.
- Powerlevel10k is now a `single` step with GitHub/Gitee/skip choices.
- Plugins are now `multi` choices.
- zshrc is now a `single` step with recommended/minimal/patch-only/skip choices.
- zshrc backup restore moved to `zsh-recovery`.
- shell reset to bash moved to `zsh-recovery`.
- plugin/theme/Oh My Zsh uninstall actions move targets into `~/.dot-backups/zsh/`.
- `zsh-uninstall-apt-remove` requires shell safety checks plus typed/env confirmation.

Design correction discovered during implementation:

- Do not put destructive uninstall leaves under a broad install branch. The generated runtime expands branch ids to all runnable leaves for noninteractive `--run-plan --select <branch>`, so adding package removal under `zsh` would make `--run-plan --select zsh` dangerous. This rule is now recorded in `.trellis/spec/frontend/quality-guidelines.md`.
