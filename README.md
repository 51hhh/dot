<h1 align="center">dot</h1>

<p align="center">
  Interactive terminal setup, in pure Bash. Single file, no build step, testable.
</p>

<p align="center">
  <a href="https://github.com/51hhh/dot/actions">
    <img src="https://github.com/51hhh/dot/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

---

## Quick start

```bash
# Select one or more available installers
bash <(curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/dot.sh)

# Interactive
bash <(curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh)

# Zsh directly
bash <(curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/ZSH.sh)

# Classic pipe — also works, input is read from /dev/tty, not stdin
curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh | bash

# Read before you run (recommended)
curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh -o TMUX.sh
less TMUX.sh && bash TMUX.sh
```

Non-interactive — CI, provisioning, reinstalls:

```bash
bash TMUX.sh --preset recommended --yes
bash ZSH.sh --preset recommended --yes
```

> **Requires bash ≥ 4.2.** The script leans on associative arrays and `declare -g`
> (the latter landed in 4.2). It checks the version at startup and tells you.
> macOS ships bash 3.2 — `brew install bash` first.

## There is no build step

Deliberately. `TMUX.sh`, `ZSH.sh`, and `dot.sh` **are** the artifacts — the files
you read are the files that run.

- **Nothing to generate locally.** Clone, then run the installer you want.
- **CI does not produce scripts.** It only verifies: `bash -n`, the installers'
  `--lint`, shellcheck, shfmt, 240 bats tests, and real installs inside four
  distro containers (Ubuntu 22.04/24.04, Debian 12, Fedora 44). No artifact is
  uploaded, no branch is written to, no `dist/` is committed.
- **Each download URL is just a file in the repo:** `TMUX.sh`, `ZSH.sh`, or
  `dot.sh` under `https://raw.githubusercontent.com/51hhh/dot/master/`.

The previous architecture did have a build (TypeScript → a generated `dist/dot.sh`,
assembled from YAML configs plus ~80 template fragments, published to a web host).
That indirection was the main source of its pain: what you downloaded was not what
anyone had read, a bug meant bisecting the generator instead of the script, and
`curl | bash` required the whole pipeline to have run correctly first. Removing the
generator removed a whole class of failure — so a build step is not a feature that
is missing here, it is one that was taken out.

## What it does

`TMUX.sh` installs and configures tmux: install method (package manager — apt,
dnf, pacman or zypper — build from source, or skip), prefix key, 8 common plugins
(TPM, sensible, yank, cpu, battery, Catppuccin, vim-tmux-navigator, tmuxifier),
5 base options (mouse, Vi copy mode, 1-based indexing, intuitive splits,
`prefix+r` reload), a Nerd Font (downloaded and installed for you — without one
the status bar icons are just boxes), and a full uninstall. Picking
**recommended** expands to a 21-step plan in one keystroke.

`ZSH.sh` independently installs zsh, Oh My Zsh, Powerlevel10k,
zsh-autosuggestions, zsh-syntax-highlighting, the `git` / `z` / `extract`
plugins, and four MesloLGS Nerd Font faces. It backs up `~/.zshrc`, can change the
login shell explicitly, and is safe to rerun. `dot.sh` is the thin TUI launcher;
neither installer needs it or the other installer.

## Architecture

One directed pipeline. The four stages are joined only by **data**:

```
ASK  ──►  answers  ──►  PLAN  ──►  RUN
prompts   plain k=v     pure fn    side effects
needs TTY serializable  testable   installs / writes files
```

Everything follows from `answers` being an ordinary key/value table that can be
written to a file or supplied with `--set`:

- **Planning is a pure function.** `build_plan` reads `answers`, writes the `PLAN`
  array, and does nothing else — no output, no disk. Testing "given these answers,
  what would it do" needs no TTY, no root, no network, no Docker. Milliseconds.
- **Every bug reproduces in one command.** A user sends the file from
  `--save-answers`; `--answers that-file --dry-run` yields byte-identical results.
  No more "what did you click?".

### Four declaration primitives

The entire product surface lives in §8, about 40 lines. Add features there; the
engine stays untouched.

```bash
recipe "Tmux 一键配置" "安装方式、前缀键、插件、基础选项"

ask one  tmux.install "安装方式" --when tmux.profile=custom \
  apt:"包管理器安装（快，版本可能偏旧）" \
  source:"源码编译（最新版，需编译环境）" \
  skip:"已装好，跳过安装"

ask text tmux.source_version "要编译的 tmux 版本" \
  --when tmux.profile=custom --when tmux.install=source --default 3.4

step tmux.opt.mouse configure \
  --when tmux.profile!=uninstall --when tmux.options~mouse \
  --label "启用鼠标支持"

preset recommended --when tmux.profile=recommended \
  tmux.install=apt \
  tmux.plugins="tpm sensible yank cpu battery catppuccin vim-navigator tmuxifier"
```

