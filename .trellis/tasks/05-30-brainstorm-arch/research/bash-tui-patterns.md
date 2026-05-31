# Research: Bash TUI Patterns for Interactive Menus

- **Query**: How similar CLI tools implement interactive TUI menus in pure bash (no external dependencies)
- **Scope**: external
- **Date**: 2026-05-30

## Summary

Most "installer with menus" projects do NOT use pure bash for TUI. They either:
1. Use an external tool (gum, dialog, whiptail, fzf)
2. Use a non-bash language (Python, Rust, Go)
3. Use simple `read`/`select` with numbered lists (no arrow keys)

For a self-contained bash script with arrow-key menus, the patterns are well-established but require careful implementation.

---

## Projects Analyzed

### 1. fishros (ROS Installer)

- **Repo**: https://github.com/fishros/fish_install
- **Language**: Python (not bash)
- **Menu**: Numbered list + `input()` prompt
- **Pattern**: Prints `[1]:description`, `[2]:description`, user types number
- **Not applicable** to pure bash TUI

### 2. omakub (Basecamp Dev Setup)

- **Repo**: https://github.com/basecamp/omakub
- **Language**: Bash
- **Menu**: Uses `gum` (external Go binary from Charmbracelet)
- **Pattern**: `gum choose --no-limit --selected ... --header "Select X"`
- **Self-contained**: No - downloads gum at install time (`app-gum.sh`)
- **Key file**: `install/first-run-choices.sh`

```bash
# omakub pattern:
AVAILABLE_LANGUAGES=("Ruby on Rails" "Node.js" "Go" "PHP" "Python")
SELECTED_LANGUAGES="Ruby on Rails","Node.js"
export OMAKUB_FIRST_RUN_LANGUAGES=$(gum choose "${AVAILABLE_LANGUAGES[@]}" \
  --no-limit --selected "$SELECTED_LANGUAGES" --height 10 \
  --header "Select programming languages")
```

### 3. webi (webinstall.dev)

- **Repo**: https://github.com/webinstall/webi-installers
- **Language**: Pure POSIX sh
- **Menu**: NO interactive menu - single package installer
- **Pattern**: `curl -sS https://webinstall.dev/XXX | sh`
- **Color handling**: Excellent pure-sh pattern using `\e[` codes

```bash
# webi color pattern (portable, no tput):
t_cmd()  { fn_printf '\e[2m\e[35m%s\e[39m\e[22m' "${1}"; }
t_pkg()  { fn_printf '\e[1m\e[32m%s\e[39m\e[22m' "${1}"; }
t_err()  { fn_printf '\e[31m%s\e[39m' "${1}"; }
t_bold() { fn_printf '\e[1m%s\e[22m' "${1}"; }
t_dim()  { fn_printf '\e[2m%s\e[22m' "${1}"; }

fn_printf() {
    a_style="${1}"; a_text="${2}"
    if fn_is_tty; then
        printf -- "${a_style}" "${a_text}"
    else
        printf -- '%s' "${a_text}"
    fi
}
```

### 4. chezmoi (Dotfile Manager)

- **Repo**: https://github.com/twpayne/chezmoi
- **Language**: Go
- **Menu**: Uses Go TUI library (bubbletea/charm)
- **Not applicable** to pure bash

### 5. linutil (Chris Titus Tech)

- **Repo**: https://github.com/ChrisTitusTech/linutil
- **Language**: Rust (TUI binary)
- **Launcher**: `start.sh` downloads and runs Rust binary
- **Not applicable** to pure bash

### 6. bash-it

- **Repo**: https://github.com/Bash-it/bash-it
- **Color pattern**: Uses `tput` with fallback

```bash
BOLD=$(tput bold 2>/dev/null || echo "")
CYAN=$(tput setaf 6 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")
```

---

## Pure Bash TUI Patterns

### Pattern 1: Arrow Key Detection (ANSI Escape Codes)

Arrow keys send multi-byte escape sequences. In bash:

```bash
# Read a single keypress (including escape sequences)
read_key() {
    local key
    IFS= read -rsn1 key 2>/dev/null
    
    # Check for escape sequence (arrow keys, etc.)
    if [[ "$key" == $'\e' ]]; then
        local seq=""
        IFS= read -rsn1 -t 0.01 seq 2>/dev/null
        key+="$seq"
        IFS= read -rsn1 -t 0.01 seq 2>/dev/null
        key+="$seq"
    fi
    
    echo "$key"
}

# Arrow key constants
ARROW_UP=$'\e[A'
ARROW_DOWN=$'\e[B'
ARROW_RIGHT=$'\e[C'
ARROW_LEFT=$'\e[D'
ENTER=$'\n'
SPACE=' '
```

### Pattern 2: Interactive Menu with Arrow Navigation

