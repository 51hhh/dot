# Architecture

`dot` is a single-package TypeScript CLI and generator. Its core contract is a
one-way pipeline:

```text
Config -> Overlay -> Plan -> Build
```

## Pipeline

### Config

Config files live under `configs/` and are loaded from YAML or JSON. The loader
owns structural parsing, Zod validation, and semantic checks such as duplicate
ids, unknown dependencies, and invalid post-step relationships.

Shell snippets referenced by `script` fields are resolved relative to the config
file, not from the process working directory.

### Overlay

Studio and other tools may write a sidecar plan overlay next to the config:

```text
configs/dot.yaml -> configs/dot.plan.json
```

The overlay is external input and is validated at the file boundary. It may
carry:

- `positions`: Studio-only canvas coordinates.
- `disabled`: node ids forced to `hidden: true`.
- `overrides`: safe overrides for `label`, `description`, `hidden`, `post`, and
  non-root `mode`.

Overlay data must not change executable snippet source. Fields such as `script`,
`deps`, and `vars` are ignored if they appear in overlay JSON.

When `dot build` sees a sidecar overlay, it applies the safe fields to the loaded
config and then runs semantic validation again before generation.

### Plan

`dot plan` builds an `InstallationPlan` graph from the config:

- `nodes` describe root, group, prompt, and action nodes.
- `edges` separate structure edges (`single`, `multi`, `flow`, `post`) from
  auxiliary `dependency` edges.
- `execution.normalSteps` contains normal runnable steps.
- `execution.postSteps` contains steps that run after normal work.
- `diagnostics` report graph concerns for tooling and review.

Flow structure should follow visible, non-hidden, non-post steps. Hidden nodes
and post nodes may still participate in dependencies and execution but should
not advance the visible flow spine.

### Build

`dot build` assembles a standalone Bash runtime into `dist/dot.sh` by default.
The generated script must include:

- Bash shebang.
- Pure Bash TUI runtime.
- Menu metadata arrays.
- Dependency and post-step metadata arrays.
- Rendered snippet functions for runnable menu items.
- Planner and executor entrypoint.

The built script must not require Node.js, npm, project config files, or template
files at runtime.

## Module Ownership

```text
src/index.ts      CLI command definitions and top-level error handling.
src/loader/       Config schema, parsing, and semantic validation.
src/utils/        Pure graph/dependency helpers.
src/generator/    Template rendering, standalone assembly, shell validation.
src/planner/      InstallationPlan graph, overlays, renderers, validation.
src/menu/         Legacy developer-side interactive menu.
src/studio/       Local Plan Canvas server and React UI.
```

Low-level generator modules should not depend on menu or Studio presentation
code. Shared graph behavior should live in `src/utils/` or `src/planner/` with
focused tests.

## Public CLI Surface

```bash
dot build --config <path> [--output <path>] [--quiet]
dot plan --config <path> [--format text|json] [--write <path>]
dot studio --config <path> [--port <port>]
```

The hidden `generate` command remains as a compatibility path for the older
Node-driven interactive generator. New release work should use `build`.

## Data Safety Rules

- Validate external files at boundaries: config files, plan overlays, and output
  shell syntax.
- Re-run config semantic validation after applying build-relevant overlay data.
- Keep generated Bash ids and function names shell-safe.
- Keep generated `dot.sh` self-contained.
- Do not duplicate dependency resolution or topological sorting logic in
  unrelated modules.
