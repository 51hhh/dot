# agent worktree execution protocol

## Goal

Document and enforce the collaboration protocol for running multiple external agents without corrupting the main working tree.

## Problem

Recent parallel work landed directly in the main workspace. That made it difficult to attribute changes, review by task, and avoid hidden conflicts. Future external agents must work in isolated git worktrees and must not spawn additional subagents.

## Requirements

- Create a reusable prompt template for external agent sessions.
- Define mandatory worktree setup commands.
- Define branch naming, write-scope declaration, and result reporting requirements.
- Define forbidden actions: no subagents, no destructive git commands, no modifying out-of-scope files, no touching active visualization work.
- Define handoff format for the main agent to merge later.
- Keep this docs-only unless a tiny Trellis task note is needed.

## Suggested Write Set

- `.trellis/tasks/06-01-agent-worktree-protocol/architecture.md`
- optionally `docs/agent-worktree-protocol.md`

## Avoid Touching

- `src/`
- `tests/`
- Studio visualization files
- generated scripts

## Acceptance Criteria

- [ ] Document includes a copy-paste prompt prelude for future agents.
- [ ] Document includes exact `git worktree add` command pattern.
- [ ] Document includes output/handoff format.
- [ ] Document explains when not to run tasks in parallel.
- [ ] No source code changes.
