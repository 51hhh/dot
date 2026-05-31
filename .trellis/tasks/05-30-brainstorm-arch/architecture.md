# TS → self-contained shell generator architecture

## Target architecture

`dot` becomes a developer-side generator. It reads YAML configuration and shell template snippets, then emits a standalone `dot.sh` that contains everything needed for end-user interaction and execution.

```text
configs/dot.yaml
  + templates/**/*.sh
  + generator bash runtime templates
    ↓
TypeScript build pipeline
    ↓
dist/dot.sh
    ↓
end user: wget dot.sh && bash dot.sh
```

## Developer-side pipeline

1. **Load config**
   - Reuse `src/loader/loader.ts` and `src/loader/schema.ts`.
   - Continue using Zod for structural validation.
   - Continue semantic validation for duplicate ids, unknown deps, and invalid `post` dependencies.

2. **Normalize menu graph**
   - Reuse `flattenNodes`, `resolveDeps`, `topoSort`, and `getLeafIds` from `src/utils/deps.ts`.
   - Convert YAML tree into a serializable bash runtime data model.

3. **Render template snippets**
   - Reuse `src/generator/template.ts` for build-time substitutions.
   - Runtime prompts should be represented as placeholders or shell variables that the generated script fills before execution.

4. **Assemble standalone script**
   - Replace or split current `src/generator/assembler.ts` into a standalone-script assembler.
   - It should emit:
     - bash shebang and safety/bootstrap helpers
     - logging helpers
     - pure bash TUI runtime
     - menu data arrays
     - dependency data arrays
     - rendered script snippet functions
     - prompt collection functions
     - execution planner
     - executor and summary

5. **Validate output**
   - Continue using `src/generator/validator.ts` with `bash -n`.
   - Add generated-script fixture/golden tests.

## Generated `dot.sh` modules

The generated file should be organized in clearly separated sections.

### 1. Bootstrap

Responsibilities:

- Require bash.
- Detect interactive terminal (`[[ -t 0 && -t 1 ]]`).
- Initialize color constants with ANSI fallback.
- Register cleanup trap to restore cursor visibility.
- Define common logging helpers.

Expected helpers:

```bash
log_info
log_ok
log_warn
log_error
restore_terminal
```

### 2. TUI runtime

Responsibilities:

- Read single keypress with `read -rsn1`.
- Parse arrow-key escape sequences.
- Render single-select and multi-select menus.
- Support:
  - Up/down navigation
  - Space toggle for multi-select
  - Enter confirm
  - Back
  - Quit

The TUI runtime should be generic and not know about tmux/zsh/rime specifics.

### 3. Menu data

Generated from YAML.

Recommended bash representation:

```bash
declare -A DOT_LABELS
DECLARE -A DOT_DESCRIPTIONS
DECLARE -A DOT_CHILDREN
DECLARE -A DOT_DEPS
DECLARE -A DOT_POST
DECLARE -A DOT_SNIPPET_FUNCS
```

Use stable ids from YAML as keys. Children and deps can be space-separated id lists because ids should remain shell-safe (`[A-Za-z0-9_-]+`).

### 4. Prompt collection

MVP can begin with static `vars`, then add runtime prompts with a future schema field such as:

```yaml
prompts:
  - name: custom_prefix
    label: "Tmux prefix"
    default: "C-a"
```

Generated bash should collect prompt answers before execution and store them in associative arrays:

```bash
declare -A DOT_VARS
DOT_VARS[custom_prefix]="C-a"
```

### 5. Dependency resolver and execution planner

Responsibilities:

- Expand selected branch nodes into leaf nodes.
- Resolve dependencies recursively.
- Topologically order selected ids.
- Split normal and `post` ids.
- Produce final execution list.

The TypeScript generator can precompute static metadata, but final planning must happen in bash because the end user chooses items at runtime.

### 6. Script snippets

Each selected YAML node with a `script` becomes a bash function.

Example generated form:

```bash
dot_run_tmux_header() {
  # rendered template content
}
```

Function names must be derived with safe escaping, e.g. `tmux-plugin-yank` → `dot_run_tmux_plugin_yank`.

Template snippets should avoid top-level `exit` unless intentionally fatal. Prefer returning non-zero so the executor can record failure.

### 7. Executor

Responsibilities:

- Show execution plan.
- Ask for final confirmation.
- Run each snippet function sequentially.
- Record status per id.
- Continue or stop policy for MVP:
  - Recommended: continue after failure for independent items.
  - If a dependency failed, skip dependent items.
- Print final summary.

## Data contracts

### YAML menu item contract

Current fields:

```yaml
id: string
label: string
description?: string
script?: string
deps?: string[]
children?: MenuItem[]
post?: boolean
vars?: Record<string, string>
```

MVP should keep this contract and generate runtime menu data from it.

Future field:

```yaml
prompts?: Array<{
  name: string
  label: string
  default?: string
  required?: boolean
}>
```

Do not add complex prompt types until basic text prompts work.

### Template contract

- Build-time variables: `{{name}}` and `{{name:default}}` can continue to be rendered by TypeScript.
- Runtime variables should use a deliberate syntax or generated shell variables, not accidental raw interpolation.
- Shell snippets must be valid inside a bash function.

### Bash runtime contract

- Menu item ids are stable keys.
- Every runnable item has one generated function.
- Dependency data is available before selection confirmation.
- Execution results are stored by id.

## Proposed source layout changes

Recommended incremental structure:

```text
src/generator/
  assembler.ts              # existing legacy assembler or wrapper
  standalone-assembler.ts   # emits self-contained dot.sh
  bash-runtime.ts           # static bash runtime string templates
  bash-data.ts              # serialize config graph into bash arrays/functions
  template.ts               # existing template renderer
  validator.ts              # existing bash -n validator
```

CLI changes in `src/index.ts`:

- Add a build-oriented command or option:
  - `dot build --config configs/dot.yaml --output dist/dot.sh`
- Keep existing mode temporarily during migration if useful, but MVP should target standalone generation.

## Reuse plan

| Existing module | Reuse / change |
|-----------------|----------------|
| `loader/schema.ts` | Reuse, later extend with `prompts` |
| `loader/loader.ts` | Reuse semantic validation, add shell-safe id validation if missing |
| `utils/deps.ts` | Reuse for build-time tests and maybe generated metadata; mirror logic in bash runtime |
| `generator/template.ts` | Reuse for build-time rendering; clarify runtime variable handling |
| `generator/assembler.ts` | Split or replace with standalone assembler |
| `generator/validator.ts` | Reuse `bash -n` validation |
| `menu/*` | Developer-side CLI menu becomes less central; generated bash has its own TUI runtime |

## Implementation phases

### Phase 1: Standalone script skeleton

- Generate `dot.sh` with bootstrap, logging, and hardcoded generated menu data.
- Validate with `bash -n`.
- Add golden output test.

### Phase 2: Pure bash TUI runtime

- Add arrow navigation and checkbox multi-select.
- Add tests around generated text and shell syntax.
- Manual Docker smoke test for interaction.

### Phase 3: Runtime planner and executor

- Generate dependency arrays.
- Implement bash dependency resolver/topological planner.
- Generate snippet functions from templates.
- Show plan and execute sequentially.

### Phase 4: Runtime prompts

- Add minimal `prompts` schema if needed.
- Collect custom parameters before execution.
- Wire prompt values into snippets safely.

## Non-goals for MVP

- Remote plugin marketplace.
- Mirror speed testing.
- Parallel execution.
- Rollback.
- Full preset import/export.
