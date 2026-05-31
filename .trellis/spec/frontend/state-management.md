# State Management

> State conventions for CLI menus and generated bash runtime.

## Overview

There is no client-side state library. State is local and explicit:

- TypeScript CLI menu state lives inside `navigate()`.
- Dependency state is derived from `utils/deps.ts`.
- Generated bash runtime state should live in associative arrays.

## State Categories

### Selection state

Tracks user-selected menu ids. Current TypeScript implementation uses `Set<string>`.

### Derived dependency state

Computed from selected ids and the flattened menu graph. Do not store stale copies if it can be derived.

### Runtime prompt state

Future generated `dot.sh` should store prompt answers in a dedicated `DOT_VARS` associative array.

### Execution result state

Future generated `dot.sh` should store per-id status in a dedicated `DOT_RESULTS` associative array.

## When to Use Global State

- Avoid TypeScript module-level mutable state.
- Generated bash may use global associative arrays because bash lacks structured objects, but keep names prefixed and centralized.

## Common Mistakes

- Mutating selection state from rendering code.
- Computing dependency order differently in UI and generator paths.
- Hiding runtime state in temporary files before MVP needs persistence.


## Generated `dot.sh` Runtime State Contract

Generated standalone scripts use bash associative arrays for explicit runtime state:

```bash
declare -A DOT_SELECTED
declare -A DOT_PLAN_ADDED
declare -A DOT_RESULTS
DOT_PLAN=()
DOT_POST_PLAN=()
```

- `DOT_SELECTED[id]=1` means a leaf or branch is selected.
- `DOT_PLAN` is rebuilt after confirmation from selected ids plus dependencies.
- `DOT_POST_PLAN` collects runnable `post` items before they are appended to `DOT_PLAN`.
- `DOT_RESULTS[id]` is one of `ok`, `failed`, or `skipped` after execution.

Do not execute install snippets during selection. The generated flow is collect -> preview plan -> confirm -> execute -> summary.