```bash
#!/usr/bin/env bash

# Menu with arrow key navigation
menu_select() {
    local title="$1"
    shift
    local options=("$@")
    local selected=0
    local key
    
    # Hide cursor
    tput civis 2>/dev/null || printf '\e[?25l'
    
    while true; do
        # Clear previous output (move cursor up N lines)
        printf "\033[${#options[@]}A"
        
        echo "$title"
        for i in "${!options[@]}"; do
            if [[ $i -eq $selected ]]; then
                echo -e " \033[36m>\033[0m ${options[$i]}"  # Highlighted
            else
                echo "   ${options[$i]}"
            fi
        done
        
        # Read key
        IFS= read -rsn1 key 2>/dev/null
        if [[ "$key" == $'\e' ]]; then
            local seq=""
            IFS= read -rsn1 -t 0.01 seq 2>/dev/null
            key+="$seq"
            IFS= read -rsn1 -t 0.01 seq 2>/dev/null
            key+="$seq"
        fi
        
        case "$key" in
            $'\e[A')  # Up
                ((selected > 0)) && ((selected--))
                ;;
            $'\e[B')  # Down
                ((selected < ${#options[@]} - 1)) && ((selected++))
                ;;
            '')       # Enter
                break
                ;;
        esac
    done
    
    # Show cursor
    tput cnorm 2>/dev/null || printf '\e[?25h'
    
    echo "$selected"
}
```

### Pattern 3: Checkbox/Multi-Select in Bash

```bash
#!/usr/bin/env bash

# Multi-select with checkboxes
multi_select() {
    local title="$1"
    shift
    local options=("$@")
    local -a checked=()
    local selected=0
    local key
    
    # Initialize all unchecked
    for i in "${!options[@]}"; do
        checked[$i]=0
    done
    
    # Hide cursor
    tput civis 2>/dev/null || printf '\e[?25l'
    
    while true; do
        # Clear previous output
        printf "\033[$((${#options[@]} + 2))A"
        
        echo "$title"
        echo "  (Space=toggle, Enter=confirm)"
        for i in "${!options[@]}"; do
            local mark=" "
            [[ ${checked[$i]} -eq 1 ]] && mark="X"
            
            if [[ $i -eq $selected ]]; then
                echo -e " \033[36m>\033[0m [\033[32m${mark}\033[0m] ${options[$i]}"
            else
                echo "   [${mark}] ${options[$i]}"
            fi
        done
        
        # Read key
        IFS= read -rsn1 key 2>/dev/null
        if [[ "$key" == $'\e' ]]; then
            local seq=""
            IFS= read -rsn1 -t 0.01 seq 2>/dev/null
            key+="$seq"
            IFS= read -rsn1 -t 0.01 seq 2>/dev/null
            key+="$seq"
        fi
        
        case "$key" in
            $'\e[A')  # Up
                ((selected > 0)) && ((selected--))
                ;;
            $'\e[B')  # Down
                ((selected < ${#options[@]} - 1)) && ((selected++))
                ;;
            ' ')      # Space - toggle
                checked[$selected]=$(( 1 - checked[$selected] ))
                ;;
            '')       # Enter - confirm
                break
                ;;
        esac
    done
    
    # Show cursor
    tput cnorm 2>/dev/null || printf '\e[?25h'
    
    # Return checked indices
    for i in "${!checked[@]}"; do
        [[ ${checked[$i]} -eq 1 ]] && echo "$i"
    done
}
```

### Pattern 4: Colored Output (No External Deps)

```bash
# Method 1: Raw ANSI codes (most portable)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'  # No Color

echo -e "${GREEN}Success${NC}: operation completed"

# Method 2: tput (more readable, but less portable)
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

# Method 3: printf (POSIX compliant)
printf '\033[32m%s\033[0m\n' "Success"

# Webi's approach: helper function with TTY check
fn_printf() {
    local style="$1" text="$2"
    if [[ -t 1 ]]; then  # Is stdout a terminal?
        printf -- "$style" "$text"
    else
        printf -- '%s' "$text"
    fi
}
```

### Pattern 5: Terminal Width Detection

```bash
# Method 1: Using COLUMNS variable (set by bash)
get_term_width() {
    shopt -s checkwinsize; (:;:)
    echo "${COLUMNS:-80}"
}

# Method 2: Using tput
get_term_width() {
    tput cols 2>/dev/null || echo 80
}

# Method 3: Using stty (POSIX)
get_term_width() {
    local size
    size=$(stty size 2>/dev/null) || size="24 80"
    echo "${size#* }"
}

# Method 4: Using escape sequence (from pure-bash-bible)
get_cursor_pos() {
    IFS='[;' read -p $'\e[6n' -d R -rs _ y x _
    echo "$x $y"
}
```

### Pattern 6: Progress Spinner

```bash
spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while kill -0 "$pid" 2>/dev/null; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\r"
    done
    printf "    \r"
}
```

### Pattern 7: `select` Built-in (Simplest)

