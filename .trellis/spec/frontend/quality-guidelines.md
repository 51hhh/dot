# Quality Guidelines

> Quality standards for terminal UI and generated-script UX.

## Required Checks

Run the project checks from backend quality guidelines for any UI/generator change:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For generated scripts, also run `bash -n` and a Docker smoke test when runtime behavior changes.

## Required Patterns

- Menu rendering returns structured actions, not raw strings.
- Navigation loops should be iterative, not recursive.
- Quiet/dry-run output must remain script-safe.
- Generated bash TUI must restore terminal state on exit.
- User-facing actions should have clear labels and descriptions.

## Testing Requirements

- Unit test input parsing and branch/leaf selection behavior.
- CLI tests should cover quiet vs non-quiet output.
- Generated bash TUI should have syntax and fixture/golden coverage.
- Manual/container smoke testing is required for true interactive behavior.

## Forbidden Patterns

- Do not require `dialog`, `whiptail`, `gum`, or `fzf` for MVP generated scripts.
- Do not mix installation execution into selection rendering.
- Do not rely on terminal features without a fallback or cleanup path.

## Code Review Checklist

- [ ] Menu state and rendering remain separated.
- [ ] Dependency display matches actual dependency resolution.
- [ ] Terminal cleanup runs on normal exit and interruption.
- [ ] Output modes are compatible with shell redirection.


## Scenario: Destructive generated-runtime actions

### 1. Scope / Trigger

- Trigger: adding generated-script actions that remove packages, delete or move user configuration, reset shells, rotate keys, or otherwise change durable system/user state.
- Applies to `configs/*.yaml`, `templates/**/*.sh`, generated standalone runtime dry-run/run-plan behavior, and CLI tests that assert generated menu metadata.

### 2. Signatures

Generated runtime:

```bash
bash dist/dot.sh --dry-run-plan --select <ids...>
bash dist/dot.sh --run-plan --select <ids...>
DOT_CONFIRM_<ACTION>=1 bash dist/dot.sh --run-plan --select <dangerous-id>
```

Dangerous template examples:

```bash
DOT_CONFIRM_ZSH_APT_REMOVE=1
```

### 3. Contracts

- Noninteractive branch selection expands branch ids to all runnable leaves under that branch.
- Destructive recovery/uninstall leaves must not be children of broad install/configuration branches such as `zsh`; put them in a separate top-level recovery/maintenance branch.
- Destructive package removal must require an additional confirmation beyond menu selection.
- Interactive generated scripts may ask for a typed confirmation token before proceeding.
- Noninteractive `--run-plan` must require an explicit environment confirmation key for dangerous package removal.
- Prefer reversible moves into a backup directory over hard deletion for user-owned configuration directories.
- Recovery branches may include diagnostics and restore actions, but final notes should use their own unique post id rather than reusing an id from the install flow.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| `--dry-run-plan --select zsh` | Shows install/config leaves only, not uninstall/package-removal leaves |
| `--dry-run-plan --select zsh-recovery` | Shows recovery/uninstall leaves and a recovery-specific post note |
| `--run-plan --select <dangerous-package-remove>` without TTY or env confirmation | Exits non-zero before running package manager removal |
| Interactive dangerous package removal without typed token | Skips the destructive action and reports a warning |
| Default shell still points at the shell being removed | Exits before package removal and tells the user to reset the shell first |
| User-owned plugin/theme/config directory is "uninstalled" | Moves to a timestamped backup directory instead of hard deleting |

### 5. Good/Base/Bad Cases

- Good: `zsh-recovery` is a separate top-level branch containing `zsh-chsh-reset-bash`, plugin/theme backup moves, Oh My Zsh backup move, and guarded apt removal.
- Good: `zsh-uninstall-apt-remove` refuses noninteractive execution unless `DOT_CONFIRM_ZSH_APT_REMOVE=1` is set.
- Base: selecting a normal install flow can still include multiple single-branch leaves in dry-run output because branch expansion is broad by design.
- Bad: adding `apt remove zsh` under `zsh` means `--run-plan --select zsh` can remove the shell during an install smoke test.
- Bad: deleting `~/.oh-my-zsh` with `rm -rf` without backup.

### 6. Tests Required

- CLI test: root metadata includes separate install and recovery branches when destructive recovery actions are added.
- CLI test: normal install branch children do not include uninstall/package-removal ids.
- CLI test: generated script contains the explicit environment confirmation key for dangerous package removal.
- Planner test: recovery branch edges are separate from install flow edges and recovery final notes are post steps.
- Generated script check: rebuild `dist/dot.sh`, run `bash -n`, and run dry-run plan checks for both install and recovery branches.

### 7. Wrong vs Correct

#### Wrong

```yaml
- id: "zsh"
  mode: "flow"
  children:
    - id: "zsh-install"
    - id: "zsh-uninstall-apt-remove"
      script: "../templates/zsh/uninstall-apt-remove.sh"
```

#### Correct

```yaml
- id: "zsh"
  mode: "flow"
  children:
    - id: "zsh-install"
    - id: "zsh-final-notes"
      post: true

- id: "zsh-recovery"
  mode: "multi"
  children:
    - id: "zsh-chsh-reset-bash"
    - id: "zsh-uninstall-apt-remove"
```
