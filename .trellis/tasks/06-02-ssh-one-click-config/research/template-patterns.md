# Research: Template Patterns for "SSH One-Click Config" Flow

- **Query**: Read existing zsh/tmux templates and PRD to extract reusable patterns for a new SSH one-click config flow
- **Scope**: internal
- **Date**: 2026-06-02

## Files Examined

| File Path | Description |
|---|---|
| `/home/rick/desktop/dot/templates/zsh/install-apt.sh` | Package manager install template |
| `/home/rick/desktop/dot/templates/zsh/install-skip.sh` | Skip-install guard template |
| `/home/rick/desktop/dot/templates/zsh/oh-my-zsh-install.sh` | Download-and-run installer template |
| `/home/rick/desktop/dot/templates/zsh/zshrc-recommended.sh` | Config file writing template |
| `/home/rick/desktop/dot/templates/zsh/chsh-default.sh` | System modification template (with idempotency) |
| `/home/rick/desktop/dot/templates/zsh/chsh-skip.sh` | Skip-action info template |
| `/home/rick/desktop/dot/templates/zsh/plugin-autosuggestions.sh` | Git-clone plugin template |
| `/home/rick/desktop/dot/templates/zsh/powerlevel10k-github.sh` | Git-clone theme template |
| `/home/rick/desktop/dot/templates/zsh/final-notes.sh` | Final summary/heredoc template |
| `/home/rick/desktop/dot/templates/tmux/header.sh` | Config file init (backup + overwrite) |
| `/home/rick/desktop/dot/templates/tmux/install-apt.sh` | Package manager install (tmux variant) |
| `/home/rick/desktop/dot/templates/tmux/tpm-install.sh` | Plugin manager install with git clone |
| `/home/rick/desktop/dot/templates/tmux/final-notes.sh` | Final notes (tmux variant) |
| `/home/rick/desktop/dot/templates/tmux/install-recommended.sh` | Full recommended config write |
| `/home/rick/desktop/dot/configs/dot.yaml` | Master config defining menu tree, modes, deps |
| `/home/rick/desktop/dot/src/generator/assembler.ts` | Script assembler (header/footer generation) |
| `/home/rick/desktop/dot/src/generator/standalone/runtime/core.ts` | Runtime helper definitions (log_*, colors) |
| `/home/rick/desktop/dot/src/generator/standalone/runtime/github.ts` | Runtime: dot_sudo, dot_git_clone_with_fallback, dot_download_with_fallback |
| `/home/rick/desktop/dot/src/generator/standalone/runtime/execution.ts` | Runtime: plan execution, summary, dot_main |

## PRD Note

The file `/home/rick/desktop/dot/.trellis/tasks/06-02-zsh-one-click-config/prd.md` does not exist. The zsh task directory itself was not found. However, the zsh flow is fully defined in `configs/dot.yaml` under the `"zsh"` menu entry, which serves as the de facto specification.

---

## Pattern Analysis

### 1. Script Structure (Shebang, Guards, Formatting)

Template scripts do NOT include shebangs, `set -e`, or color definitions. Those are injected by the assembler (`src/generator/assembler.ts:86-111`), which generates:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Colors: RED, GREEN, YELLOW, CYAN, NC
# Functions: log_info, log_ok, log_warn, log_error
```

Each template is a bare code fragment that gets wrapped with:
- A section header comment: `# --- <label> (<id>) ---`
- Separated by blank lines
- Normal nodes execute first, then `post: true` nodes execute last (topological sort)

Template scripts therefore only contain the logic itself. They assume `log_info`, `log_ok`, `log_warn`, `log_error` are already defined.

### 2. Idempotency Patterns

Three distinct idempotency strategies are used:

**Pattern A: Check-before-install (skip if already done)**
Used by: `oh-my-zsh-install.sh`, `plugin-autosuggestions.sh`, `powerlevel10k-github.sh`, `tpm-install.sh`

```bash
if [[ -f "$TARGET_DIR/some-marker" ]]; then
  log_ok "Already installed: $TARGET_DIR"
  return 0
fi
```

For git-cloned directories, check `.git` subdirectory:
```bash
if [[ -d "$PLUGIN_DIR/.git" ]]; then
  log_info "Already exists, attempting update..."
  if git -C "$PLUGIN_DIR" pull --ff-only; then
    log_ok "Updated"
    return 0
  fi
  log_warn "Update failed, continuing with existing."
  return 0
fi
```

**Pattern B: Check-before-action (skip system change if already applied)**
Used by: `chsh-default.sh`

```bash
if [[ "${SHELL:-}" == "$ZSH_PATH" ]]; then
  log_ok "Default shell is already $ZSH_PATH"
  return 0
fi
```

**Pattern C: Check-then-skip-install (verify prerequisites)**
Used by: `install-skip.sh`

```bash
missing=()
for command_name in zsh git curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing+=("$command_name")
  fi
done
if [[ "${#missing[@]}" -gt 0 ]]; then
  log_error "Missing commands: ${missing[*]}"
  return 1
fi
```

### 3. Error Handling Pattern

Every fallible operation follows this exact structure:

```bash
if ! <command>; then
  log_error "<Chinese description of what failed and why>"
  return 1
fi
```

Key rules observed:
- Use `return 1` (not `exit 1`) -- templates are sourced as functions by the execution engine
- Error messages are in Chinese, past tense or descriptive, explaining what failed AND what the user should do
- Commands are checked before use: `if ! command -v <tool> >/dev/null 2>&1`
- After installs, verify the binary actually exists (post-install verification)
- `hash -r` is called after apt installs to refresh PATH cache

