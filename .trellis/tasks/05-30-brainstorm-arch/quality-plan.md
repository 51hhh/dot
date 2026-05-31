# Quality plan for self-contained `dot.sh` MVP

## Goals

The MVP must prove two things:

1. TypeScript generator code is correct and maintainable.
2. Generated `dot.sh` is syntactically valid and can run in a clean Linux environment.

## Local checks

Run before reporting implementation complete:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected result: all commands pass with no lint warnings.

## Generated bash checks

After `dot build` exists, each generated script should pass:

```bash
bash -n dist/dot.sh
```

Recommended additional checks:

```bash
# Generated file exists and is executable
test -f dist/dot.sh
test -x dist/dot.sh

# Script starts with bash shebang
grep -q '^#!/usr/bin/env bash' dist/dot.sh
```

## Test strategy

### Unit tests

Add or extend Vitest tests for:

- YAML schema validation.
- Duplicate id detection.
- Unknown dependency detection.
- `post` dependency constraints.
- Shell-safe id/function-name conversion.
- Bash data serialization.
- Template rendering with unresolved variable warnings.

### Golden/snapshot tests

Use fixture configs to generate deterministic output and compare against expected text.

Fixtures should cover:

- Single leaf item.
- Nested menu with branch and leaves.
- Dependencies.
- `post` item.
- Runtime prompt metadata.
- Special characters in labels/descriptions/vars.

### CLI integration tests

Once `dot build` exists:

```bash
node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh
bash -n dist/dot.sh
```

Test both success and expected failure cases.

### Docker smoke tests

Use Docker to verify generated `dot.sh` in a clean Ubuntu environment.

#### Build locally first

```bash
npm run build
node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh
bash -n dist/dot.sh
```

#### Interactive container with bind mount

```bash
docker run --rm -it \
  -v "$PWD:/work" \
  -w /work \
  ubuntu:24.04 \
  bash
```

Inside the container:

```bash
apt-get update
apt-get install -y bash ca-certificates git
bash -n dist/dot.sh
bash dist/dot.sh
```

#### One-shot syntax smoke test

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  ubuntu:24.04 \
  bash -lc 'apt-get update >/dev/null && apt-get install -y bash ca-certificates >/dev/null && bash -n dist/dot.sh'
```

#### Future non-interactive smoke test

After the generated script supports presets or test mode:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  ubuntu:24.04 \
  bash -lc 'bash dist/dot.sh --preset tests/fixtures/tmux-minimal.json --yes'
```

## CI/CD pipeline

Recommended pipeline stages:

1. **Install dependencies**
   - `npm ci`

2. **Static quality**
   - `npm run typecheck`
   - `npm run lint`

3. **Tests**
   - `npm test`

4. **Build**
   - `npm run build`

5. **Generate artifact**
   - `node dist/index.js build --config configs/tmux.yaml --output dist/dot.sh`

6. **Validate generated script**
   - `bash -n dist/dot.sh`
   - golden/snapshot tests

7. **Container smoke test**
   - run syntax check in `ubuntu:24.04`
   - optional interactive/manual smoke before release

8. **Publish artifact**
   - upload `dist/dot.sh` as release artifact or static file

## Review checklist

Before merging MVP implementation:

- [ ] Generated `dot.sh` has no dependency on project files.
- [ ] Generated `dot.sh` has no dependency on Node/npm.
- [ ] All user-facing install snippets are inside functions.
- [ ] Generated function names are shell-safe.
- [ ] Dependency resolver output is deterministic.
- [ ] `post` items execute after normal items.
- [ ] `bash -n` passes for all generated fixtures.
- [ ] Docker smoke command is documented and has been run.
