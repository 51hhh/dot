# Component Guidelines

> Terminal UI component conventions for this project.

## Overview

There are no React/Vue components. Treat reusable terminal UI pieces as “components”: menu renderers, prompt helpers, banners, and generated bash TUI functions.

## Current Menu Component Pattern

`src/menu/render.ts` exposes `renderMenu(...)`, which:

- receives plain menu data and selection state
- renders one menu level
- returns a structured action (`select`, `enter`, `back`, `quit`, `confirm`)

Keep UI rendering functions focused on presentation and input parsing. Do not embed dependency resolution or script generation inside them.

## Generated Bash TUI Pattern

The self-contained `dot.sh` MVP should generate generic bash TUI helpers for:

- single-select menus
- checkbox multi-select menus
- back/quit/confirm actions
- cursor cleanup traps

Domain-specific labels and ids should be generated as data, not hardcoded into runtime helpers.

## Accessibility / Terminal Compatibility

- Provide numeric fallback or clear key hints where possible.
- Restore cursor visibility on exit.
- Avoid requiring mouse support.
- Avoid external TUI tools for MVP.

## Common Mistakes

- Mixing menu rendering with graph/dependency logic.
- Leaving terminal cursor hidden after Ctrl-C.
- Printing extra text in modes intended to produce machine-consumable script output.
