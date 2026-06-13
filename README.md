<p align="center">
  <img src="docs/banner.svg" alt="dot Banner" width="600">
</p>

<p align="center">
  <strong>Interactive system configuration generator — forge your dotfiles</strong>
</p>

<p align="center">
  <a href="https://github.com/51hhh/dot/actions">
    <img src="https://github.com/51hhh/dot/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://dot.techvista.eu.org/dot.sh">
    <img src="https://img.shields.io/badge/download-dot.sh-blue" alt="Download">
  </a>
  <a href="https://github.com/51hhh/dot/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/51hhh/dot" alt="License">
  </a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="docs/README.zh-CN.md">中文</a>
</p>

---

dot turns YAML menu definitions into a single, self-contained interactive Bash script. The generated script runs without Node.js, npm, or project files on the target machine — just `bash`.

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh | bash
```

Built with **TypeScript + Vite + React Flow** for the planning studio, and pure **Bash** for the generated installer.

## How It Works

```text
YAML Config + Shell Templates
         │
         ▼
   ┌─────────────┐
   │  dot plan    │  → inspect & review the resolved graph
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  dot build   │  → single self-contained bash script
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  bash dot.sh │  → interactive TUI → execute on bash-capable systems
   └─────────────┘
```

The generated `dot.sh` embeds all templates, menu logic, dependency resolution,
and interactive prompts into a single file. The runtime is pure Bash; selected
template steps may still call system tools such as `apt`, `git`, `curl`, or
`wget` depending on the flow.

## Highlights

- **Zero Node/npm runtime** — the generated `dot.sh` runs with bash only; selected templates may invoke system package tools
- **Three built-in flows** — Tmux, Zsh, and SSH one-click configuration with 80+ composable shell templates, mainly targeting Debian/Ubuntu-style environments
- **Interactive TUI menu** — arrow-key navigation, multi-select, flow-based wizards with progress tracking
- **GitHub mirror acceleration** — built-in speed-tested mirror selection for users behind restrictive networks
- **Plan Canvas (Studio)** — React Flow visual workspace to inspect the resolved graph and dependency relationships
- **Strong schema constraints** — flow nodes must have children, leaf nodes must have scripts, parent nodes must declare mode
- **Template variables** — `{{variable}}` substitution with defaults, runtime prompts (text, number, key capture)
- **Dependency graph** — declare `deps: [...]` and `post: true` to control execution order automatically
- **Dry-run mode** — `--dry-run-plan` renders the full execution plan without running anything

## Install

Run the installer directly:

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh | bash
```

Or download first, then inspect:

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh -o dot.sh
cat dot.sh  # review before running
bash dot.sh
```

## Quick Start (from source)

```bash
npm install
npm run build
bash dist/dot.sh
```

## Configuration

dot uses YAML to define menu structures. A minimal example:

```yaml
name: "My Installer"
menu:
  - id: tool-setup
    label: "Tool Setup"
    mode: flow  # linear workflow
    children:
      - id: install
        label: "Install Tool"
        mode: single  # choose one option
        children:
          - id: install-apt
            label: "Via apt"
            script: ../templates/install-apt.sh
          - id: install-source
            label: "From source"
            script: ../templates/install-source.sh
      
      - id: configure
        label: "Configure"
        script: ../templates/configure.sh
```

### Schema Constraints

To ensure configuration correctness, dot enforces these constraints:

1. **Flow nodes must have children** - A flow represents a sequence of steps
2. **Leaf nodes must have scripts** - Executable nodes need a script or prompt
3. **Parent nodes must declare mode** - Specify single/multi/flow selection behavior
4. **endFlow only for flow children** - Can't end a flow from the flow container itself
5. **Post nodes should be leaves** - Finalization steps shouldn't have sub-tasks

See [docs/schema-constraints.md](docs/schema-constraints.md) for detailed rules and examples.

### Template Variables

Scripts support `{{variable}}` substitution:

```yaml
- id: custom-port
  label: "Custom Port"
  script: templates/setup-port.sh
  vars:
    port: "8080"
  prompt:
    type: number
    var: port
    label: "Enter port number"
```

### Dependencies

Control execution order with `deps`:

```yaml
- id: configure
  label: "Configure"
  script: configure.sh
  deps: [install]  # runs after install

- id: cleanup
  label: "Cleanup"
  post: true  # runs after all normal steps
  script: cleanup.sh
