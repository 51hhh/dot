# Workflow/action structure standard

## Goal

Optimize the current script flow architecture without a large rewrite. The goal is to keep the existing `single` / `multi` / `flow` / `post` runtime model, then add a stricter authoring standard and lightweight diagnostics so future zsh, tmux, ssh, and one-shot scripts are easier to adjust and debug.

## Current architecture

The current source and runtime pipeline is:

```text
configs/dot.yaml
  -> loadConfig + validateConfigSemantics
  -> buildInstallationPlan
  -> Studio projection / plan rendering / standalone data serialization
  -> generated dot.sh runtime
```

Important current contracts:

- `flow`: visible, non-hidden, non-post children form a linear wizard spine.
- `single`: children are mutually exclusive options.
- `multi`: children are independent checkbox-style options.
- `post`: step executes after normal steps and does not advance a flow spine.
- `deps`: execution prerequisite/order edge.
- `hidden`: internal dependency, available to execution but not shown in menus.
- `endFlow`: a selected single-choice leaf can stop the containing flow early.
- Noninteractive `--dry-run-plan` / `--run-plan` rejects selecting a branch that contains an explicit multi-option `single` group.

The current real tools are modeled as:

- `tmux`: top-level `flow`, good fit for a sequential setup wizard.
- `zsh`: top-level `flow`, good fit for setup but currently includes recovery/uninstall in the middle of the install flow.
- `ssh`: top-level `multi`, but this is risky in the generated standalone runtime because top-level non-`flow` groups are selected as a whole subtree.

## Key findings

### 1. No large refactor is needed

The current primitives are enough for the near-term product shape:

- one-click install/configuration workflows
- custom path selection through `single`
- optional addon selection through `multi`
- final notes / cleanup through `post`
- internal required setup through `hidden` + `deps`
- recommended shortcut through `endFlow` + `deps`

The main missing piece is not a new execution engine. The missing piece is a stable authoring standard and validation that prevents misuse of these primitives.

### 2. Top-level non-flow groups are risky

In the standalone runtime, the root menu always uses `dot_choose_single "__root"`. After choosing a top-level item:

- if the chosen item is `flow`, the runtime calls `dot_run_flow`.
- otherwise, the runtime calls `dot_select_single_item "__root" "$task"`, which selects all leaves under that top-level subtree.

That means a top-level `multi` or `single` group with nested options can accidentally select mutually exclusive leaves together.

This is especially important for `ssh`, because it is currently top-level `mode: "multi"` and contains nested single groups such as install/skip, key type choices, authorized key import choices, fail2ban install/skip, and firewall install/skip.

### 3. Prompted leaves inside multi groups are not prompted interactively

Prompt handling currently happens in the `single` branch of `dot_run_step`. A selected `multi` item only toggles selection; it does not run `text` / `number` / `key` prompts while selecting.

Current examples:

- `ssh-hardening > ssh-custom-port` has `prompt.type: number`.
- `ssh-hardening > ssh-limit-users` has `prompt.type: text`.

These options are selectable inside a `multi` group, but the standalone interactive runtime does not ask for their prompt values during multi selection. They fall back to defaults or empty vars.

### 4. Recovery/uninstall needs a fixed placement rule

Recovery actions belong to the same tool project, but they should not be mixed into the normal install path without clear intent.

With the current runtime there is no conditional branch/goto primitive. A flow is linear. Therefore a recovery section inside a main setup flow is always a visible step users pass through.

This is acceptable only if:

- it is clearly labeled optional;
- default action is to select nothing and continue;
- destructive choices require their own confirmation;
- it does not imply recovery will run automatically.

### 5. The old Node CLI menu is weaker than the standalone runtime

`src/menu/navigator.ts` also selects all leaves when a branch node is selected. It does not understand the richer standalone flow wizard behavior. The self-contained `dot.sh` should remain the main UX target. Future architecture rules should avoid relying on the old CLI menu semantics for complex flows.

## Recommended low-refactor structure

Do not introduce first-class runtime `workflow` / `action` types yet. Keep the current source DSL and define a stricter semantic standard on top:

```yaml
mode: flow    # ordered phase wizard
mode: single  # exactly one option from a set
mode: multi   # independent optional actions only
post: true    # final notes / cleanup only
hidden: true  # internal dependency only
deps: [...]   # execution prerequisite/order
endFlow: true # shortcut/preset leaf only
```

Use documentation and validation first. Only after the standard stabilizes should we consider optional metadata like `role`, `risk`, or `phase`.

## Fixed flow standard

### Top-level tool rule

Any top-level item with multiple user-facing steps must be `mode: "flow"`.

Allowed top-level shapes:

