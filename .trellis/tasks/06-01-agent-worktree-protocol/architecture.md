# Agent Worktree Execution Protocol

## Purpose

External agents must do task work in isolated git worktrees so the main workspace remains reviewable, attributable, and mergeable. The main agent owns orchestration and final integration; external agents execute one bounded task and hand back a precise result.

This protocol is docs-only. It does not change source code, generated scripts, tests, or Studio visualization files.

## Standard Prompt Prelude

Use this prelude at the top of every future external-agent prompt, then append the task-specific PRD, write set, and checks.

```text
You are working in /home/rick/desktop/dot.

Important collaboration rules:
1. Execute this task directly. Do not call subagents, spawn agents, or delegate work.
2. Use a git worktree. Do not modify the main workspace at /home/rick/desktop/dot.
3. Worktree path: /home/rick/desktop/dot/.worktrees/<task-slug>
4. Branch name: task/<task-slug>
5. Only modify files explicitly allowed by this task.
6. Do not revert, reset, checkout, overwrite, or clean up changes that are not yours.
7. Do not modify prohibited paths listed in the task.
8. When done, report: worktree path, branch name, modified files, checks run, and either a diff summary or commit hash.

Before editing, run:
cd /home/rick/desktop/dot
git worktree add .worktrees/<task-slug> -b task/<task-slug> <base-ref>
cd .worktrees/<task-slug>

Read the task PRD and project instructions from the worktree. If the PRD exists only in the main workspace because it is not committed yet, read it from the main workspace but write outputs only inside the worktree.
```

## Worktree Creation Template

Default command:

```bash
cd /home/rick/desktop/dot
git worktree add .worktrees/<task-slug> -b task/<task-slug> master
cd .worktrees/<task-slug>
```

Use `<base-ref>` instead of `master` only when the main agent names a specific base commit or integration branch:

```bash
git worktree add .worktrees/<task-slug> -b task/<task-slug> <base-ref>
```

If the worktree or branch already exists, stop and report the conflict. Do not delete, prune, reset, or reuse an existing worktree unless the main agent explicitly says it is safe.

## Branch Naming

Branches must use this shape:

```text
task/<task-slug>
```

`<task-slug>` should match the Trellis task slug or the explicit task name from the prompt. Use lowercase words separated by hyphens. Keep one branch per task. Do not combine unrelated changes in the same worktree branch.

Examples:

```text
task/agent-worktree-protocol
task/generated-script-smoke-tests
task/harden-studio-api
```

## Required File Scope Declaration

Every external-agent prompt must include an explicit write scope with allowed files or directories.

Recommended format:

```text
Write scope:
- path/to/allowed-file.md
- path/to/allowed-directory/

Prohibited:
- src/
- tests/
- dist/
- generated scripts
- active visualization files named by the main agent
```

The agent may read other files as needed for context, but it may write only the allowed paths. If the task requires a file outside the write scope, the agent must stop and report the needed path instead of editing it.

## Forbidden Actions

External agents must not:

- Call subagents, spawn agents, or delegate implementation/check work.
- Modify the main workspace at `/home/rick/desktop/dot`.
- Run destructive git commands such as `git reset --hard`, `git checkout -- <path>`, `git clean`, or branch deletion.
- Revert, overwrite, or normalize changes made by other people or agents.
- Edit files outside the declared write scope.
- Touch `src/`, `tests/`, `dist/`, generated scripts, or Studio visualization files unless the task explicitly allows the exact path.
- Resolve merge conflicts by guessing. Report them to the main agent.
- Rebase, squash, or force-push unless the main agent explicitly requests it.

## Handoff Format

Every external-agent response must end with this handoff block.

```text
Worktree: /home/rick/desktop/dot/.worktrees/<task-slug>
Branch: task/<task-slug>
Files changed:
- <path>
- <path>
Checks run:
- <command>: <pass/fail and important output>
Diff or commit:
- <short diff summary, `git diff --stat`, or commit hash>
Notes:
- <anything the main agent must know before merge>
```

If no commit was requested, leave the changes uncommitted and provide the diff summary. If a commit was requested, provide the commit hash and keep the worktree branch ready for merge.

## Checks

The task prompt must name the minimum checks. For docs-only protocol work, the baseline is:

```bash
git diff --check
```

For source changes, the main agent should add the smallest relevant project checks, such as type-checks, unit tests, generated-script validation, or Studio tests. External agents must report any check they could not run and why.

## Tasks That Must Not Run In Parallel

Do not run tasks in parallel when they can write the same path, change the same contract, or require the same unstable base state.

Specifically, serialize tasks that:

- Modify the same file or directory, including generated outputs.
- Touch shared source contracts such as config schema, plan schema, loader output, planner overlays, generator runtime data, or CLI entrypoints.
- Touch active Studio visualization work, including `src/studio/main.tsx`, `src/studio/projection.ts`, `src/studio/studio.css`, or `tests/studio.test.ts`.
- Change generated script assembly, generated script fixtures, or smoke-test expectations.
- Update shared Trellis specs, workflow docs, or project-wide guidelines.
- Depend on another task's unmerged output.
- Need to rename, move, or delete files.
- Require broad formatting across the repository.
- Require dependency installation, package lock changes, release metadata changes, or CI workflow changes.

Parallel tasks are acceptable only when their write scopes are disjoint, their checks can run independently, and neither task changes a shared contract consumed by the other.

## Main-Agent Merge Responsibilities

The main agent should review the handoff, inspect the diff, run integration checks from the main workspace after merging or cherry-picking, and remove the worktree only after the branch has been integrated or intentionally abandoned.

The external agent should not clean up its own worktree unless explicitly instructed, because the worktree is the handoff artifact.
