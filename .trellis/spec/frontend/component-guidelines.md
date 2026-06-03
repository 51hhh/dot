# Component Guidelines

> Terminal UI component conventions for this project.

## Overview

Treat reusable UI pieces as components across both surfaces:

- terminal UI pieces: menu renderers, prompt helpers, banners, and generated bash TUI functions
- developer Studio pieces: React Flow nodes, handles, legends, and canvas layout helpers

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

## Plan Canvas Pattern

The developer-side Studio renders `InstallationPlan` as a left-to-right graph:

- Nodes use a left target handle and a right source handle.
- `flow` edges form the main left-to-right spine.
- `single` and `multi` edges branch from a parent to selectable options.
- `dependency` edges are auxiliary and must not drive automatic layout.
- `post` edges are visually distinct from normal structure and execution remains post-ordered.
- Keep a compact legend in the toolbar or canvas area; do not reintroduce a right inspector for basic edge meaning.
- Keep Plan Canvas cards at 8px radius unless a shared design system changes that rule.
- Fully expanded Plan Canvas graphs must support low-zoom overview; keep React Flow `minZoom` at or below `0.05` unless another whole-graph overview exists.

Edge colors are part of the visual contract:

| Edge | Meaning | Color |
|------|---------|-------|
| `single` | exclusive branch | `#38bdf8` |
| `multi` | selectable group branch | `#34d399` |
| `flow` | linear process step | `#a78bfa` |
| `dependency` | execution dependency | `#fb7185` |
| `post` | post-execution item | `#facc15` |

## Accessibility / Terminal Compatibility

- Provide numeric fallback or clear key hints where possible.
- Restore cursor visibility on exit.
- Avoid requiring mouse support.
- Avoid external TUI tools for MVP.

## Common Mistakes

- Mixing menu rendering with graph/dependency logic.
- Leaving terminal cursor hidden after Ctrl-C.
- Printing extra text in modes intended to produce machine-consumable script output.
- Driving Studio layout from legacy `child` edges instead of `single` / `multi` / `flow` / `post` structure edges.
