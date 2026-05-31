# Directory Structure

> Terminal UI and generated-script user-interface organization for this project.

## Overview

This project has no web frontend. “Frontend” means the user-facing CLI/menu layer:

- current Node.js interactive menu under `src/menu/`
- terminal colors/banner under `src/utils/colors.ts`
- future generated bash TUI runtime inside standalone `dot.sh`

## Directory Layout

```text
src/menu/
├── navigator.ts   # menu traversal and selection state
├── render.ts      # current readline-based menu rendering
└── tree.ts        # menu tree helpers

src/utils/colors.ts # CLI color and banner helpers
src/generator/      # future generated bash TUI runtime templates
```

## Module Organization

- Keep Node.js CLI interaction in `src/menu/`.
- Keep generated bash TUI runtime templates in `src/generator/`, not `src/menu/`.
- Keep CLI presentation separate from dependency resolution in `src/utils/deps.ts`.

## Naming Conventions

- Menu item ids come from YAML and must remain stable.
- Labels and descriptions are user-facing text and may be Chinese.
- Generated bash TUI functions should use a `dot_` prefix.

## Examples

- `src/menu/navigator.ts` owns navigation state and auto dependency display.
- `src/menu/render.ts` owns readline parsing and menu rendering.
- `src/utils/colors.ts` owns terminal color formatting.
