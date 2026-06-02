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

dot_read_key() {
  local key seq
  IFS= read -rsn1 key || return 1
  if [[ "$key" == $'\\e' ]]; then
    IFS= read -rsn1 -t 0.05 seq 2>/dev/null || seq=""
    key+="$seq"
    case "$seq" in
      '[')
        while IFS= read -rsn1 -t 0.05 seq 2>/dev/null; do
          key+="$seq"
          case "$seq" in
            [@-~]) break ;;
          esac
        done
        ;;
      O)
        IFS= read -rsn1 -t 0.05 seq 2>/dev/null || seq=""
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
