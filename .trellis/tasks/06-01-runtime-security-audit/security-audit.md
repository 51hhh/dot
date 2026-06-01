# Runtime Security Audit

## Scope

Audited the generated bash runtime and template execution boundary for the standalone `dot build` path and the legacy `generate --dry-run` path.

Read inputs:

- `.trellis/tasks/06-01-runtime-security-audit/prd.md` from the main worktree, because the task file is not present on the `master` baseline used for this isolated worktree.
- `.trellis/spec/backend/quality-guidelines.md`
- `src/generator/standalone-assembler.ts`
- `src/generator/standalone/*`
- `src/generator/template.ts`
- `src/planner/overlay.ts`
- `templates/tmux/*.sh`
- Related boundary code in `src/index.ts`, `src/loader/*`, `src/planner/build-plan.ts`, and `src/generator/validator.ts`

Note: this audit was originally drafted from an isolated worktree based on `master`. The main integration branch now has `src/generator/standalone/*` split out from `standalone-assembler.ts`, plus overlay validation and generated `--dry-run-plan` support. The findings below have been reconciled against that integrated state.

## Trust Model

The project intentionally executes local shell snippets selected by a local config file. That means template snippet content is trusted local code, equivalent to a developer-maintained installer script. Security controls should therefore protect the boundaries around that trusted code:

- config and overlay files are developer inputs, but they may be edited by tools and should be validated before affecting runtime generation;
- generated bash metadata must be safely serialized even if labels, descriptions, ids, prompt vars, and paths contain shell metacharacters;
- prompt values are runtime user input and must not become shell syntax unless deliberately constrained;
- download and package-manager helpers should make their privilege/network assumptions explicit.

## Severity-ranked Findings

### High: prompt substitution can create shell injection in generated snippets

Type: true bug.

Evidence:

- `renderSnippetFunctions` renders templates with static config vars, then calls `replaceRenderedPromptValue` for prompt variables in `src/generator/standalone/snippets.ts`.
- `replaceRenderedPromptValue` emits `${DOT_VARS[${varName}]:-${fallback}}` directly into the snippet.
- `templates/tmux/prefix-custom.sh` uses the prompt-backed value as `CUSTOM_PREFIX="{{custom_prefix:C-x}}"`, then writes it into an unquoted heredoc line.

Risk:

Prompt values are runtime user input. They are currently inserted as shell source text rather than passed through a quoting helper or assigned safely. For controlled `key` and `key-compose` prompts, the runtime UI narrows values to tmux-like keys in normal use, but the generator also accepts `prompt.type: "text"` and does not validate `prompt.var`. If a malicious or malformed config creates a text prompt or a hostile fallback value, generated bash can become syntactically invalid or execute unintended command substitutions when the snippet function runs.

Expected vs bug:

- Expected risk: templates are trusted local shell and may intentionally execute commands.
- Bug: runtime prompt values should be data, not generated shell syntax.

Suggested fix scope:

- `src/generator/standalone/snippets.ts`
- `src/generator/template.ts` if template rendering needs a typed placeholder API
- `src/loader/schema.ts` or `src/loader/loader.ts` for prompt variable validation

Suggested tests:

- Unit test `assembleStandalone` with a prompt var fallback containing `$()`, backticks, quotes, and `;`, then assert generated script uses a safe quoted assignment or a runtime escaping helper.
- Runtime bash test that feeds a prompt value containing shell metacharacters and confirms no command is executed.
- Schema/semantic test that rejects prompt var names that are not valid bash associative array keys or supported identifier names.

### High: template path traversal allows config to embed arbitrary local files as executable snippets

Type: expected trusted-local-code risk with insufficient boundary documentation; becomes a bug if configs are treated as untrusted.

Evidence:

- `generateSnippetFunctions` resolves relative `buildNode.script` with `path.resolve(configDir, buildNode.script)`.
- `loadTemplate` reads any existing resolved path.
- Existing configs use paths such as `../templates/tmux/install-apt.sh`, proving traversal out of the config directory is part of the current design.

Risk:

Any config author can reference arbitrary readable local files, including files outside `templates/`. In standalone output those file contents become a bash function body. This is equivalent to arbitrary code execution at generated script runtime, and can also leak file contents into generated artifacts.

Expected vs bug:

- Expected risk: local templates are trusted code and config-controlled `script` is the intended mechanism for choosing snippet code.
- Boundary gap: there is no explicit allowlist, template root constraint, extension check, or audit warning explaining that `script` paths are executable trusted-local-code inputs.

Suggested fix scope:

- `src/loader/schema.ts`
- `src/loader/loader.ts`
- `src/generator/template.ts`
- `src/generator/standalone-assembler.ts`

Suggested tests:

- Semantic validation test for a `script` path resolving outside allowed template roots, if an allowlist is introduced.
- Positive test that existing `../templates/tmux/*.sh` paths still resolve through the chosen project/template root.
- Error message test that reports the resolved rejected path.

