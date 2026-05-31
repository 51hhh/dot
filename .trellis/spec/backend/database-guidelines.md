# Database Guidelines

> Database and persistence conventions for this project.

## Overview

This project currently has no database, ORM, migrations, or persistent backend storage. `dot` is a local TypeScript CLI/generator that reads config files and shell templates from disk.

## Current Persistence Boundaries

The only persistent inputs/outputs are files:

- Config inputs: `configs/*.yaml` or `.json`, loaded in `src/loader/loader.ts`.
- Template inputs: `templates/**/*.sh`, loaded in `src/generator/template.ts`.
- Generated outputs: shell scripts written from `src/index.ts`.
- Temporary validation files: created by `src/generator/validator.ts` via `fs.mkdtempSync` and removed in `finally`.

## File Handling Rules

- Resolve config paths with `path.resolve`.
- Resolve template paths relative to the config file directory, not the process CWD.
- Check file existence at boundaries and throw actionable errors.
- Use temporary directories created by `fs.mkdtempSync` for generated validation artifacts.

## Naming Conventions

- Config files live under `configs/` and should use stable ids.
- Template snippets live under `templates/<domain>/`.
- Generated output defaults to config-defined `output.dir` and `output.filename`.

## Common Mistakes

- Do not introduce database assumptions into this project.
- Do not store runtime state in hidden global files for MVP generated scripts.
- Do not rely on the caller's current working directory for config-relative assets.
