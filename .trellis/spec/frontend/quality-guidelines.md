# Quality Guidelines

> Quality standards for terminal UI and generated-script UX.

## Required Checks

Run the project checks from backend quality guidelines for any UI/generator change:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For generated scripts, also run `bash -n` and a Docker smoke test when runtime behavior changes.

## Required Patterns

- Menu rendering returns structured actions, not raw strings.
- Navigation loops should be iterative, not recursive.
- Quiet/dry-run output must remain script-safe.
- Generated bash TUI must restore terminal state on exit.
- User-facing actions should have clear labels and descriptions.

## Testing Requirements

- Unit test input parsing and branch/leaf selection behavior.
- CLI tests should cover quiet vs non-quiet output.
- Generated bash TUI should have syntax and fixture/golden coverage.
- Manual/container smoke testing is required for true interactive behavior.

## Forbidden Patterns

- Do not require `dialog`, `whiptail`, `gum`, or `fzf` for MVP generated scripts.
- Do not mix installation execution into selection rendering.
- Do not rely on terminal features without a fallback or cleanup path.

## Code Review Checklist

- [ ] Menu state and rendering remain separated.
- [ ] Dependency display matches actual dependency resolution.
- [ ] Terminal cleanup runs on normal exit and interruption.
- [ ] Output modes are compatible with shell redirection.