### Medium: overlay trust boundary can still alter runtime control flow

Type: expected local-editing risk with remaining product boundary decisions.

Evidence:

- Current integration validates overlay shape with Zod in `src/planner/overlay.ts`.
- `resolveInstallationPlan` applies the overlay to config, re-runs config semantic validation, builds the plan, attaches positions, and exposes diagnostics.
- `runBuild` consumes the resolved plan and fails on plan validation errors.
- `applyPlanOverlayToConfig` still allows overlay changes for `label`, `description`, `hidden`, `post`, and non-root `mode`.

Risk:

Malformed overlay shape is now handled, and overlay-created post/dependency conflicts are revalidated. The remaining risk is product-policy: a sidecar file that looks like UI/layout state can still affect runtime control flow through `post`, `mode`, and disabled/hidden behavior. That may be acceptable for a trusted developer-side Plan Canvas, but should remain explicit in docs and future overlay v2 design.

Expected vs bug:

- Expected risk: a saved local sidecar can hide/disable nodes and adjust safe plan metadata.
- Resolved in current integration: raw JSON casting and missing merged-config validation.
- Remaining gap: v1 has no explicit separation between layout-only edits and runtime-affecting semantic edits.

Suggested fix scope:

- `src/planner/overlay.ts`
- `src/planner/resolve-plan.ts`
- `src/studio/server.ts`
- future overlay v2 migration work

Suggested tests:

- Keep overlay schema tests rejecting wrong `version`, invalid `mode`, non-boolean `post`/`hidden`, non-string labels, and invalid position numbers.
- Keep build tests proving overlay cannot introduce invalid post relationships or unsupported modes.
- Add future overlay v2 tests that distinguish layout-only saves from semantic saves.

### Medium: bash associative-array key/value quoting is mostly safe, but child/dependency list values rely on shell-safe ids

Type: mostly expected/safe by current constraints; remaining risk is validation placement.

Evidence:

- `bashQuote` single-quotes generated string values and escapes single quotes.
- `assocAssign` serializes keys and values with `bashQuote`.
- `assembleStandalone` rejects ids outside `^[A-Za-z0-9_-]+$`.
- Runtime loops often expand list-valued associative array entries as words, for example `for dep in ${DOT_DEPS[$id]:-}; do`.

Risk:

With current id validation, generated list values are safe because ids may not contain spaces or shell metacharacters. If future config fields are added to list-valued runtime arrays without the same validation, those loops become unsafe.

Expected vs bug:

- Expected/safe: current id set is constrained before generation.
- Gap: the shell-safe id rule lives in the standalone assembler, not in config semantic validation, so other consumers can accept unsafe ids until generation time.

Suggested fix scope:

- `src/loader/loader.ts`
- `src/loader/schema.ts`
- `src/generator/standalone-assembler.ts`

Suggested tests:

- Loader semantic test rejecting unsafe ids before planner/generator code runs.
- Standalone regression test for ids containing spaces, dots, semicolons, brackets, and quotes.
- Generated bash syntax test for labels/descriptions containing quotes, dollar signs, command substitutions, and newlines.

### Medium: GitHub mirror URL handling trusts hard-coded third-party proxy prefixes

Type: expected operational risk; not a code execution bug by itself.

Evidence:

- `DOT_GITHUB_MIRRORS` includes multiple third-party mirror prefixes.
- `dot_github_url` concatenates mirror prefix and original URL.
- `dot_download_with_fallback`, `dot_git_clone_with_fallback`, and `dot_git_pull_with_fallback` try mirrors for archives and git clones.

Risk:

Mirrors can observe requested URLs and may serve modified archives or git content. For `tmux` source tarballs, fonts, and TPM/plugin content, the generated installer currently does not pin versions by checksum, verify signatures, or restrict mirror use to explicit opt-in. GitHub TLS verification still applies to the mirror endpoint, but not to origin content integrity.

Expected vs bug:

- Expected risk: GitHub acceleration proxies are intentionally offered for connectivity.
- Boundary gap: there is no integrity verification or explicit warning that mirrors are third-party trust roots.

Suggested fix scope:

- `src/generator/standalone-assembler.ts`
- `templates/tmux/github-mirror-select.sh`
- Downloading templates such as `templates/tmux/install-source.sh`, `templates/tmux/font-jetbrainsmono.sh`, and `templates/tmux/tpm-install.sh`

Suggested tests:

- Generated runtime test for mirror ordering and fallback behavior using stubbed `curl`/`wget`/`git`.
- Unit/golden test that mirror-selection copy includes third-party trust warning if added.
- Future checksum test for source tarball/font downloads when pinned integrity metadata exists.

### Medium: dry-run validation does not execute snippets, but legacy dry-run can still read arbitrary template files

