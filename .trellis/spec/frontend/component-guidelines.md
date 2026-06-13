# Component Guidelines

> Terminal UI component conventions for this project.

## Overview

Treat reusable UI pieces as components across both surfaces:

- terminal UI pieces: menu renderers, prompt helpers, banners, and generated bash TUI functions
- developer Studio pieces: Workflow Board sections, React Flow nodes, handles, legends, and canvas layout helpers

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

## Studio Workflow Board Pattern

The developer-side Studio renders `InstallationPlan` through two explicit views:

- React Flow Canvas is the default editing/debugging view. Use it for layout, draft node/edge handoff, dependency visibility, and projection regressions.
- Workflow Board is an explicit reading view. It is normal HTML/CSS, not React Flow, and must be readable at 100% browser zoom.
- Board mode must not require users to infer workflow from visible edge lines. Structure is explained by hierarchy: module section -> step card -> single/multi/post option groups.
- Board data must come from `InstallationPlan` semantic structure edges, not saved canvas positions.
- Board modules should show all top-level tools such as `tmux`, `zsh`, and `ssh` as separate sections.
- Board flow modules should list visible `flow` steps in order. `post` nodes attached inside flow should appear under the owning step's post group.
- Board non-flow modules may list direct `single`, `multi`, and module-level `post` children as steps, so quick-action modules do not hide final notes.
- Board option groups should show `single`, `multi`, `post`, prompt/script flags, and dependency chips locally under the owning step.
- Board nested flows should be summarized by default and expanded on demand in-place.
- React Flow Canvas renders `InstallationPlan` as a left-to-right graph with ordinary draggable nodes.
- Canvas nodes use a left target handle and a right source handle.
- Canvas layout must keep every visible semantic target handle to the right of the source handle; branch nodes may be above or below the parent, but edge routing must not backtrack into the parent card.
- `flow` edges form the main left-to-right spine in Canvas.
- `single` and `multi` edges branch from a parent to selectable options in Canvas.
- Top-level non-flow modules such as quick-action `multi` modules should lay out direct children as a wrapped module grid, not as local options attached tightly to the module card.
- Top-level non-flow module-to-child structure edges should be summarized to a single module-entry edge when full fan-out would create large bus lines; the child nodes stay visible in compact wrapped columns and their local option/post edges remain visible.
- Direct children inside top-level non-flow module grids should stack their local option/post lanes below the child card; do not use the flow-spine pattern where single options sit above the parent.
- Canvas defaults to automatic layout; saved overlay positions are available only through an explicit saved-layout toggle so stale positions do not distort the default view.
- Root-to-module structure edges should be omitted from the default Canvas projection when they create long bus lines; top-level modules remain visible as separate module entries.
- Nested flows should be collapsed in the default Canvas overview and expanded on demand; otherwise complex plugin flows dominate the whole canvas.
- `single` and `multi` options remain ordinary draggable option nodes; do not make option nodes look like workflow frames.
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
