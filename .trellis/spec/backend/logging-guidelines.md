# Logging Guidelines

> Logging and user-facing output conventions for the `dot` CLI/generator.

## Overview

`dot` does not use a logging framework. It writes CLI messages directly to stdout/stderr and generated shell scripts define small logging helper functions.

## TypeScript CLI Output

- Use `src/utils/colors.ts` helpers for user-facing colored output.
- Print errors at the top-level CLI boundary to stderr.
- Respect `--quiet` by suppressing banners, selection summaries, and warnings where intended.
- `--dry-run --quiet` should write only the generated script to stdout.

Example: `src/index.ts` catches unknown errors and prints a colored error before exiting with code `1`.

## Generated Bash Output

Generated scripts should define and use:

```bash
log_info
log_ok
log_warn
log_error
```

Keep generated script output readable and step-oriented:

- announce each major install/config section
- show warnings for recoverable issues
- show a final success/failure summary

## What Not to Log

- Do not print secrets, tokens, private URLs, or credentials.
- Do not dump entire generated scripts in non-dry-run normal output.
- Do not mix diagnostic warnings into `--quiet --dry-run` script stdout.

## Common Mistakes

- Printing non-script text to stdout in quiet dry-run mode breaks shell redirection.
- Swallowing validation warnings makes bad generated scripts harder to debug.
- Logging too much from generated scripts obscures the actual failing install command.
