# Quality Guidelines

> Code quality standards for the `dot` TypeScript CLI/generator.

## Required Checks

Before reporting implementation complete, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For generated scripts, also run:

```bash
bash -n dist/dot.sh
```

When the change affects generated runtime behavior, run a Docker smoke test in a clean Ubuntu container.

## Required Patterns

- Keep data flow one-way: config -> validation -> graph/deps -> generator -> output.
- Validate at boundaries: config input, CLI options, template paths, generated shell syntax.
- Prefer pure functions for graph and serialization logic.
- Keep generated bash runtime templates centralized under `src/generator/`.
- Add tests when changing dependency resolution, schema validation, template rendering, shell escaping, or generated output format.

## Testing Requirements

### Unit tests

Required for:

- schema/semantic validation
- dependency resolution
- topological sorting
- branch-to-leaf expansion
- shell quoting/escaping
- bash-safe id/function serialization

### CLI/integration tests

Required when changing:

- CLI flags or commands
- generated output paths
- build behavior
- quiet/dry-run behavior

### Generated script tests

For the self-contained MVP:

- golden/snapshot tests for generated `dot.sh`
- `bash -n` validation for generated fixtures
- Docker smoke tests for clean Linux compatibility

## Forbidden Patterns

- Do not duplicate graph traversal logic in multiple places without shared tests.
- Do not resolve config-relative files from the process CWD.
- Do not introduce external runtime dependencies into generated `dot.sh` for MVP.
- Do not add feature flags or compatibility shims unless the user explicitly asks.
- Do not add comments that merely restate what the code says.

## Code Review Checklist

- [ ] Config schema and semantic validation match the new behavior.
- [ ] Existing tests still pass.
- [ ] New generated bash is syntax-checked with `bash -n`.
- [ ] Generated script is self-contained.
- [ ] Shell variables and generated function names are escaped safely.
- [ ] Dependency order and `post` behavior are deterministic.
- [ ] Error messages tell the user what to fix.


## Scenario: Self-contained `dot.sh` build contract

### 1. Scope / Trigger

- Trigger: new public CLI command and generated-script contract.
- Applies when changing `dot build`, `src/generator/standalone-assembler.ts`, generated bash runtime data, dependency planning, or generated script validation.

### 2. Signatures

```bash
dot build --config <path> [--output <path>] [--quiet]
node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh --quiet
bash dist/dot.sh --dry-run-plan --select <ids...>
bash dist/dot.sh --run-plan --select <ids...>
```

Build-time TypeScript API:

```ts
planOverlayPathForConfig(configPath: string): string
loadPlanOverlay(planPath: string): PlanOverlay | null
applyPlanOverlayToConfig(config: Config, overlay: PlanOverlay | null): Config
validateConfigSemantics(config: Config): void

assembleStandalone(opts: {
  config: Config;
  configPath: string;
  allNodes?: Map<string, MenuItem>;
  warnings?: string[];
}): string
```

### 3. Contracts

- `--config` is required and points to YAML/JSON accepted by `loadConfig`.
- `--output` defaults to `dist/dot.sh` and resolves from the current working directory for `dot build`.
- If `<config-basename>.plan.json` exists next to the config file, `dot build` must load it before assembly.
- Sidecar plan overlays are external input and must be validated with Zod at the file boundary.
- Build-time overlay changes may only affect safe config fields: `label`, `description`, `hidden`, `post`, and non-`root` `mode`; `positions` are Studio-only and must not affect build output.
- Overlay `disabled` entries force matching config nodes to `hidden: true` and win over `hidden: false` overrides.
- After applying an overlay to config, run `validateConfigSemantics(config)` again before flattening nodes or assembling the standalone script.
- Generated output must be a single bash file with no runtime dependency on Node.js, npm, project configs, or template files.
- Generated output must contain:
  - bash shebang
  - pure bash TUI runtime
  - menu metadata arrays
  - dependency/post metadata arrays
  - snippet functions for runnable menu items
  - execution planner and executor
