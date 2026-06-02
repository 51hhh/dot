# dot

`dot` is a TypeScript CLI for turning YAML/JSON installation menus into an
inspectable plan and a self-contained interactive Bash installer.

The built-in `configs/dot.yaml` ships with one-click configuration flows for
Tmux, Zsh, and SSH.

The current flow is:

```text
Config -> Overlay -> Plan -> Build
```

- **Config**: a YAML/JSON menu graph defines labels, modes, prompts,
  dependencies, post steps, variables, and shell snippet paths.
- **Overlay**: an optional sidecar `.plan.json` next to the config can adjust
  presentation-safe plan fields without changing snippet source.
- **Plan**: `dot plan` renders the resolved graph and execution order for review
  or Studio input.
- **Build**: `dot build` writes `dist/dot.sh`, a single Bash script that can run
  without Node.js, npm, project configs, or template files.

## Quick Start

```bash
npm install
npm run build
node dist/index.js plan --config configs/dot.yaml
node dist/index.js build --config configs/dot.yaml --output dist/dot.sh
bash dist/dot.sh
```

During package use, the CLI binary is `dot`:

```bash
dot plan --config configs/dot.yaml
dot build --config configs/dot.yaml --output dist/dot.sh
dot studio --config configs/dot.yaml
```

## Main Commands

### `dot build`

Builds the user-facing release artifact.

```bash
dot build --config configs/dot.yaml --output dist/dot.sh --quiet
```

- `--config <path>` is required and accepts YAML or JSON.
- `--output <path>` defaults to `dist/dot.sh`, resolved from the current working
  directory.
- If a matching sidecar overlay exists, such as `configs/dot.plan.json`, it is
  loaded before generation.
- The generated script is validated with `bash -n` before the command succeeds.
- The output file is executable and self-contained.

### `dot plan`

Renders the resolved installation plan.

```bash
dot plan --config configs/dot.yaml
dot plan --config configs/dot.yaml --format json
dot plan --config configs/dot.yaml --format json --write dist/installation-plan.json
```

Text output is for humans. JSON output is for tooling, Studio, and plan review.

### `dot studio`

Starts the local Plan Canvas.

```bash
dot studio --config configs/dot.yaml --port 5177
```

Studio visualizes the plan graph and writes sidecar overlay data such as node
positions, disabled nodes, and safe display/execution overrides.

### Legacy `generate`

The older interactive generator path still exists as a hidden compatibility
command. New release work should prefer `dot build` and `dist/dot.sh`.

## Config Files

Minimal config shape:

```yaml
name: "dot installer"
version: "1.0"
description: "Choose tools to install"
menuMode: "single"

output:
  filename: "dot.sh"
  dir: "dist"

vars:
  global_var: "value"

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

Important fields:

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable unique id. Keep ids shell-safe: letters, digits, `_`, and `-`. |
| `label` | yes | Menu and plan display text. |
| `description` | no | Additional display text. |
| `script` | no | Trusted shell snippet path, resolved relative to the config file and limited to the config directory or sibling `templates/` root. |
| `vars` | no | Template variables for `{{variable}}` replacement. |
| `deps` | no | Other ids that must run before this node. |
| `children` | no | Nested menu items. |
| `mode` | no | Child selection mode: `single`, `multi`, or `flow`. |
| `prompt` | no | Runtime prompt used by generated installers. |
| `hidden` | no | Hide from menus while still allowing dependency participation. |
| `post` | no | Run after normal non-post steps. |
| `endFlow` | no | End the containing flow and continue to plan preview. |

Template snippets can use defaults:

```bash
echo "Installing version {{version:latest}}"
```

`script` files are trusted executable shell. The generator embeds their rendered
contents into the release script, so configs from untrusted sources must not be
used to read arbitrary local files. Current builds accept snippets under the
config directory itself or under a sibling `templates/` directory such as
`configs/../templates`.

## Sidecar Plan Overlays

For a config file `configs/dot.yaml`, the sidecar overlay path is
`configs/dot.plan.json`.

```json
{
  "version": 1,
  "positions": {
    "tmux": { "x": 120, "y": 80 }
  },
  "disabled": ["tmux-plugin-dracula"],
  "overrides": {
    "tmux-install": {
      "label": "Install Tmux",
      "hidden": false,
      "mode": "single"
    }
  }
}
```

Overlay rules:

- `positions` are Studio-only and do not affect build output.
- `overrides` may affect only `label`, `description`, `hidden`, `post`, and
  non-root `mode`.
- `disabled` forces matching config nodes to `hidden: true` and wins over
  `hidden: false`.
- Unsafe fields such as `script`, `deps`, and `vars` are ignored at the overlay
  boundary.
- The merged config is validated again before build output is written.

## Project Structure

```text
src/
├── index.ts          # CLI entry point and command wiring
├── loader/           # Config parsing, Zod schema, semantic validation
├── utils/            # Graph/dependency helpers
├── generator/        # Template rendering, standalone Bash assembly, validation
├── menu/             # Legacy developer-side interactive menu
├── planner/          # InstallationPlan graph, overlays, renderers
└── studio/           # React Flow Plan Canvas and local server

configs/              # Example YAML configs
templates/            # Shell snippets referenced by configs
docs/                 # Architecture and release notes
dist/                 # Built CLI and generated dot.sh artifact
```

See [docs/architecture.md](docs/architecture.md) and
[docs/release.md](docs/release.md) for more detail.

## Development Checks

Use the full quality gate before reporting code changes complete:

```bash
npm run typecheck
npm run lint
npm test
npm run build
bash -n dist/dot.sh
```

When generated runtime behavior changes, also run the Docker smoke test when the
environment supports it:

```bash
npm run test:docker
```

For docs-only changes, at minimum check that documented commands still match the
CLI and `package.json` scripts.

## Release Artifact

The release artifact for users is `dist/dot.sh`.

Recommended release build:

```bash
npm install
npm run build
node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet
bash -n dist/dot.sh
```

Publish or attach `dist/dot.sh` as the downloadable installer. Users should be
able to run it with:

```bash
bash dist/dot.sh
```

## GitHub Mirror Integrity

The Tmux installer can use third-party GitHub mirror prefixes to improve
connectivity for source archives, fonts, TPM, and plugins. Mirrors are treated
as network trust roots: they can observe requested URLs and can serve the bytes
downloaded by the installer. The generated script now warns when mirror paths
are selected or used.

Current policy: direct GitHub access remains available, mirror support is
retained, and generated installs rely on HTTPS to the chosen endpoint. The
project does not yet pin checksums or verify signatures for mirrored content.
Checksum/signature metadata should be added before treating mirrors as
integrity-equivalent to direct origin downloads.

## License

MIT