**Specific error message patterns:**
- Missing tool: `"未找到 <tool>；请手动..."` (tool not found; please manually...)
- Operation failed: `"<operation> 失败；<context>"` (operation failed; context)
- Post-install check: `"apt 安装结束后仍找不到 <command> 命令"` (after apt install, still can't find command)

### 4. User Feedback Pattern

All user-facing output uses the four logging functions. The ordering convention:

1. `log_info` at the start of each step (what is about to happen)
2. `log_ok` on success (what just completed)
3. `log_warn` for non-fatal issues (things that are ok to continue)
4. `log_error` for fatal failures (followed by `return 1`)

No raw `echo` or `printf` is used for status messages in templates. The only exception is `final-notes.sh` which uses `cat <<'HEREDOC'` for multi-line formatted output blocks with box-drawing characters.

### 5. Config File Writing Pattern

Two strategies:

**Strategy A: Backup + overwrite (destructive)**
Used by: `tmux/header.sh`, `tmux/install-recommended.sh`

```bash
if [ -f "$CONF_FILE" ]; then
  cp "$CONF_FILE" "${CONF_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "Backed up existing config"
fi
cat > "$CONF_FILE" << 'HEREDOC'
# Generated header
...
HEREDOC
```

**Strategy B: Backup + selective insert (preserving)**
Used by: `zsh/zshrc-recommended.sh`

```bash
if [[ -f "$ZSHRC" ]]; then
  cp "$ZSHRC" "${ZSHRC}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "Backed up existing ~/.zshrc"
else
  touch "$ZSHRC"
fi
# Define awk-based helper functions for set-or-insert
dot_zshrc_set_or_insert 'pattern' 'replacement_line' "$ZSHRC"
# Append lines only if not present
if ! grep -Fq 'line' "$ZSHRC"; then
  printf '%s\n' 'line' >> "$ZSHRC"
fi
```

The zshrc approach uses two local helper functions:
- `dot_zshrc_insert_before_omz_source()` -- inserts a line before the `source oh-my-zsh.sh` line using awk
- `dot_zshrc_set_or_insert()` -- removes matching lines then re-inserts in the correct position

### 6. Download / Git Clone Pattern

For downloading files, use the runtime helper:
```bash
if ! dot_download_with_fallback "$URL" "$OUTPUT_PATH"; then
  log_error "Download failed"
  return 1
fi
```

For cloning git repos, use:
```bash
if ! dot_git_clone_with_fallback "$REPO_URL" "$DEST_DIR"; then
  log_error "Clone failed"
  return 1
fi
```

Both functions handle GitHub mirror fallback automatically. Extra args (like `--depth 1`) can be passed after the two required args.

For privileged operations:
```bash
if ! dot_sudo apt-get install -y packages; then
  log_error "Install failed"
  return 1
fi
```

### 7. Final Notes Pattern

Used at the end of a flow to display post-install instructions:

```bash
cat <<'FLOW_FINAL_NOTES'

============================================================
 <Flow Name> completed
------------------------------------------------------------
 1) <Step description>:
      <exact command>

 2) ...
============================================================
FLOW_FINAL_NOTES

log_ok "Post-install notes displayed"
```

Characteristics:
- Use single-quoted heredoc delimiter (`<<'NAME'`) to prevent variable expansion
- Box drawn with `=` (top/bottom) and `-` (separator)
- Numbered steps with indented commands
- One final `log_ok` after the heredoc

### 8. Config YAML Structure (dot.yaml)

Each flow is a top-level menu entry with `mode: "flow"`. The tree uses:

- `mode: "flow"` -- sequential steps, shown one at a time
- `mode: "single"` -- radio selection (pick one child)
- `mode: "multi"` -- checkbox selection (pick any children)
- `post: true` -- execute after all normal nodes (for cleanup/finalize)
- `hidden: true` -- auto-selected dependency, not shown in menu
- `deps: ["id1", "id2"]` -- dependency ordering (topological sort)
- `script: "../templates/<dir>/<file>.sh"` -- relative path to template
- `vars: { key: value }` -- template variables
- `endFlow: true` -- marks a preset that ends the flow immediately
- `prompt: { type, var, label }` -- interactive input prompt

### 9. Helper Functions Available in Runtime

From `src/generator/standalone/runtime/core.ts`:
- `log_info`, `log_ok`, `log_warn`, `log_error` -- colored prefixed output

From `src/generator/standalone/runtime/github.ts`:
- `dot_sudo()` -- run command with sudo (or as root)
- `dot_download_with_fallback()` -- download file with GitHub mirror rotation
- `dot_download_from_url()` -- simple download (no mirror fallback)
- `dot_git_clone_with_fallback()` -- git clone with GitHub mirror rotation
- `dot_git_pull_with_fallback()` -- git pull with GitHub mirror rotation
- `dot_github_url()` -- construct URL with mirror prefix
- `dot_warn_github_mirror_trust()` -- one-time trust warning for mirrors

---

## Summary: Checklist for SSH Template Scripts

When creating new SSH template scripts, follow these conventions:

1. No shebang or `set` preamble -- the assembler adds it
2. Start with a `# <description>` comment line
3. Use `log_info` to announce each step, `log_ok` for success, `log_error`/`return 1` for failures
4. Check prerequisites before use (`command -v ...`)
5. Implement idempotency: check state before acting, `return 0` if already done
6. Verify post-install state (re-check that the command/file exists)
7. Use `dot_sudo` for privileged operations
8. Use `dot_git_clone_with_fallback` / `dot_download_with_fallback` for downloads
9. Backup existing config files before overwriting (timestamp suffix `.bak.YYYYMMDDHHmmss`)
10. All user-facing messages in Chinese
11. Use `return 1` for errors (never `exit 1`)
12. Final notes use `cat <<'NAME'` heredoc with box formatting