- Generated script ids must be shell-safe: only letters, digits, `_`, and `-`.
- Generated function names must normalize ids and include a stable suffix to avoid collisions.
- Generated `dot.sh --dry-run-plan --select <ids...>` must be noninteractive: select the requested ids, expand branch ids to runnable leaves, include dependencies through the same runtime planner used by interactive execution, print the resolved plan, and exit before running snippets.
- Dry-run plan output must show normal steps before post steps, and must include ids so CI can assert dependency and post ordering without localized label coupling.
- Generated `dot.sh --run-plan --select <ids...>` must be noninteractive: select the requested ids, expand branch ids to runnable leaves, include dependencies through the same runtime planner used by interactive execution, execute snippets inside the standalone runtime helper environment, print a summary, and exit non-zero if any planned step fails or is skipped.
- `DOT_RUN_PRESET="<ids...>"` is an integration-test hook for generated standalone scripts. When no CLI args are provided, the runtime must treat it like `--run-plan --select <ids...>` so Docker smoke tests can execute selected snippets without driving the TUI.
- Docker smoke generation must build a full standalone script and inject `DOT_RUN_PRESET`; it must not use the legacy `dot --dry-run --select` snippet output because snippets can rely on runtime helpers such as `dot_sudo`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Missing `--config` | Commander/CLI exits non-zero with required option message |
| Unsupported config extension | `loadConfig` throws unsupported format error |
| Duplicate menu id | semantic validation throws before generation |
| Unknown dependency | semantic validation throws before generation |
| Invalid sidecar overlay shape | `loadPlanOverlay` throws `Invalid plan overlay ...` before generation |
| Overlay creates a non-post dependency on a post item | `validateConfigSemantics` throws and no output file is written |
| Overlay contains unsafe fields such as `script` | Field is stripped/ignored and cannot change snippet source |
| Bash-unsafe id | standalone assembler throws `not shell-safe` |
| Generated bash syntax invalid | `validateScript` reports `bash -n` failure and build exits non-zero |
| Generated `--dry-run-plan` receives an unknown id | Script exits non-zero and reports `Unknown menu item id` without running snippets |
| Generated `--dry-run-plan` receives no selection | Script exits non-zero and prints usage without entering the interactive TUI |
| Generated `--run-plan` receives an unknown id | Script exits non-zero and reports `Unknown menu item id` without running snippets |
| Generated `--run-plan` receives a snippet failure | Script prints the summary and exits non-zero so Docker/CI fail |
| Docker smoke generation uses legacy `dot --dry-run --select` snippet output | Invalid: generated snippets may call standalone runtime helpers that are absent from the legacy snippet-only script |

### 5. Good/Base/Bad Cases

- Good: `node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh --quiet` creates a valid self-contained script.
- Good: `bash dist/dot.sh --dry-run-plan --select tmux-plugin-resurrect tmux-tpm-finalize` prints `tmux-header` and `tmux-tpm` before `tmux-plugin-resurrect`, then prints post steps after normal steps.
- Good: `bash dist/dot.sh --run-plan --select feature` executes `feature` and its dependencies inside the generated runtime and returns non-zero if any step fails.
- Good: `configs/dot.plan.json` can hide a node or override its label, and the generated `DOT_HIDDEN` / `DOT_LABELS` metadata reflects that change.
- Base: generated script contains `dot_navigate()`, `DOT_CHILDREN['__root']`, and `dot_main "$@"`.
- Bad: an id like `bad.id` is rejected instead of producing an invalid bash function or associative-array key.
- Bad: sidecar JSON is cast to `PlanOverlay` without validation.
- Bad: an overlay changes `post` behavior without rerunning dependency/post semantic validation.
- Bad: an overlay can replace a node `script` path and silently change executed code.
- Bad: Docker smoke writes a selected snippet-only script with `dot --dry-run --select`; this bypasses standalone runtime helpers and can fail with `dot_sudo: command not found`.

### 6. Tests Required

- Unit: `assembleStandalone` emits runtime, root menu data, snippets, and entrypoint.
- Unit: `bashFunctionNameForId` removes unsafe characters and avoids `-` in function names.
- Unit: unsafe ids throw before output is written.
- Unit: invalid plan overlay field types are rejected at `loadPlanOverlay`.
- CLI: `dot build --config ... --output ... --quiet` writes a standalone script.
- CLI: sidecar overlay affects generated build metadata for safe fields.
- CLI: overlay-created dependency/post conflicts fail before writing output.
- CLI: generated script `--dry-run-plan --select ...` prints dependency-expanded normal steps before post steps and does not print snippet command output.
- CLI: generated script `--run-plan --select ...` executes dependency-expanded snippets in order and returns non-zero on failed/skipped steps.
- Integration: generated `dist/dot.sh` passes `bash -n`.
- Integration: Docker smoke builds a full standalone script, injects `DOT_RUN_PRESET`, and validates real tmux installation/configuration in Ubuntu.

### 7. Wrong vs Correct

#### Wrong

```ts
// Runtime script still reads templates/configs from the repo.
sections.push(`source templates/tmux/header.sh`);
```

```ts
// Overlay JSON is trusted and can bypass config validation.
const overlay = JSON.parse(fs.readFileSync(path, "utf-8")) as PlanOverlay;
const config = applyPlanOverlayToConfig(loadConfig(configPath), overlay);
```

```ts
// Docker smoke uses snippet-only dry-run output, so runtime helpers are missing.
const script = execFileSync(process.execPath, [cliPath, "--select", ...ids, "--dry-run"]);
```

#### Correct

```ts
// Runtime script contains generated snippet functions.
sections.push(`${func}() {`);
sections.push(renderedTemplateContent);
sections.push("}");
```

```ts
const loadedConfig = loadConfig(configPath);
const overlay = loadPlanOverlay(planOverlayPathForConfig(configPath));
const config = applyPlanOverlayToConfig(loadedConfig, overlay);
validateConfigSemantics(config);
```

```ts
// Docker smoke executes snippets through the full standalone runtime.
execFileSync(process.execPath, [cliPath, "build", "--config", configPath, "--output", outputPath, "--quiet"]);
injectDotRunPreset(outputPath, ids);
```
