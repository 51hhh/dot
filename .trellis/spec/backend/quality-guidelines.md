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
```

Build-time TypeScript API:

```ts
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

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Missing `--config` | Commander/CLI exits non-zero with required option message |
| Unsupported config extension | `loadConfig` throws unsupported format error |
| Duplicate menu id | semantic validation throws before generation |
| Unknown dependency | semantic validation throws before generation |
| Bash-unsafe id | standalone assembler throws `not shell-safe` |
| Generated bash syntax invalid | `validateScript` reports `bash -n` failure and build exits non-zero |

### 5. Good/Base/Bad Cases

- Good: `node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh --quiet` creates a valid self-contained script.
- Base: generated script contains `dot_navigate()`, `DOT_CHILDREN['__root']`, and `dot_main "$@"`.
- Bad: an id like `bad.id` is rejected instead of producing an invalid bash function or associative-array key.

### 6. Tests Required

- Unit: `assembleStandalone` emits runtime, root menu data, snippets, and entrypoint.
- Unit: `bashFunctionNameForId` removes unsafe characters and avoids `-` in function names.
- Unit: unsafe ids throw before output is written.
- CLI: `dot build --config ... --output ... --quiet` writes a standalone script.
- Integration: generated `dist/dot.sh` passes `bash -n`.

### 7. Wrong vs Correct

#### Wrong

```ts
// Runtime script still reads templates/configs from the repo.
sections.push(`source templates/tmux/header.sh`);
```

#### Correct

```ts
// Runtime script contains generated snippet functions.
sections.push(`${func}() {`);
sections.push(renderedTemplateContent);
sections.push("}");
```
