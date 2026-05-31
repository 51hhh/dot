# Directory Structure

> Project-specific module organization for the `dot` TypeScript CLI/generator.

## Overview

`dot` is a single-package TypeScript CLI. It loads YAML/JSON configs, validates menu graphs, renders shell templates, and generates bash scripts.

The project should keep a one-way data flow:

```text
config file -> loader/schema -> dependency graph -> generator -> validator/output
```

Avoid making low-level generator modules depend on CLI/menu presentation code.

## Directory Layout

```text
src/
├── index.ts              # CLI entry point and command wiring
├── loader/               # config parsing, Zod schema, semantic validation
├── utils/                # graph/dependency helpers and shared utilities
├── generator/            # template rendering, script assembly, shell validation
└── menu/                 # developer-side interactive CLI menu

configs/                  # example YAML configs
templates/                # shell snippets referenced by configs
tests/                    # unit, CLI, and integration tests
```

For the self-contained `dot.sh` MVP, prefer adding generator-specific modules under `src/generator/` rather than mixing generated bash runtime logic into `src/index.ts`.

Recommended future generator layout:

```text
src/generator/
├── standalone-assembler.ts
├── bash-runtime.ts
├── bash-data.ts
├── template.ts
└── validator.ts
```

## Module Responsibilities

### `src/index.ts`

- Define CLI commands and options.
- Load config.
- Call generator functions.
- Handle top-level errors and process exit codes.

Do not put graph traversal, template rendering, or bash serialization logic here.

### `src/loader/`

- Own config schema.
- Validate structural and semantic correctness.
- Reject invalid ids, duplicate ids, unknown deps, and invalid `post` relationships.

### `src/utils/`

- Own reusable graph helpers such as flattening nodes, dependency resolution, topological sorting, and leaf expansion.
- Keep these helpers pure and easy to unit test.

### `src/generator/`

- Own all shell generation logic.
- Keep build-time template rendering separate from generated runtime bash logic.
- Validate generated scripts with `bash -n`.

### `src/menu/`

- Current Node.js interactive menu only.
- Do not reuse it directly inside generated `dot.sh`; generated scripts need their own bash TUI runtime.

## Naming Conventions

- TypeScript files use kebab-case for new multi-word modules.
- Exported TypeScript functions use camelCase.
- YAML ids should remain stable and shell-safe: letters, digits, `_`, `-`.
- Generated bash function names must be derived from ids with safe escaping, e.g. `tmux-plugin-yank` -> `dot_run_tmux_plugin_yank`.

## Common Mistakes

- Do not duplicate dependency resolution differently across modules without tests.
- Do not make generated scripts depend on local template files at runtime.
- Do not add external runtime dependencies for MVP generated scripts.
- Do not resolve relative template paths from the process CWD; resolve from the config file directory.
