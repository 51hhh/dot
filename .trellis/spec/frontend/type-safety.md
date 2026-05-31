# Type Safety

> Type safety patterns for CLI/menu and generated-script UI data.

## Overview

TypeScript is the source of truth for config and menu data shapes. Runtime config validation uses Zod in `src/loader/schema.ts`.

## Type Organization

- Define config/menu schemas in `src/loader/schema.ts`.
- Export inferred `Config` type from Zod schema.
- Keep UI result types close to the UI module, e.g. `RenderOptions` and render result unions in `src/menu/render.ts`.

## Validation

- Validate external config at load time with Zod.
- Add semantic validation after structural validation.
- Generated bash data should only be emitted from validated config.

## Common Patterns

Use discriminated unions for menu actions:

```ts
| { action: "select"; ids: string[] }
| { action: "enter"; childIndex: number }
| { action: "back" }
| { action: "quit" }
| { action: "confirm" }
```

Use `unknown` at error boundaries and narrow before reading properties.

## Forbidden Patterns

- Do not use `any` for caught errors.
- Do not cast unvalidated YAML directly to project types.
- Do not let bash-unsafe ids pass into generated function names without normalization.
