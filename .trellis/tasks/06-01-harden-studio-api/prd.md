# harden studio plan overlay api

## Goal

Make Studio's plan overlay HTTP API robust, schema-validated, and safe to use during local development.

## Problem

`PUT /api/plan` currently parses JSON directly and casts the body as `{ patch: PlanOverlay }`. Malformed JSON, invalid overlay shape, oversized bodies, or write failures do not produce stable client-facing errors. The file boundary has Zod validation, but the HTTP boundary does not clearly reuse it.

## Requirements

- Expose a reusable overlay parser/validator for API payloads.
- Validate `PUT /api/plan` body before merging.
- Return stable JSON error responses for:
  - malformed JSON
  - missing `patch`
  - invalid overlay fields
  - oversized request body
  - save failure
- Avoid mutating `currentOverlay` before validation and successful save.
- Keep overlay merge semantics:
  - positions merge by id
  - disabled is deduplicated
  - overrides merge by id
  - disabled wins over `hidden: false`
- Add focused API tests if a server test harness already exists; otherwise add unit tests for parser/merge helper.

## Suggested Write Set

- `src/studio/server.ts`
- `src/planner/overlay.ts`
- `tests/planner.test.ts` or a new focused Studio server test

## Avoid Touching

- `src/studio/main.tsx`
- `src/studio/projection.ts`
- `tests/studio.test.ts` unless adding a tiny non-overlapping API assertion is unavoidable

## Acceptance Criteria

- [ ] Invalid JSON no longer crashes the Studio server.
- [ ] Invalid overlay shape is rejected with non-2xx status and useful JSON error.
- [ ] Oversized PUT body is rejected.
- [ ] Valid overlay patch still persists and updates `/api/plan`.
- [ ] Tests cover parser/merge behavior and at least one invalid-input path.

## Notes

This task is allowed to touch `overlay.ts`, but must preserve existing file-boundary validation used by build.