| Primitive | Meaning |
| --- | --- |
| `recipe <title> <desc>` | Header shown on every screen |
| `ask one\|many\|text\|number <key> <label> [--when E] [--default V] [k:desc...]` | One question ⇒ one answers key |
| `step <id> <phase> [--when E] [--label T]` | One step; its body is `step_<id>` with `.` and `-` mapped to `_` |
| `preset <name> [--when E] k=v...` | A bundle of answers; never overwrites what the user explicitly chose |

### Four phases, no dependency graph

```
prepare  →  install  →  configure  →  final
```

Steps run in declaration order within a phase; phases run in fixed order. **No
topological sort, no dependency edges, no cycle detection.** The old architecture
needed 13 dependency types to express "TPM init must run last"; here you declare
it `final`. A failure in `prepare`/`install` aborts what remains; a failure in
`configure`/`final` warns and continues.

### `when`: four operators, no parser

| Form | Meaning |
| --- | --- |
| `key=value` | equals |
| `key!=value` | not equal — **true when the key is unset**, which is what makes `tmux.profile!=uninstall` work before anything is answered |
| `key~word` | whole-word membership in a multi-select answer (`~tmux` does not match `tmuxifier`) |
| `key` | non-empty |

No nesting, no `and`/`or` keywords, no precedence. For AND, **repeat `--when`** —
all must hold. For OR, declare two steps. That is cheaper than making the reader
evaluate a boolean expression in their head.

Deliberately **not** expressible: hiding a question, ending the flow early. They
cannot be written down in this model, so there is no validation rule forbidding them.

### Navigation is a history stack, not `index ± 1`

`when` makes the visible-question list change shape as answers change: `custom`
shows 5 questions, `recommended` shows 1. Stepping back by index would land on a
question that no longer exists. So `run_ask` keeps a `HIST` stack — going back pops
it, then the visible list is recomputed.

Going back **keeps** the answers you already gave, but undoes values a `preset`
applied automatically (`clear_preset_keys`) — otherwise backing out of
"recommended" into "custom" drags along eight plugins you never picked.

## Command line

| Flag | Effect |
| --- | --- |
| `--preset <name>` | Apply a preset |
| `--set k=v` | Set one answer; later occurrences win, so it overrides `--preset`. An unknown key — or an unknown value for a choice question — is a hard error |
| `--answers <file>` | Read answers from a file (`#` comments and blank lines allowed) |
| `--save-answers <file>` | Write the final answers out, for reproduction and bug reports |
| `--only <step-id>` | Run only these steps, repeatable; plan order preserved |
| `--dry-run` | Print the plan, execute nothing |
| `--list` | List every question and step with its `when` conditions, and the download sources in the order they will be tried |
| `--lint` | Check the declarations (also runs automatically before any execution) |
| `--mirror <prefix>` | Add a GitHub mirror prefix |
| `-y, --yes` | Skip the confirmation screen |

### Debugging workflow

```bash
# 1. The reporter exports their answers
bash TMUX.sh --save-answers bug.txt

# 2. You see exactly what it would do — nothing is touched
bash TMUX.sh --answers bug.txt --dry-run

# 3. Run just the suspect step
bash TMUX.sh --answers bug.txt --only tmux.status.catppuccin
```

## Testing

```bash
./run-tests.sh          # everything
./run-tests.sh lint     # bash -n + --lint + shellcheck
./run-tests.sh bats     # behaviour
./run-tests.sh fmt      # shfmt, in place
```

Uses local `shellcheck` / `shfmt` / `bats` when present, else falls back to Docker
images. 240 bats tests in eight files:

| File | Covers | Needs |
| --- | --- | --- |
| `tests/when.bats` | truth table for all four operators, plus AND composition | nothing |
| `tests/plan.bats` | answers → plan: phase order, presets, mutual exclusion | nothing |
| `tests/conf.bats` | the generated `~/.tmux.conf`, and idempotence | a temp HOME |
| `tests/cli.bats` | flag parsing, exit codes, `curl \| bash`, lint negatives | nothing |
| `tests/ask.bats` | interactive navigation, keystrokes injected via `DOT_INPUT_FD` | nothing |
| `tests/run.bats` | failure policy per phase, mirror fallback order, font skip logic and extraction whitelist, package-manager layer, tmux version floor, session-preserving cleanup | nothing |
| `tests/zsh.bats` | Zsh plan, cloning and font idempotence, backups, critical failure policy | a temp HOME |
| `tests/dot.bats` | registry, selection isolation, snapshot URLs, validation and result summary | nothing |

Filesystem tests write only inside `$BATS_TEST_TMPDIR`.
Interactive tests need no pty — keystrokes are fed through a plain fd:

