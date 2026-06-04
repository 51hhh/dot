# State Management

> State conventions for CLI menus and generated bash runtime.

## Overview

There is no client-side state library. State is local and explicit:

- TypeScript CLI menu state lives inside `navigate()`.
- Dependency state is derived from `utils/deps.ts`.
- Generated bash runtime state should live in associative arrays.

## State Categories

### Selection state

Tracks user-selected menu ids. Current TypeScript implementation uses `Set<string>`.

### Derived dependency state

Computed from selected ids and the flattened menu graph. Do not store stale copies if it can be derived.

### Runtime prompt state

Future generated `dot.sh` should store prompt answers in a dedicated `DOT_VARS` associative array.

### Execution result state

Future generated `dot.sh` should store per-id status in a dedicated `DOT_RESULTS` associative array.

## When to Use Global State

- Avoid TypeScript module-level mutable state.
- Generated bash may use global associative arrays because bash lacks structured objects, but keep names prefixed and centralized.

## Common Mistakes

- Mutating selection state from rendering code.
- Computing dependency order differently in UI and generator paths.
- Hiding runtime state in temporary files before MVP needs persistence.


## Generated `dot.sh` Runtime State Contract

Generated standalone scripts use bash associative arrays for explicit runtime state:

```bash
declare -A DOT_SELECTED
declare -A DOT_PLAN_ADDED
declare -A DOT_RESULTS
DOT_PLAN=()
DOT_POST_PLAN=()
```

- `DOT_SELECTED[id]=1` means a leaf or branch is selected.
- `DOT_PLAN` is rebuilt after confirmation from selected ids plus dependencies.
- `DOT_POST_PLAN` collects runnable `post` items before they are appended to `DOT_PLAN`.
- `DOT_RESULTS[id]` is one of `ok`, `failed`, or `skipped` after execution.

Do not execute install snippets during selection. The generated flow is collect -> preview plan -> confirm -> execute -> summary.

## Scenario: Generated runtime input source contract

### 1. Scope / Trigger

- Trigger: changing generated bash keyboard, text prompt, number prompt, plan confirmation, pause, or any function that reads user input.
- Applies to `src/generator/standalone/runtime/terminal.ts`, `prompt.ts`, `selection.ts`, `dry-run.ts`, and generated runtime tests.

### 2. Signatures

Generated runtime helpers:

```bash
DOT_INPUT_FD=0 bash generated-test.sh
dot_read_key
dot_read_line <result-var>
dot_require_input_src
```

### 3. Contracts

- Real generated scripts read from `/dev/tty` by default so redirected stdin does not accidentally drive the interactive TUI.
- Generated runtime tests may set `DOT_INPUT_FD=0` and pass input through the test process stdin.
- When `DOT_INPUT_FD` is set, runtime reads must use bash `read -u "$DOT_INPUT_FD"` instead of reopening `/dev/fd/0`; Node `spawnSync({ input })` pipes cannot be reopened reliably as `/dev/fd/0`.
- All key reads must go through `dot_read_key`.
- All full-line reads must go through `dot_read_line`; do not duplicate `read -r ... < "$DOT_INPUT_SRC"` in prompt modules.
- `dot_read_line` must not declare a local variable with the same name as the caller result variable, because bash dynamic scoping can shadow the intended output variable under `set -u`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| No `DOT_INPUT_FD` and `/dev/tty` readable | Runtime reads from `/dev/tty` |
| `DOT_INPUT_FD=0` in tests | Runtime reads from fd 0 with `read -u 0` |
| `DOT_INPUT_FD` is non-numeric | Runtime returns non-zero and prints a clear input source error |
| No input source available | Interactive helper returns non-zero before mutating selection state |
| Text/number prompt receives EOF | Prompt returns non-zero and does not write `DOT_VARS` |

### 5. Good/Base/Bad Cases

- Good: `runGeneratedBash(..., { input: "\n", env: { DOT_INPUT_FD: "0" } })` can select the first menu option in tests.
- Base: a user runs `bash dist/dot.sh < answers.txt`; the interactive TUI still reads from `/dev/tty`.
- Bad: `dot_read_key` reads from stdin directly and consumes piped install data.
- Bad: tests rely on `/dev/fd/0` reopening for `spawnSync({ input })`.
- Bad: prompt functions call `read -r value` directly instead of the shared line-read helper.

### 6. Tests Required

- Assembler runtime test: back keys still work with `DOT_INPUT_FD=0`.
- Assembler runtime test: flow navigation and `endFlow` still work with stdin-injected input.
- Assembler runtime test: text prompts write `DOT_VARS` through `dot_read_line`.
- Generated script check: rebuild `dist/dot.sh` and run `bash -n dist/dot.sh`.

### 7. Wrong vs Correct

#### Wrong