```bash
# Bash built-in select (simple but limited)
options=("Option 1" "Option 2" "Option 3" "Quit")
select opt in "${options[@]}"; do
    case $opt in
        "Option 1") echo "Selected 1"; break ;;
        "Option 2") echo "Selected 2"; break ;;
        "Option 3") echo "Selected 3"; break ;;
        "Quit") break ;;
        *) echo "Invalid option" ;;
    esac
done
```

---

## Key Technical Details

### ANSI Escape Code Reference

```
\033[0m     - Reset all
\033[1m     - Bold
\033[2m     - Dim
\033[3m     - Italic
\033[4m     - Underline
\033[30-37m - Foreground colors (black, red, green, yellow, blue, magenta, cyan, white)
\033[40-47m - Background colors
\033[90-97m - Bright foreground
\033[0;31m  - Red (standard)
\033[1;33m  - Yellow (bold)
\033[2;32m  - Green (dim)

# Cursor control
\033[nA    - Move cursor up n lines
\033[nB    - Move cursor down n lines
\033[nC    - Move cursor forward n chars
\033[nD    - Move cursor backward n chars
\033[2J    - Clear entire screen
\033[K     - Clear to end of line
\033[?25l  - Hide cursor
\033[?25h  - Show cursor
```

### Terminal Capability Detection

```bash
# Check if stdout is a terminal
if [[ -t 1 ]]; then
    # We're in a terminal
fi

# Check color support
if [[ $(tput colors 2>/dev/null) -ge 8 ]]; then
    # Supports 8+ colors
fi

# Check for 256 colors
if [[ $(tput colors 2>/dev/null) -ge 256 ]]; then
    # Supports 256 colors
fi
```

---

## Recommendations for Self-Contained Scripts

### Minimal Arrow-Key Menu

For a self-contained script, the minimal approach:

1. Use `read -rsn1` for single keypress reading
2. Detect escape sequences with $'\e' prefix
3. Use ANSI codes for cursor movement and colors
4. Use `tput civis`/`tput cnorm` or `\e[?25l`/`\e[?25h` for cursor visibility
5. No external dependencies needed

### Simplest Working Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

# Simple menu with Enter-only selection (no arrow keys)
simple_menu() {
    local title="$1"
    shift
    local options=("$@")
    
    echo "$title"
    echo "─────────────────────"
    for i in "${!options[@]}"; do
        echo "  [$((i+1))] ${options[$i]}"
    done
    echo "─────────────────────"
    
    local choice
    read -rp "  Select (1-${#options[@]}): " choice
    echo "$choice"
}
```

### Advanced Pattern: Nested Menu Navigation

For hierarchical menus (like dot's current Node.js implementation):

```bash
#!/usr/bin/env bash
set -euo pipefail

declare -A MENU_ITEMS
declare -A MENU_CHILDREN
declare -A MENU_LABELS

# Build menu tree from config
build_menu() {
    # Parse YAML/JSON and populate arrays
    :
}

# Navigate menu with back/forward
navigate() {
    local current="root"
    local -a breadcrumb=()
    
    while true; do
        # Show current level
        show_menu "$current"
        
        # Handle selection
        case "$action" in
            enter)  breadcrumb+=("$current"); current="$selected" ;;
            back)   current="${breadcrumb[-1]}"; unset 'breadcrumb[-1]' ;;
            quit)   break ;;
        esac
    done
}
```

---

## Existing Project Patterns (Current Codebase)

The current `dot` tool:
- Uses Node.js readline for interactive menu (`src/menu/render.ts`)
- Generates bash scripts with color logging (`src/generator/assembler.ts`)
- Already uses ANSI codes in generated scripts (RED, GREEN, YELLOW, CYAN, NC)
- Generated scripts have `log_info()`, `log_ok()`, `log_warn()`, `log_error()` helpers

The generated bash scripts currently lack:
- Interactive menu selection
- Arrow key navigation
- Checkbox support
- Terminal width awareness

---

## Caveats / Not Found

1. **fishros**: Actually Python-based, not pure bash
2. **omakub**: Uses external `gum` binary (not self-contained)
3. **chezmoi**: Go-based, not bash
4. **linutil**: Rust-based TUI
5. No widely-used pure-bash TUI library found - most projects that need rich TUI use external tools

## External References

- [Pure Bash Bible](https://github.com/dylanaraps/pure-bash-bible) - Terminal info patterns
- [Charmbracelet gum](https://github.com/charmbracelet/gum) - Go-based TUI (used by omakub)
- [dialog(1) man page](https://man7.org/linux/man-pages/man1/dialog.1.html) - ncurses-based dialog
- [whiptail(1)](https://man7.org/linux/man-pages/man1/whiptail.1.html) - lighter dialog alternative
- ANSI escape code reference: https://en.wikipedia.org/wiki/ANSI_escape_code
