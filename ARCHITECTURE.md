# Multi-script architecture

This document records the multi-script boundary. `TMUX.sh`, `ZSH.sh`, and the thin
`dot.sh` launcher are implemented; other installers and integrated utilities are
added only when needed.

## One installer, one standalone script

```text
dot.sh                # TUI launcher; tiny integrated tools may be added later
TMUX.sh               # standalone tmux installer (available now)
ZSH.sh                # standalone zsh installer (available now)
SSH.sh                # future standalone ssh installer
README.md
README.zh-CN.md
tests/
```

Every installer is a complete product of its own. It must:

- run directly without `dot.sh`;
- never `source`, invoke, or depend on another installer;
- detect and handle its own prerequisites;
- own its prompts, plan, execution, validation, backups, and recovery;
- be safely rerunnable and independently tested;
- return an honest exit status.

Small framework ideas may be copied between scripts. Runtime coupling is not
allowed. If both `TMUX.sh` and `ZSH.sh` need Git, both check Git themselves. This
duplication is intentional: idempotent checks are cheap, while hidden coupling
makes standalone downloads unreliable.

There is no dependency graph, dependency field, topological sort, or implicit
ordering. Selecting tmux and zsh means "run two independent installers", not
"build one combined transaction".

## `dot.sh`

`dot.sh` is a thin dispatcher, not a new installation framework. Its registry
remains small:

```bash
register_script tmux "TMUX.sh" "Install and configure tmux"
register_script zsh  "ZSH.sh"  "Install and configure zsh"
register_tool proxy  "Quick proxy setup"
```

There is deliberately no dependency field. The launcher will:

1. show every registered installer in a TUI;
2. let the user select one or more entries;
3. download only the selected standalone scripts;
4. validate each temporary file with at least `bash -n`;
5. run the scripts sequentially with `bash`;
6. continue past an unrelated failure and print a per-script summary;
7. clean up its temporary files.

It will not merge plans, share mutable installer state, resolve dependencies, or
promise an all-or-nothing rollback across scripts.

## Latest `master` download policy

Every invocation follows the latest `master`; reproducible version pinning is not
a goal for this launcher. To prevent `master` changing halfway through a multi-
script run, `dot.sh` should resolve the branch's commit SHA once at startup, then
download every selected script from that SHA:

```text
https://raw.githubusercontent.com/51hhh/dot/<resolved-sha>/TMUX.sh
```

This is still “latest master on every run”, but all selections in one run come
from one coherent snapshot. Download into files created with `mktemp`, validate,
then execute. Do not stream an unchecked response directly into `bash`.

Running code from latest `master` trusts every current commit. Users who need to
audit first should download and inspect the script before executing it.

## Tiny tools integrated into `dot.sh`

Utilities that are too small to deserve an installer may live directly in
`dot.sh`, for example:

- print or apply proxy variables to selected installer subprocesses;
- print commands that configure or clear the current shell's proxy;
- run quick network diagnostics.

They must remain small, reversible, and low-risk. A tool becomes a standalone
script once it owns persistent state, destructive behavior, substantial platform
branching, or enough logic to need its own test suite.

A process boundary matters for proxy configuration: `bash dot.sh` cannot export
variables into its parent shell. A future implementation must either scope proxy
variables to child installers, print commands for an explicit
`eval "$(dot.sh proxy ...)"`, or persist settings only after clear confirmation.
It must not claim that a child process permanently changed the caller's shell.

## Tests for `dot.sh`

- registry and menu rendering;
- exact mapping from selections to filenames;
- only selected scripts are downloaded, with no automatic dependencies;
- the latest `master` SHA is resolved exactly once per run;
- syntax validation happens before execution;
- download and child-process failures appear in the final summary;
- temporary files are cleaned up;
- proxy output, child-process scope, and clearing behavior are correct;
- unit tests stub downloads and never require the real network;
- a separate CI smoke test may verify the live raw GitHub path.