Type: mostly safe for execution; true risk for local file disclosure through generated stdout.

Evidence:

- Legacy `generate --dry-run` calls `assemble`, `validateScript`, then writes the generated script to stdout.
- Generated `dot.sh --dry-run-plan --select ...` builds and prints the runtime execution plan, then exits before running snippets.
- `validateScript` uses `bash -n` via `execFileSync`, which parses but does not execute the script.
- `assemble` and `assembleStandalone` read template files before dry-run/build output.

Risk:

Generated-script dry-run does not execute snippet commands and does not print snippet bodies. Legacy generator dry-run also does not execute snippets, but if a config points `script` at an arbitrary local file, legacy dry-run prints that file's content inside a generated shell script. This is the same template path boundary issue, but legacy dry-run makes disclosure easier because it intentionally writes generated source to stdout.

Expected vs bug:

- Safe: `bash -n`, legacy dry-run, and generated `--dry-run-plan` do not run snippets.
- Bug/risk: config-controlled template reads can disclose local files in dry-run output if configs are not trusted.

Suggested fix scope:

- `src/generator/assembler.ts`
- `src/generator/standalone-assembler.ts`
- `src/generator/template.ts`
- `src/index.ts` dry-run documentation and error handling

Suggested tests:

- CLI dry-run tests proving `bash -n` and generated `--dry-run-plan` do not run a snippet containing `touch`.
- CLI dry-run test for disallowed template path once template-root validation is added.
- Quiet dry-run test remains script-only on stdout and sends warnings/errors to stderr.

### Low: sudo and package-manager expectations are explicit but Ubuntu/apt-specific

Type: expected platform limitation.

Evidence:

- `dot_sudo` runs commands directly as root, otherwise uses `sudo` if available.
- `install-apt.sh`, `install-source.sh`, and `font-jetbrainsmono.sh` assume `apt-get` for automated package installation and fail with clear messages when unavailable.

Risk:

The generated installer can prompt for sudo and run package-manager commands selected by the user. This is expected for an installer, but should be documented as privileged host mutation. The source-build path compiles and installs to `/usr/local`, which is also expected but broad.

Expected vs bug:

- Expected risk: installer actions mutate the host and may require root.
- Not a current bug: commands use arrays and quoted arguments; unsupported package managers fail early.

Suggested fix scope:

- `templates/tmux/install-apt.sh`
- `templates/tmux/install-source.sh`
- `templates/tmux/font-jetbrainsmono.sh`
- User-facing command descriptions in config if warnings are added there

Suggested tests:

- Runtime smoke test with a stubbed `sudo` to assert command arrays preserve package names as separate args.
- Non-apt environment test proving templates fail before attempting apt-specific commands.
- Root/no-sudo branch test for `dot_sudo`.

### Low: generated header comments interpolate config text without comment escaping

Type: robustness bug, low security impact.

Evidence:

- `generateHeader` inserts `config.name`, `config.version`, and `config.description` directly into comment lines.

Risk:

Newlines in config metadata can break comment formatting and place arbitrary text near the top of generated scripts. Because the values are placed after `#  ` only at the first line, embedded newlines could produce uncommented shell source. This affects both standalone and legacy generated scripts.

Expected vs bug:

- Bug: metadata is data and should remain comments or be safely escaped.

Suggested fix scope:

- `src/generator/standalone-assembler.ts`
- `src/generator/assembler.ts`
- `src/loader/schema.ts` if metadata should reject control characters

Suggested tests:

- Config metadata with newline, `$()`, backticks, and `#` should not produce executable generated shell.
- `bash -n` should pass and output should keep metadata commented or sanitized.

## Coverage Against Required Audit Points

- config/overlay trust boundary: covered in overlay finding and trust model.
- shell-safe id validation: covered in associative-array/id finding.
- template path traversal implications: covered in template path finding and dry-run finding.
- prompt substitution quoting: covered as high severity true bug.
- bash associative array quoting: covered as mostly safe with validation caveats.
- dry-run snippet execution: covered; dry-run validates with `bash -n` and does not execute snippets.
- GitHub mirror URL handling: covered as third-party trust/integrity risk.
- sudo/package-manager expectations: covered as expected platform and privilege risk.
- template snippet trusted-local-code boundary: covered in trust model and template path finding.

## Recommended Remediation Order

1. Fix prompt substitution so runtime prompt values are never emitted as raw shell syntax.
2. Define and validate the template trust boundary: either document config `script` as arbitrary trusted local shell or restrict paths to approved template roots.
3. Decide and document the template trust boundary: either keep `script` as trusted local executable input, or restrict paths to approved template roots.
4. Move shell-safe id validation to loader semantic validation while keeping assembler checks as defense in depth.
5. Continue overlay v2 work to split layout-only edits from semantic runtime-affecting edits.
6. Add explicit mirror trust/integrity warnings and plan checksum/signature verification for downloadable release archives.
