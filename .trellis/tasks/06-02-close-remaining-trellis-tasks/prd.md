# chore: close remaining trellis tasks

## Goal

Close the remaining Trellis task-state gaps so active tasks accurately reflect completed work.

## What I already know

* `06-01-arch-hardening-roadmap` and all 18 children are completed.
* `06-02-docker-smoke-runtime-helpers` is completed.
* `00-bootstrap-guidelines` is still marked `in_progress`, but backend/frontend specs now exist and have been used during development.
* `05-30-brainstorm-arch` has conflicting state: the active task is `in_progress`, while an archive copy is `completed`.

## Requirements

* Mark truly completed remaining tasks as completed.
* Reconcile duplicate active/archive task state for `05-30-brainstorm-arch`.
* Do not modify business source code.
* Do not touch unrelated untracked local files.
* Leave Trellis task list with no unintended in-progress task caused by this cleanup.

## Acceptance Criteria

* [x] No active `.trellis/tasks/*/task.json` remains in `in_progress` or `planning` unless intentionally documented.
* [x] Duplicate `05-30-brainstorm-arch` state is resolved.
* [x] `git status` shows only known unrelated untracked local files after commits.
* [x] Final report states exactly which tasks were closed and what remains.
