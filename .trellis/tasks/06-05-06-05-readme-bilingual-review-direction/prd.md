# PRD: Bilingual README Review and Project Direction

## Goal

Make the English and Chinese README files accurately describe the current project behavior, then summarize pragmatic next-step project direction for the user.

## Scope

- Update `README.md`.
- Update `docs/README.zh-CN.md`.
- Keep both files aligned in claims, structure, and terminology.
- Correct misleading statements about Studio, platform support, installer dependencies, URLs, overlay support, and test counts.
- Do not change application source code.

## Acceptance Criteria

- Install commands use explicit HTTPS URLs.
- Studio wording says layout save and draft export accurately instead of implying direct semantic editing.
- Bash/runtime portability wording distinguishes generated runtime from apt-oriented built-in flows.
- Test count matches the current suite count of 161.
- README mentions overlay v2 support at a high level without over-explaining internals.
- Final response includes project direction and prioritized recommendations.

## Notes

- Current git working tree already contains unrelated README/docs changes. Preserve them and only adjust README content.

## Result

- Updated `README.md` and `docs/README.zh-CN.md`.
- Replaced static CI badge with the real GitHub Actions workflow badge.
- Changed install examples to explicit `https://` URLs.
- Clarified generated-script runtime dependencies versus selected template system tools.
- Clarified Studio as layout/draft-export workflow rather than direct semantic saving.
- Added high-level overlay v2 wording.
- Updated Vitest count to 161.
- Aligned Chinese README section order with the English README.