```bash
exec 7< <(printf '\033[B\n')      # down once, then Enter
DOT_INPUT_FD=7 bash TMUX.sh --save-answers out.txt
```

Enter is `\n` here, not `\r`: a real terminal translates CR to LF for us
(`ICRNL`), a plain fd does not. `read_key` normalises `\r` anyway, so both work —
but the tests use `\n` because that is what a terminal actually delivers.

## Layout

```
TMUX.sh          # the whole implementation, sectioned §1..§11
├─ §1  core      # version gate, colours, logging, sudo
├─ §2  tty       # input probing, one read path, cursor control
├─ §3  registry  # the Q / S / ANS tables and their registrars
├─ §4  ask       # history-stack navigation, four question renderers
├─ §5  plan      # when evaluation, build_plan (pure), warn_answers
├─ §6  run       # phase execution, failure policy, summary
├─ §7  net       # GitHub mirror fallback, curl/wget and git clone fallback
├─ §8  declare   # ★ all product logic: questions, presets, steps
├─ §9  steps     # one step_* function per step
├─ §10 lint      # declaration self-check
└─ §11 cli       # argument parsing and main
ZSH.sh           # standalone Zsh / Oh My Zsh installer
dot.sh           # thin TUI downloader and dispatcher
tests/*.bats     # installer and dispatcher behaviour
run-tests.sh     # local / Docker test entry point
```

Section numbers map 1:1 onto a possible future `lib/` split. It stays one file
because `curl | bash` is the primary distribution channel — multiple files would
need packaging and concatenation, which is precisely where the previous
architecture's complexity came from.

## Multi-script architecture

`TMUX.sh` and `ZSH.sh` are standalone, self-contained, idempotent installers.
Future environments such as SSH will follow the same rule: they are not recipes
inside another installer and never depend on one another.

`dot.sh` provides a TUI for selecting one or more available scripts, resolves the
latest `master` once, validates the downloads, and runs them sequentially. It is
a thin launcher, not a dependency manager. Tiny integrated utilities such as
quick proxy setup remain planned.

The boundaries, latest-branch policy, proxy process semantics, and required tests
are recorded in [ARCHITECTURE.md](ARCHITECTURE.md) ([简体中文](ARCHITECTURE.zh-CN.md)).

## Security notes

- Installing tmux needs `sudo`. It is only invoked where required and always
  through one entry point — `grep dot_sudo TMUX.sh` shows every use.
- `~/.tmux.conf` is backed up to `~/.tmux.conf.bak.<timestamp>` before being
  overwritten — unless the current file is byte-identical to the newest backup,
  in which case re-running does not pile up copies of the same thing.
- Running tmux sessions are never killed. The socket-cleanup step lists them and
  skips itself instead; `kill-server` would take down everything running inside
  them, which is far more than that step is worth.
- Mirrors added via `--mirror` / `DOT_GITHUB_MIRRORS` are a **third-party trust
  root**; the script does no checksum or signature verification. GitHub is
  contacted directly by default and mirrors are strictly opt-in. `--list` prints
  the sources in the order they will be tried.
- Network fetches are limited to three GitHub projects: `tmux/tmux` (source
  builds), `tmux-plugins/tpm` (plugins), `ryanoasis/nerd-fonts` (the font).
- The font step is the only heavy download: nerd-fonts ships one asset per family,
  so the zip is >100 MB no matter what. Only the regular/bold/italic/bold-italic
  faces of two families are extracted — `JetBrainsMono Nerd Font Mono` (what a
  terminal should be set to) and `JetBrainsMono Nerd Font` (the name every doc and
  font picker uses) — 8 files, ~20 MB on disk instead of 233 MB. It re-runs as a
  no-op once both families are present — a half-installed state left by an older
  version (Mono only) is topped up rather than mistaken for done. And it runs in
  `final`, so a rate-limited GitHub cannot invalidate the tmux config you just
  got. `--set tmux.font=skip` opts out.
  The step prints the exact family names fontconfig ended up with; a picker that
  was already open needs the app restarted, since font lists are read at startup.
- `Ctrl-C` aborts for real. It restores the cursor and exits 130 rather than
  falling through to the next step.
- `--dry-run` is guaranteed side-effect free. When unsure, run that first.
- `ZSH.sh` follows the upstream Oh My Zsh layout and Powerlevel10k's four
  officially recommended MesloLGS NF faces. It validates each cloned component's
  entry file, and keeps `zsh-syntax-highlighting` last as required upstream.
- Components cloned by `ZSH.sh` receive an ownership marker. Uninstall removes
  only marked components, preserves a pre-existing `~/.oh-my-zsh`, the user's
  `~/.p10k.zsh`, and `.zshrc` backups. The generated config loads `~/.p10k.zsh`
  when present, so rerunning does not disconnect the P10k wizard's result.
