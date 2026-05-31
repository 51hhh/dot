# Hook Guidelines

> Stateful terminal interaction conventions for this project.

## Overview

This project does not use React hooks. The equivalent stateful interaction logic lives in menu navigation and future generated bash TUI loops.

## Current Stateful Pattern

`src/menu/navigator.ts` owns:

- selected ids
- breadcrumb/path stack
- auto dependency display state
- loop-based navigation

`src/menu/render.ts` should remain a renderer/input parser and return actions rather than mutating global state.

## Generated Bash Runtime Pattern

For standalone `dot.sh`, state should be explicit:

```bash
declare -A DOT_SELECTED
DECLARE -A DOT_VARS
DECLARE -A DOT_RESULTS
```

Avoid hidden global mutations outside well-named runtime helpers.

## Naming Conventions

- Use action-oriented names for state transitions, e.g. `dot_toggle_selected`, `dot_collect_prompts`, `dot_build_execution_plan`.
- Keep generated runtime helper names prefixed with `dot_`.

## Common Mistakes

- Recursive prompt loops that can grow the stack; use loops.
- Spreading selection state across unrelated helpers.
- Making renderer functions perform execution side effects.