```yaml
# Good: complex tool workflow
- id: "zsh"
  mode: "flow"
  children: [...]

# Good: single one-shot action
- id: "diagnose"
  script: "../templates/diagnose.sh"

# Avoid: top-level multi/single group with nested options
- id: "ssh"
  mode: "multi"
  children: [...]
```

If a top-level group is not `flow`, it should either be a leaf script or a deliberate preset with no explicit nested single-choice groups.

### Flow phase rule

A tool flow should be written as ordered phases. Recommended phase order:

```text
diagnose
  -> install / prerequisite
  -> source / mirror / framework
  -> components / plugins
  -> config write / patch
  -> enable / default shell / service
  -> optional recovery / cleanup
  -> final notes
```

Not every tool needs every phase. The important rule is that a `flow` child represents a user-visible phase, not an arbitrary implementation detail.

### Single-choice rule

Use `single` only when exactly one path should be chosen.

Examples:

- install via apt vs skip because already installed
- Powerlevel10k GitHub vs Gitee vs skip
- SSH key type ed25519 vs RSA vs skip
- authorized keys from file vs GitHub vs skip

Standards:

- optional single groups should include a `skip` option;
- skip options should verify current state when needed, not silently do nothing;
- single choices should not be hidden dependencies;
- do not use `single` for steps that could safely compose.

### Multi-choice rule

Use `multi` only for independent additive actions.

Good:

- install multiple tmux plugins
- apply several independent sshd hardening options
- install several zsh plugins

Avoid:

- mutually exclusive alternatives
- steps requiring ordered branching
- destructive recovery groups without confirmation
- prompted actions unless runtime prompt handling for multi is added

For now, prompted actions should be modeled as `single` phases or direct `flow` phases, not as leaves inside `multi`.

### Post rule

Use `post: true` only for finalization or notes:

- final instructions
- cleanup
- plugin manager finalize after declarations

Avoid using `post` to express branching or presets. The existing `tmux-install-recommended` shortcut can stay for compatibility, but new shortcut semantics should be documented as a preset pattern.

### Dependency rule

Use `deps` for prerequisites and execution ordering only.

Good:

- `tmux-plugin-catppuccin` depends on `tmux-tpm` and font setup.
- plugin finalization depends on plugin manager installation.

Avoid:

- using dependency edges to imply visible navigation order;
- depending on a `post` node from a non-post node;
- using `deps` as a hidden conditional-flow mechanism.

### Hidden rule

Use `hidden: true` for internal supporting actions:

- config file initialization
- font setup needed by a selected theme
- prerequisite helper steps

Hidden nodes must be safe, idempotent, and reachable through explicit dependencies.

### Preset shortcut rule

Recommended one-click shortcuts should be explicit leaf actions with `endFlow: true`, and they must include all required dependencies through `deps`.

Example shape:

```yaml
- id: "tmux-install-recommended"
  label: "安装推荐 tmux 配置"
  script: "../templates/tmux/install-recommended.sh"
  deps:
    - "tmux-install-apt"
    - "tmux-github-mirror"
    - "tmux-tpm"
    - "tmux-font-jetbrainsmono"
  post: true
  endFlow: true
```

This is a pragmatic current-model solution. Long term, a dedicated `preset` metadata field would be clearer, but it is not required now.

## Suggested fixed tool shapes

### Tmux

Keep as `flow`.

Current shape is mostly healthy:

```text
install -> github mirror -> prefix -> plugins -> status -> options -> finalize
```

Low-risk improvements:

- document `tmux-install-recommended` as a preset shortcut;
- keep plugin manager initialization as `post`;
- keep hidden setup nodes only as dependencies.

### Zsh

Keep as `flow`, but standardize recovery semantics.

Recommended no-runtime-change shape:

```text
diagnose
  -> optional recovery / cleanup
  -> install
  -> oh-my-zsh
  -> theme
  -> plugins
  -> zshrc
  -> default shell
  -> final notes
```

Reasoning:

- Recovery stays under the same Zsh project.
- It is visibly optional.
- It can be used to clean a broken environment before reinstalling.
- It avoids pretending that the current runtime can conditionally branch into a separate recovery wizard.

If this feels awkward in UX, the next step is not a full rewrite; it is a small, explicit runtime feature for nested scenario flows. That should be a separate task.

### SSH

Change the authoring standard so SSH is modeled as a `flow`, not top-level `multi`.

Recommended shape:

```text
diagnose
  -> install
  -> host key
  -> client key
  -> authorized keys
  -> hardening
  -> fail2ban
  -> firewall
  -> client config
  -> final notes
```

Where:

- `install`, `host key`, `client key`, `authorized keys`, `fail2ban`, `firewall` are `single`.
- `hardening` can stay `multi` only for independent no-prompt hardening toggles.
- prompted hardening items should become `single` phases or direct flow phases unless multi prompt support is added.