```

### `dot build`

Builds the self-contained release artifact.

```bash
dot build --config configs/dot.yaml --output dist/dot.sh --quiet
```

- `--config <path>` — required, accepts YAML or JSON
- `--output <path>` — defaults to `dist/dot.sh`
- Loads sidecar overlay (`configs/dot.plan.json`) if present
- Validates output with `bash -n` before writing

### `dot plan`

Renders the resolved installation plan.

```bash
dot plan --config configs/dot.yaml              # human-readable tree
dot plan --config configs/dot.yaml --format json # machine-readable
```

### `dot studio`

Starts the local Plan Canvas visual editor.

```bash
dot studio --config configs/dot.yaml --port 5177
```

Visualize the plan graph, drag nodes to save layout positions, toggle dependency visibility, and export draft prompts for source-level structure changes.

## Config Reference

Minimal config shape:

```yaml
name: "dot installer"
version: "1.0"
description: "Choose tools to install"
menuMode: "single"

output:
  filename: "dot.sh"
  dir: "dist"

menu:
  - id: "tmux"
    label: "Tmux"
    mode: "flow"
    children:
      - id: "tmux-install"
        label: "Install tmux"
        script: "../templates/tmux/install-apt.sh"
      - id: "tmux-configure"
        label: "Configure tmux"
        script: "../templates/tmux/header.sh"
        deps: ["tmux-install"]
      - id: "tmux-final-notes"
        label: "Final notes"
        script: "../templates/tmux/final-notes.sh"
        post: true
```

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable unique id (letters, digits, `_`, `-`) |
| `label` | yes | Menu display text |
| `description` | no | Additional display text |
| `script` | no | Shell snippet path, resolved relative to config file |
| `vars` | no | Template variables for `{{variable}}` replacement |
| `deps` | no | Ids that must run before this node |
| `children` | no | Nested menu items |
| `mode` | no | `single`, `multi`, or `flow` |
| `prompt` | no | Runtime prompt (text, number, key, key-compose) |
| `hidden` | no | Hide from menus, still participates in deps |
| `post` | no | Run after normal non-post steps |
| `endFlow` | no | End the containing flow and continue to plan |

## Sidecar Plan Overlays

For `configs/dot.yaml`, the overlay path is `configs/dot.plan.json`:

```json
{
  "version": 1,
  "positions": { "tmux": { "x": 120, "y": 80 } },
  "disabled": ["tmux-plugin-dracula"],
  "overrides": {
    "tmux-install": { "label": "Install Tmux", "hidden": false }
  }
}
```

- `positions` — Studio-only, do not affect build output
- `overrides` — only `label`, `description`, `hidden`, `post`, and non-root `mode`
- `disabled` — forces nodes to `hidden: true`, wins over `hidden: false`
- v2 overlays also support constrained dependency and ordering patches; Studio semantic edge drafts are exported for source updates rather than saved directly as layout changes.

## Template Security

`script` files are trusted executable shell. The generator embeds their rendered
contents into the release script, so configs from untrusted sources must not be
used to read arbitrary local files. Current builds accept snippets under the
config directory itself or under a sibling `templates/` directory.

## GitHub Mirror Integrity

The Tmux installer can use third-party GitHub mirror prefixes to improve
connectivity for source archives, fonts, TPM, and plugins. Mirrors are treated
as network trust roots: they can observe requested URLs and can serve the bytes
downloaded by the installer. The generated script warns when mirror paths are
selected or used.

Current policy: direct GitHub access remains available, mirror support is
retained, and generated installs rely on HTTPS to the chosen endpoint. The
project does not yet pin checksums or verify signatures for mirrored content.

## Project Structure

```text
src/
├── index.ts              # CLI entry point
├── loader/               # Config parsing, Zod schema, validation
├── generator/            # Template rendering, standalone Bash assembly
├── planner/              # InstallationPlan graph, overlays, renderers
└── studio/               # React Flow Plan Canvas

configs/                  # YAML config files
templates/                # Shell snippets (tmux, zsh, ssh)
docs/                     # Architecture and release notes
dist/                     # Built CLI and generated dot.sh
```

## Development

```bash
npm run typecheck         # TypeScript type checking
npm run lint              # ESLint
npm test                  # Vitest (161 tests)
npm run build             # Full build: CLI + Studio + dot.sh
npm run test:docker       # Docker smoke test
```

## Contributing

Contributions welcome. Please open an issue first to discuss substantial changes.

1. Fork → branch (`git checkout -b feat/my-feature`)
2. Commit (`git commit -m 'feat: add feature'`)
3. Push → PR

## License

[MIT](LICENSE)