```bash
read -r value < "$DOT_INPUT_SRC"
IFS= read -rsn1 key < /dev/tty
```

#### Correct

```bash
dot_read_line value || return 1
key="$(dot_read_key)" || return 1
```

## Scenario: Generated flow navigation state contract

### 1. Scope / Trigger

- Trigger: changing `mode: "flow"`, `endFlow`, prompt selection, or back/quit behavior in the generated bash runtime.
- Applies to `src/loader/schema.ts`, `src/generator/standalone-assembler.ts`, `configs/*.yaml`, and generated runtime tests.

### 2. Signatures

```yaml
menu:
  - id: "tmux"
    mode: "flow"
    children:
      - id: "tmux-install"
        mode: "single"
        children:
          - id: "tmux-install-recommended"
            endFlow: true
```

Generated runtime helpers:

```bash
dot_run_flow <flow-id>
dot_run_step <flow-id> <step-id> <step-index> <step-total>
dot_choose_single <node-id> <title> [subtitle]
dot_choose_multi <node-id> <title> [subtitle]
dot_is_back_key <key>
```

### 3. Contracts

- `mode: "flow"` means visible child steps are visited in order.
- Hidden children and leaf-only non-interactive steps must not force an extra page when the user goes back.
- A visible flow step with no visible children but with a runnable snippet is an action step: `dot_run_step` must set `DOT_SELECTED[step]=1` and continue without rendering an extra menu.
- `endFlow: true` on a selected single-choice child ends the containing flow immediately and proceeds to plan preview.
- Back keys are `b`, `B`, left-arrow CSI (`\e[D`), SS3 left (`\eOD`), and common modified-left variants.
- Prompt-backed single selections are committed only after the prompt handler succeeds.
- Install snippets are still not executed during flow navigation; navigation only mutates `DOT_SELECTED` and `DOT_VARS`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| User presses back on first flow step | `dot_run_flow` returns `2` to the caller |
| User presses back after a non-interactive leaf step | Runtime returns to the previous interactive step, not the leaf page |
| Flow step has no visible children and has `DOT_SNIPPET_FUNCS[step]` | Runtime marks the step selected and `dot_build_plan` includes it |
| Flow step has no visible children and no snippet | Runtime skips it without adding it to `DOT_SELECTED` |
| User selects an `endFlow` item | Runtime commits the choice and returns `3` from the whole flow |
| Prompt handler returns back/cancel | Runtime does not commit `DOT_SELECTED[choice]` |
| User presses quit | Runtime returns non-zero and top-level `dot_main` aborts cleanly |
| Terminal emits SS3 left arrow | Runtime treats it the same as CSI left arrow |

### 5. Good/Base/Bad Cases

- Good: selecting `tmux-install-recommended` sets `DOT_SELECTED[tmux-install-recommended]=1`, returns `3`, and skips later flow steps.
- Good: the real `tmux-github-mirror` flow action is auto-selected and appears in `DOT_PLAN` after running the tmux flow.
- Base: pressing left from the prefix step returns to the install step and re-renders that interactive page.
- Bad: pressing left returns to a hidden or leaf-only step that immediately advances and makes back appear broken.
- Bad: a failed prompt leaves a stale selected item in `DOT_SELECTED`.
- Bad: a direct flow action is rendered as an empty menu and never reaches `DOT_PLAN`.

### 6. Tests Required

- Assembler test: generated back-key helper recognizes `b`, `B`, CSI left, and SS3 left.
- Assembler runtime test: back inside a flow returns to the previous interactive step.
- Assembler runtime test: `endFlow` propagates from selected leaf to the whole flow with return code `3`.
- Assembler runtime test: direct flow action steps auto-select and appear in `DOT_PLAN`.
- Assembler runtime test: real `configs/dot.yaml` tmux flow includes `tmux-github-mirror` in the generated runtime plan.
- Assembler runtime test: prompt-backed selections only update `DOT_SELECTED` and `DOT_VARS` after prompt success.
- CLI build test: representative config emits `DOT_END_FLOW['<id>']='1'` and the generated runtime handles return code `3`.
- Generated script check: rebuild `dist/dot.sh` and run `bash -n dist/dot.sh`.

### 7. Wrong vs Correct

#### Wrong

```bash
dot_choose_single "$step" "$title" "$subtitle"
choice="$DOT_CHOICE"
dot_select_single_item "$step" "$choice"
dot_record_key_prompt "$choice"
```

#### Correct

```bash
dot_choose_single "$step" "$title" "$subtitle"
result=$?
if [[ "$result" -eq 0 ]]; then
  choice="$DOT_CHOICE"
  dot_record_key_prompt "$choice"
  result=$?
  if [[ "$result" -eq 0 ]]; then
    dot_select_single_item "$step" "$choice"
  fi
fi
```
