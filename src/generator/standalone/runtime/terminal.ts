export function generateRuntimeTerminal(): string {
  return `DOT_PLAN=()
DOT_POST_PLAN=()
declare -A DOT_SELECTED=()
declare -A DOT_PLAN_ADDED=()
declare -A DOT_RESULTS=()
declare -A DOT_VARS=()

dot_get_var_or_default() {
  local var="$1" fallback="@{2:-}"
  if [[ -n "@{DOT_VARS[$var]+set}" ]]; then
    printf '%s' "@{DOT_VARS[$var]}"
  else
    printf '%s' "$fallback"
  fi
}

restore_terminal() {
  printf '\\033[?25h'
}
trap restore_terminal EXIT INT TERM

dot_clear_screen() {
  if [[ -t 1 ]]; then
    printf '\\033[2J\\033[H'
  fi
}

# Resolve input source: DOT_INPUT_FD > /dev/tty > fail
if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
  DOT_INPUT_SRC="fd:@{DOT_INPUT_FD}"
elif [[ -r /dev/tty ]]; then
  DOT_INPUT_SRC="/dev/tty"
else
  DOT_INPUT_SRC=""
fi

dot_require_input_src() {
  if [[ -z "$DOT_INPUT_SRC" ]]; then
    printf '\\nError: No input source available. Run this script directly (not via pipe).\\n' >&2
    return 1
  fi
  if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
    if [[ ! "@{DOT_INPUT_FD}" =~ ^[0-9]+$ ]]; then
      printf '\\nError: DOT_INPUT_FD must be a numeric file descriptor.\\n' >&2
      return 1
    fi
    return 0
  fi
  if [[ ! -r "$DOT_INPUT_SRC" ]]; then
    printf '\\nError: Input source %s is not readable.\\n' "$DOT_INPUT_SRC" >&2
    return 1
  fi
}

dot_read_line() {
  local result_var="$1" input_value
  dot_require_input_src || return 1
  if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
    IFS= read -r -u "@{DOT_INPUT_FD}" input_value || return 1
  else
    IFS= read -r input_value < "$DOT_INPUT_SRC" || return 1
  fi
  printf -v "$result_var" '%s' "$input_value"
}

dot_read_key() {
  local key seq
  dot_require_input_src || return 1
  if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
    IFS= read -rsn1 -u "@{DOT_INPUT_FD}" key || return 1
  else
    IFS= read -rsn1 key < "$DOT_INPUT_SRC" || return 1
  fi
  if [[ "$key" == $'\\e' ]]; then
    if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
      IFS= read -rsn1 -t 0.05 -u "@{DOT_INPUT_FD}" seq 2>/dev/null || seq=""
    else
      IFS= read -rsn1 -t 0.05 seq 2>/dev/null < "$DOT_INPUT_SRC" || seq=""
    fi
    key+="$seq"
    case "$seq" in
      '[')
        while true; do
          if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
            IFS= read -rsn1 -t 0.05 -u "@{DOT_INPUT_FD}" seq 2>/dev/null || break
          else
            IFS= read -rsn1 -t 0.05 seq 2>/dev/null < "$DOT_INPUT_SRC" || break
          fi
          key+="$seq"
          case "$seq" in
            [@-~]) break ;;
          esac
        done
        ;;
      O)
        if [[ -n "@{DOT_INPUT_FD:-}" ]]; then
          IFS= read -rsn1 -t 0.05 -u "@{DOT_INPUT_FD}" seq 2>/dev/null || seq=""
        else
          IFS= read -rsn1 -t 0.05 seq 2>/dev/null < "$DOT_INPUT_SRC" || seq=""
        fi
        key+="$seq"
        ;;
    esac
  fi
  printf '%s' "$key"
}

dot_is_back_key() {
  local key="$1"
  case "$key" in
    b|B|$'\\e[D'|$'\\eOD'|$'\\e['*D|$'\\eO'*D) return 0 ;;
    *) return 1 ;;
  esac
}

dot_pause() {
  printf "\\nPress any key to continue..."
  dot_read_key >/dev/null || true
}`;
}
