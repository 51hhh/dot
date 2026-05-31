# Research: Installer Tool Execution Patterns

- **Query**: How do fishros, omakub, linutil, and webi execute user-selected options after menu selection?
- **Scope**: external
- **Date**: 2026-05-30

## 1. fishros (fish_install)

**Language**: Python

**Execution model**: `subprocess.Popen` with `shell=True` + `importlib.import_module()` for dynamic tool loading.

**Flow**:
1. Entry point `install.py` downloads `tools/base.py` via `wget` (using `os.system`)
2. Shows a categorized menu (`ChooseWithCategoriesTask`) for the user to pick a tool
3. Downloads the selected tool's `.py` file (and dependencies) via `os.system("wget ...")`
4. Calls `run_tool_file(module_path)` which uses `importlib.import_module()` to dynamically import the Python module
5. Instantiates the module's `Tool` class and calls `tool.init()` -> `tool.run()` -> `tool.uninit()`

**Shell commands within tools**: Each tool class uses `CmdTask` which wraps `subprocess.Popen(command, shell=True, executable='/bin/sh')`. There is also an `os_command=True` mode that uses `os.system()` directly.

**Error handling**: No global `set -e` equivalent. Each `CmdTask.run()` returns `(returncode, stdout, stderr)`. Individual tools check return codes and retry with fallback strategies (e.g., ROS source installation tries 3 different mirrors).

**State sharing**: A `ConfigHelper` class records user choices to `/tmp/fish_install.yaml` via a `Queue`. Can replay choices on subsequent runs. Tools share state through the Python process (global variables, imported modules).

**Key pattern**: Dynamic Python module loading. Tools are Python classes, not shell scripts.

---

## 2. omakub

**Language**: Bash

**Execution model**: `source` (same shell process). All install scripts run in the current shell.

**Flow**:
1. `install.sh` runs with `set -e` and a `trap ... ERR` handler
2. Sources `install/terminal/required/app-gum.sh` to get the `gum` TUI tool
3. Sources `install/first-run-choices.sh` which uses `gum choose` to collect user selections into exported env vars (`OMAKUB_FIRST_RUN_LANGUAGES`, `OMAKUB_FIRST_RUN_DBS`, etc.)
4. Sources `install/terminal.sh` which loops: `for installer in ~/.local/share/omakub/install/terminal/*.sh; do source $installer; done`
5. Each installer (e.g., `mise.sh`, `select-dev-language.sh`) is a standalone bash script that runs in the same shell

**Error handling**: `set -e` at the top of `install.sh`. The ERR trap prints a retry message. One failure stops the entire installation.

**State sharing**: Exported environment variables (`OMAKUB_FIRST_RUN_*`) persist across sourced scripts since they all run in the same shell. Scripts can also read each other's side effects (installed packages, config files).

**Key pattern**: All `source`, no subprocesses. Simple but fragile -- one bad installer breaks everything.

---

## 3. linutil (ChrisTitusTech)

**Language**: Rust (TUI) + shell scripts

**Execution model**: Spawns `sh -c <script>` inside a pseudo-terminal (PTY) using the `portable-pty` crate.

**Flow**:
1. TUI presents a tree of commands defined in TOML config files (`tab_data.toml`)
2. Entries can be `Command::Raw(String)` (inline shell) or `Command::LocalFile` (script file with shebang)
3. User selects one or more items (multi-select supported via `Space` key)
4. On confirm, `handle_confirm_command()` collects all selected commands into `Vec<&Command>`
5. `RunningCommand::new(commands)` concatenates all commands into a single script string, separated by newlines
6. Executes via `CommandBuilder::new("sh").arg("-c").arg(script)` inside a PTY

**Multi-select behavior**: All selected commands are joined into ONE script string and run as a single `sh -c` invocation. They share the same shell process, so state (cd, variables) carries over between them.

**Error handling**: No `set -e` in the generated script. Commands run sequentially; if one fails, the next continues. The TUI shows SUCCESS/FAILED based on the final exit status. User can kill with Ctrl-C.

**State sharing**: Since all commands are concatenated into one `sh -c` script, they share the same shell state (working directory, environment variables, etc.).

**Key pattern**: Rust TUI collects selections, concatenates into a single shell script string, runs in PTY subprocess.

---

## 4. webi

**Language**: POSIX shell (`/bin/sh`)

**Execution model**: Subshell via `( cd ...; sh script.sh )` -- each package installer runs in a child process.

**Flow**:
1. `curl -sS https://webi.sh | sh` pipes the bootstrap script to `sh`
2. `__webi_main()` loops over CLI args: `for pkgname in "$@"; do webinstall "$pkgname"; done`
3. `webinstall()` downloads the package-specific installer to a temp dir, then runs it in a subshell:
   ```sh
   (
       cd "${b_install_tmpdir}"
       sh "${b_package}-install.sh"
   )
   ```
4. Each installer defines `pkg_install()`, `pkg_link()`, `pkg_done_message()` functions and sources a template
5. After all packages, `show_path_updates()` reads `$_webi_tmp/.PATH.env` and tells the user to `source ~/.config/envman/PATH.env`

**Error handling**: `set -e` and `set -u` at the top. The subshell `( ... )` isolates failures -- if one package fails, it exits that subshell but the loop continues to the next package.

**State sharing between packages**: The `_webi_tmp` directory acts as a shared filesystem. Each installer appends to `$_webi_tmp/.PATH.env` to record PATH modifications. The `_WEBI_PARENT` / `_WEBI_CHILD` env vars track nested invocations.

**State sharing within a package**: Each installer runs as `sh script.sh` (not sourced), so it cannot modify the parent shell's PATH directly. Instead, it writes PATH changes to a file, and the parent prints instructions at the end.

**Key pattern**: Download-and-run in subshells. Filesystem (temp dir) for cross-installer state. Deferred PATH updates.

---

## Comparison Table

| Tool | Language | Execution | Error Isolation | State Sharing |
|------|----------|-----------|-----------------|---------------|
| fishros | Python | `subprocess.Popen(shell=True)` + `importlib` | Per-task return code checking | Python process memory + YAML config file |
| omakub | Bash | `source` (same shell) | None (`set -e` stops all) | Shell environment variables |
| linutil | Rust+sh | `sh -c <concatenated script>` in PTY | None (single script, no `set -e`) | Same shell (commands concatenated) |
| webi | POSIX sh | `( cd tmpdir; sh script.sh )` subshell | Per-package (subshell isolation) | Temp filesystem (`$WEBI_TMP/.PATH.env`) |

## Design Implications

- **omakub's `source` pattern** is simplest but most fragile -- one failure kills everything
- **webi's subshell pattern** provides the best error isolation but cannot modify parent shell state (requires deferred PATH updates)
- **linutil's concatenation pattern** allows state to flow between commands but couples them into one process
- **fishros's Python class pattern** is the most structured (init/run/uninit lifecycle) but requires Python
