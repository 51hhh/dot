# Release

This project currently releases a generated Bash installer as the user-facing
artifact:

```text
dist/dot.sh
```

The package build (`npm run build`) produces the compiled CLI and Studio assets.
The release build then runs the compiled CLI to generate `dist/dot.sh`.

## Local Release Build

```bash
npm install
npm run build
node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet
bash -n dist/dot.sh
```

Recommended smoke check when the environment supports Docker:

```bash
npm run test:docker
```

The generated script should be runnable directly:

```bash
bash dist/dot.sh
```

## Quality Gate

For code changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For generated script changes, also run:

```bash
node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet
bash -n dist/dot.sh
```

When generated runtime behavior changes, run the Docker smoke test if available.

Docs-only changes do not need the full test suite, but the documented command
names and `package.json` scripts should be checked against the current CLI.

## Artifact Contract

`dist/dot.sh` must be:

- A single executable Bash file.
- Syntax-checked with `bash -n`.
- Self-contained at runtime.
- Free of Node.js, npm, config-file, and template-file runtime dependencies.
- Built after applying any valid sidecar `.plan.json` overlay next to the config.

## CI / Release Workflow

The repository includes `.github/workflows/ci.yml`. It stays aligned with the
local gate:

```yaml
npm ci
npm run typecheck
npm run lint
npm test
npm run build
node dist/index.js build --config configs/dot.yaml --output dist/dot.sh --quiet
bash -n dist/dot.sh
bash dist/dot.sh --dry-run-plan --select tmux-plugin-resurrect tmux-tpm-finalize
```

CI also uploads `dist/dot.sh` as the `dot-sh` artifact. Keep Docker smoke
testing optional until runner support and runtime expectations are stable.

## Mirror Integrity Policy

`dist/dot.sh` may use third-party GitHub mirrors for downloads and git clones.
Those mirrors are operational fallbacks, not integrity verification. A release
is acceptable only if the generated script clearly warns users that mirror
endpoints can observe requests and serve content. Future releases should add
checksum or signature verification for mirrored archives and plugins before
claiming mirrored content has the same integrity guarantees as direct origin
downloads.
