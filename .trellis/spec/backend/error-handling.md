# Error Handling

> Error handling conventions for the `dot` TypeScript CLI/generator.

## Overview

`dot` should fail early for invalid developer inputs and produce clear messages for CLI users. Generated bash scripts should validate enough to protect the execution flow, but avoid complex recovery in the MVP.

## TypeScript Error Handling

### Config loading

- Config parse errors should throw `Error` with actionable messages.
- Zod validation should surface which config field is invalid.
- Semantic validation should reject:
  - duplicate menu ids
  - dependencies pointing to missing ids
  - non-`post` nodes depending on `post` nodes
  - ids that cannot be safely serialized to bash runtime data

### CLI boundary

`src/index.ts` should catch `unknown`, convert to a string message, print a colored error, and exit with code `1`.

Pattern:

```ts
try {
  await run(opts);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(c.error(`\n  Error: ${message}\n`));
  process.exit(1);
}
```

### Generator boundary

- Template file read failures should include the resolved path.
- Unresolved template variables should be collected as warnings when generation can still continue.
- Invalid generated shell should be detected with `bash -n` before reporting success.

## Generated Bash Error Handling

The generated `dot.sh` should:

- Use explicit logging helpers: `log_info`, `log_ok`, `log_warn`, `log_error`.
- Restore terminal cursor/TTY state on exit via `trap`.
- Record per-section success/failure.
- Skip dependents when a required dependency failed.
- Print a final summary.

MVP should not implement rollback, retries, or resumable state.

## Forbidden Patterns

- Do not use TypeScript `any` for caught errors; use `unknown` and narrow.
- Do not swallow generator errors silently.
- Do not let `bash -n` warnings disappear in quiet build output.
- Do not place `exit` inside template snippets unless the entire generated script must stop.

## Common Mistakes

- Treating template variables as safe shell text without quoting.
- Allowing a generated bash function name to contain `-` or other unsafe characters.
- Failing after the first selected item without reporting what already ran.