This is a config-level migration plus tests, not a generator rewrite.

### One-shot scripts

One-shot actions should be direct leaf scripts under a clear group, or top-level leaf entries if they are standalone enough.

Recommended shape:

```yaml
- id: "diagnose-system"
  label: "诊断系统环境"
  script: "../templates/system/diagnose.sh"
```

If a category contains many one-shot actions, make the category a `flow` with a single `multi` phase:

```yaml
- id: "maintenance"
  label: "维护工具"
  mode: "flow"
  children:
    - id: "maintenance-actions"
      label: "选择维护动作"
      mode: "multi"
      children:
        - id: "cleanup-cache"
          script: "../templates/maintenance/cleanup-cache.sh"
```

This avoids top-level non-flow subtree selection.

## Diagnostics to add before behavior changes

The best next implementation is a linter/diagnostic layer, not a runtime refactor.

Recommended diagnostics:

1. Error: top-level non-flow group has visible children and explicit nested single-choice groups.
2. Warning: top-level non-flow group has any children; recommend `mode: flow`.
3. Error or warning: `multi` group contains prompt leaves.
4. Warning: `post` node has `endFlow` unless explicitly allowed as a preset compatibility pattern.
5. Warning: `flow` contains a recovery/uninstall phase between install and main config phases without an `optional` label/description.
6. Warning: `single` group lacks a `skip` option when its description says optional.
7. Error: dependency edge points to unknown id or non-post depends on post, preserving current behavior.
8. Warning: hidden node has no incoming dependency.

These can be emitted through existing plan diagnostics first. No generated bash behavior needs to change for phase 1.

## Debug strategy

Use a stable path debug ladder:

1. `dot plan --config configs/dot.yaml` for graph shape.
2. `dot plan --format json` for machine-checkable edges and node modes.
3. `bash dist/dot.sh --dry-run-plan --select <concrete ids...>` for execution plan ordering.
4. Runtime interaction tests only for changed selection behavior.
5. Docker smoke only when template execution behavior changes.

Add small scenario fixtures for authoring standards:

- flow with direct action + single + multi + post
- top-level non-flow group with nested single choice
- multi group with prompt leaf
- preset shortcut with `endFlow`
- recovery group with destructive actions

## Studio draft editor boundary

Studio can now be used as a structure sketching tool before committing to YAML changes.

Allowed draft operations:

- add node
- update node label/description/mode/post/hidden
- remove node
- add edge with explicit `single` / `multi` / `flow` / `dependency` / `post` type
- remove edge

Persistence boundary:

- `Save layout` remains positions-only and must not write semantic structure.
- Draft-only nodes must not be saved to the sidecar plan overlay.
- `dependency` draft edges may appear in `overlayPatchDraft`, but final behavior still needs build/plan/generator consistency.
- Node operations and `single` / `multi` / `flow` / `post` edge operations are source-only handoff items and must be applied to `configs/dot.yaml` by an agent with tests.

Workflow:

```text
User edits Studio draft
  -> export prompt with nodeOperations + changedOperations
  -> agent edits real YAML/config/tests
  -> build/plan/generator verification
```

This keeps Studio useful for describing intent without turning it into a direct source editor too early.

## Phased plan

### Phase 0: Standard only

- Keep current schema and runtime.
- Write the flow authoring standard.
- Use it for new scripts manually.

### Phase 1: Diagnostics

- Add semantic validation / plan diagnostics for risky shapes.
- Do not fail existing config immediately unless the issue can cause wrong execution.
- Add tests for each diagnostic.

### Phase 2: Config cleanup

- Convert SSH top-level structure to a `flow`.
- Move or relabel Zsh recovery as optional cleanup/recovery.
- Move prompted SSH multi actions into prompt-capable phases or add prompt support.

### Phase 3: Optional metadata

Only after the standards are stable, consider metadata such as:

```yaml
role: "workflow" | "phase" | "action" | "preset"
risk: "read" | "user-write" | "system-write" | "destructive"
optional: true
```

This metadata should not drive execution at first. It should drive diagnostics, Studio labels, and docs.

### Phase 4: Conditional scenario flows

Only if the UX still feels bad, add a small explicit scenario-flow feature. This is the first point where runtime behavior meaningfully changes and should be treated as a separate refactor.

## Recommendation

Choose the conservative path:

1. Keep `single/multi/flow/post/deps/hidden/endFlow`.
2. Define the authoring standard.
3. Add diagnostics for dangerous structures.
4. Fix current config violations, especially top-level SSH `multi` and prompt leaves inside `multi`.
5. Defer `workflow/action` as runtime types.

This gives better generation quality, easier path adjustment, and lower debug cost without rewriting the execution model.
