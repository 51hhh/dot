# runtime security audit

## Goal

Audit the generated bash runtime and template execution boundary for security and robustness risks, then document concrete remediation tasks.

## Problem

The generated installer intentionally runs shell snippets, but it still needs strong boundaries around config input, overlay input, shell-safe ids, template path resolution, prompt substitution, generated function names, GitHub mirror URLs, and dry-run behavior.

## Requirements

- Read the current generator/runtime code and templates.
- Identify realistic risks and classify severity.
- Do not implement code fixes unless explicitly requested later.
- Include at least:
  - config/overlay trust boundary
  - shell-safe id validation
  - template path traversal implications
  - prompt substitution quoting
  - generated bash associative array quoting
  - dry-run mode accidentally running snippets
  - GitHub mirror URL handling
  - `sudo`/package-manager command expectations
- Produce follow-up tasks with file scopes and tests.

## Suggested Write Set

- `.trellis/tasks/06-01-runtime-security-audit/security-audit.md`

## Avoid Touching

- `src/`
- `tests/`
- docs outside this task directory
- Studio visualization files

## Acceptance Criteria

- [ ] Audit contains severity-ranked findings.
- [ ] Audit distinguishes expected trusted-local-template behavior from true bugs.
- [ ] Audit includes concrete remediation tasks and suggested tests.
- [ ] No source code changes.
