export function generateBashRuntime(): string {
  return `set -uo pipefail

if [[ -z "@{BASH_VERSION:-}" ]]; then
  echo "This script requires bash." >&2
  exit 1
fi

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
BOLD='\\033[1m'
DIM='\\033[2m'
NC='\\033[0m'

log_info()  { printf "%b[INFO]%b  %s\\n" "$CYAN" "$NC" "$*"; }
log_ok()    { printf "%b[OK]%b    %s\\n" "$GREEN" "$NC" "$*"; }
log_warn()  { printf "%b[WARN]%b  %s\\n" "$YELLOW" "$NC" "$*"; }
log_error() { printf "%b[ERROR]%b %s\\n" "$RED" "$NC" "$*"; }

readonly -a DOT_GITHUB_MIRRORS=(
  ''
  'https://gh.ddlc.top/'
  'https://gh.llkk.cc/'
  'https://ghfast.top/'
  'https://gh-proxy.com/'
  'https://ghproxy.net/'
  'https://hub.gitmirror.com/'
  'https://ghproxy.cc/'
  'https://ghproxy.cn/'
  'https://ghproxy.com/'
  'https://mirror.ghproxy.com/'
)
DOT_GITHUB_SELECTED_PREFIX=""
DOT_GITHUB_ORDERED_PREFIXES=()
DOT_GITHUB_MIRROR_TESTED=0

dot_sudo() {
  if [[ "@{EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi

  log_error "需要 root 权限执行: $*"
  log_error "请以 root 运行，或先安装 sudo 并授予当前用户权限。"
  return 1
}

dot_github_ordered_prefixes() {
  local prefix existing seen
  local ordered=()

  if [[ -n "@{DOT_GITHUB_SELECTED_PREFIX:-}" ]]; then
    ordered+=("$DOT_GITHUB_SELECTED_PREFIX")
  fi

  for prefix in "@{DOT_GITHUB_ORDERED_PREFIXES[@]:-}"; do
    seen=0
    for existing in "@{ordered[@]:-}"; do
      if [[ "$existing" == "$prefix" ]]; then seen=1; fi
    done
    if [[ "$seen" == "0" ]]; then ordered+=("$prefix"); fi
  done

  for prefix in "@{DOT_GITHUB_MIRRORS[@]}"; do
    seen=0
    for existing in "@{ordered[@]:-}"; do
      if [[ "$existing" == "$prefix" ]]; then seen=1; fi
    done
    if [[ "$seen" == "0" ]]; then ordered+=("$prefix"); fi
  done

  printf '%s\n' "@{ordered[@]}"
}

dot_github_url() {
  local prefix="$1" url="$2"
  if [[ -z "$prefix" ]]; then
    printf '%s' "$url"
  else
    printf '%s%s' "$prefix" "$url"
  fi
}

dot_download_from_url() {
  local url="$1" out="$2"
  local downloader

  if command -v wget >/dev/null 2>&1; then
    downloader="wget"
  elif command -v curl >/dev/null 2>&1; then
    downloader="curl"
  else
    log_error "下载失败：系统中未找到 wget 或 curl。"
    return 1
  fi

  mkdir -p "$(dirname "$out")"
  if [[ "$downloader" == "wget" ]]; then
    wget --tries=2 --timeout=30 -q -O "$out" "$url"
  else
    curl -fL --connect-timeout 10 --max-time 180 -o "$out" "$url"
  fi
}

dot_download_with_fallback() {
  local url="$1" out="$2"
  local prefix candidate downloader

  if command -v wget >/dev/null 2>&1; then
    downloader="wget"
  elif command -v curl >/dev/null 2>&1; then
    downloader="curl"
  else
    log_error "下载失败：系统中未找到 wget 或 curl。"
    return 1
  fi

  mkdir -p "$(dirname "$out")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$url")"
    if [[ -z "$prefix" ]]; then
      log_info "下载（直连）: $url"
    else
      log_info "下载（镜像）: $candidate"
    fi

    if [[ "$downloader" == "wget" ]]; then
      if wget --tries=2 --timeout=30 -q -O "$out" "$candidate"; then
        log_ok "下载成功"
        return 0
      fi
    else
      if curl -fL --connect-timeout 10 --max-time 180 -o "$out" "$candidate"; then
        log_ok "下载成功"
        return 0
      fi
    fi

    rm -f "$out"
    log_warn "本次下载失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  log_error "所有下载源均失败: $url"
  log_warn "如 GitHub 不可达，请配置 https_proxy/http_proxy 后重试，或手动下载到目标路径。"
  return 1
}

dot_git_clone_with_fallback() {
  local repo="$1" dest="$2"
  shift 2
  local prefix candidate
  local extra_args=("$@")

  if ! command -v git >/dev/null 2>&1; then
    log_error "克隆失败：系统中未找到 git。"
    return 1
  fi

  mkdir -p "$(dirname "$dest")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$repo")"
    if [[ -z "$prefix" ]]; then
      log_info "克隆（直连）: $repo"
    else
      log_info "克隆（镜像）: $candidate"
    fi

    if git clone "@{extra_args[@]}" "$candidate" "$dest"; then
      log_ok "克隆成功"
      return 0
    fi

    if [[ ! -d "$dest/.git" ]]; then
      rm -rf "$dest"
    fi
    log_warn "本次克隆失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  log_error "所有 GitHub 克隆源均失败: $repo"
  return 1
}

dot_git_pull_with_fallback() {
  local repo_dir="$1" repo="$2"
  local original candidate prefix updated=0

  original="$(git -C "$repo_dir" remote get-url origin 2>/dev/null || printf '%s' "$repo")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$repo")"
    if [[ -z "$prefix" ]]; then
      log_info "更新 TPM（直连）: $candidate"
    else
      log_info "更新 TPM（镜像）: $candidate"
    fi

    if git -C "$repo_dir" remote set-url origin "$candidate" && git -C "$repo_dir" pull --ff-only; then
      updated=1
      break
    fi
    log_warn "本次 TPM 更新失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  git -C "$repo_dir" remote set-url origin "$original" 2>/dev/null || true
  [[ "$updated" == "1" ]]
}

DOT_PLAN=()
DOT_POST_PLAN=()
declare -A DOT_SELECTED=()
declare -A DOT_PLAN_ADDED=()
declare -A DOT_RESULTS=()
declare -A DOT_VARS=()

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
}


dot_key_to_tmux() {
  local key="$1"
  case "$key" in
    $'\x01') printf 'C-a' ;;
    $'\x02') printf 'C-b' ;;
    $'\x03') printf 'C-c' ;;
    $'\x04') printf 'C-d' ;;
    $'\x05') printf 'C-e' ;;
    $'\x06') printf 'C-f' ;;
    $'\x07') printf 'C-g' ;;
    $'\x08') printf 'C-h' ;;
    $'\x09') printf 'C-i' ;;
    $'\x0a') printf 'C-j' ;;
    $'\x0b') printf 'C-k' ;;
    $'\x0c') printf 'C-l' ;;
    $'\x0d') printf 'C-m' ;;
    $'\x0e') printf 'C-n' ;;
    $'\x0f') printf 'C-o' ;;
    $'\x10') printf 'C-p' ;;
    $'\x11') printf 'C-q' ;;
    $'\x12') printf 'C-r' ;;
    $'\x13') printf 'C-s' ;;
    $'\x14') printf 'C-t' ;;
    $'\x15') printf 'C-u' ;;
    $'\x16') printf 'C-v' ;;
    $'\x17') printf 'C-w' ;;
    $'\x18') printf 'C-x' ;;
    $'\x19') printf 'C-y' ;;
    $'\x1a') printf 'C-z' ;;
    $'\e') printf 'Escape' ;;
    $'\e[A') printf 'Up' ;;
    $'\e[B') printf 'Down' ;;
    $'\e[C') printf 'Right' ;;
    $'\e[D') printf 'Left' ;;
    *) printf '%s' "$key" ;;
  esac
}


dot_choose_from_array() {
  local title="$1" subtitle="$2" result_var="$3"
  shift 3
  local options=("$@")
  local selected=0 key i pointer start end total max_visible=12 more_top more_bottom

  while true; do
    total="@{#options[@]}"
    start=0
    if [[ "$selected" -ge "$max_visible" ]]; then
      start=$((selected - max_visible + 1))
    fi
    end=$((start + max_visible))
    if [[ "$end" -gt "$total" ]]; then end="$total"; fi
    more_top=0
    more_bottom=0
    if [[ "$start" -gt 0 ]]; then more_top=1; fi
    if [[ "$end" -lt "$total" ]]; then more_bottom=1; fi

    dot_render_header "$title" "$subtitle"
    printf '%s\n' "────────────────────────────────────────"
    if [[ "$more_top" == "1" ]]; then
      printf "   %b↑ more%b\n" "$DIM" "$NC"
    fi
    for ((i=start; i<end; i++)); do
      pointer=" "
      if [[ "$i" -eq "$selected" ]]; then pointer="@{CYAN}>@{NC}"; fi
      printf " %b %s\n" "$pointer" "@{options[$i]}"
    done
    if [[ "$more_bottom" == "1" ]]; then
      printf "   %b↓ more%b\n" "$DIM" "$NC"
    fi
    printf '%s\n' "────────────────────────────────────────"
    printf "%b↑/↓%b 选择  %bEnter%b 确认  %bb/←%b 返回  %b%d/%d%b\n" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC" "$DIM" "$((selected + 1))" "$total" "$NC"

    key="$(dot_read_key)" || return 1
    case "$key" in
      $'\\e[A') if [[ "$selected" -gt 0 ]]; then selected=$((selected - 1)); fi ;;
      $'\\e[B') if [[ "$selected" -lt $((total - 1)) ]]; then selected=$((selected + 1)); fi ;;
      "") printf -v "$result_var" '%s' "@{options[$selected]}"; return 0 ;;
      q|Q) return 1 ;;
      *) if dot_is_back_key "$key"; then return 2; fi ;;
    esac
  done
}

dot_modifier_to_tmux_prefix() {
  case "$1" in
    Ctrl) printf 'C' ;;
    Alt/Meta) printf 'M' ;;
    *) return 1 ;;
  esac
}

dot_key_name_to_tmux_suffix() {
  case "$1" in
    Space) printf 'Space' ;;
    Enter) printf 'Enter' ;;
    Escape) printf 'Escape' ;;
    Tab) printf 'Tab' ;;
    Backslash) printf '\\' ;;
    *) printf '%s' "$1" ;;
  esac
}

dot_compose_tmux_key_prompt() {
  local item="$1"
  local var="@{DOT_PROMPT_VARS[$item]:-}"
  local modifier key_name prefix suffix value confirm
  local modifiers=("Ctrl" "Alt/Meta")
  local keys=(
    "a" "b" "c" "d" "e" "f" "g" "h" "i" "j" "k" "l" "m"
    "n" "o" "p" "q" "r" "s" "t" "u" "v" "w" "x" "y" "z"
    "0" "1" "2" "3" "4" "5" "6" "7" "8" "9"
    "Space" "Enter" "Escape" "Tab" "Backslash" "[" "]" "-" "=" "/" "." "," ";" "'"
  )

  while true; do
    dot_choose_from_array "@{DOT_LABELS[$item]} > 选择特殊键" "先选择修饰键" modifier "@{modifiers[@]}"
    case "$?" in
      0) ;;
      2) return 2 ;;
      *) return 1 ;;
    esac

    dot_choose_from_array "@{DOT_LABELS[$item]} > 选择普通按键" "当前特殊键：$modifier" key_name "@{keys[@]}"
    case "$?" in
      0) ;;
      2) continue ;;
      *) return 1 ;;
    esac

    prefix="$(dot_modifier_to_tmux_prefix "$modifier")" || return 1
    suffix="$(dot_key_name_to_tmux_suffix "$key_name")" || return 1
    value="@{prefix}-@{suffix}"

    dot_render_header "@{DOT_LABELS[$item]}" "手动组合按键"
    printf '%s\n' "────────────────────────────────────────"
    printf "组合结果：%b%s%b\n\n" "$GREEN" "$value" "$NC"
    printf "Enter 确认，r 重新组合，b 返回录制："
    confirm="$(dot_read_key)" || return 1
    case "$confirm" in
      "")
        if [[ -n "$var" ]]; then
          DOT_VARS[$var]="$value"
        fi
        return 0
        ;;
      r|R) continue ;;
      *) if dot_is_back_key "$confirm"; then return 2; fi ;;
    esac
  done
}

dot_record_key_prompt() {
  local item="$1"
  local var="@{DOT_PROMPT_VARS[$item]:-}"
  local label="@{DOT_PROMPT_LABELS[$item]:-Press a key}"
  local key value

  while true; do
    dot_render_header "@{DOT_LABELS[$item]}" "$label"
    printf '%s\n' "────────────────────────────────────────"
    printf "请直接按下你想要的组合键。按 b 返回。\n"
    key="$(dot_read_key)" || return 1
    if dot_is_back_key "$key"; then
      return 2
    fi
    value="$(dot_key_to_tmux "$key")"

    dot_render_header "@{DOT_LABELS[$item]}" "$label"
    printf '%s\n' "────────────────────────────────────────"
    printf "录制结果：%b%s%b\n\n" "$GREEN" "$value" "$NC"
    printf "Enter 确认，r 重新录制，b 返回："
    key="$(dot_read_key)" || return 1
    case "$key" in
      "")
        if [[ -n "$var" ]]; then
          DOT_VARS[$var]="$value"
        fi
        return 0
        ;;
      r|R) continue ;;
      *) if dot_is_back_key "$key"; then return 2; fi ;;
    esac
  done
}

dot_visible_children() {
  local parent="$1" child out=()
  for child in @{DOT_CHILDREN[$parent]:-}; do
    if [[ "@{DOT_HIDDEN[$child]:-0}" != "1" ]]; then
      out+=("$child")
    fi
  done
  if [[ "@{#out[@]}" -gt 0 ]]; then
    printf '%s ' "@{out[@]}"
  fi
}

dot_has_children() {
  local id="$1" child
  for child in @{DOT_CHILDREN[$id]:-}; do
    if [[ "@{DOT_HIDDEN[$child]:-0}" != "1" ]]; then
      return 0
    fi
  done
  return 1
}

dot_is_item_selected() {
  local id="$1"
  if [[ "@{DOT_SELECTED[$id]:-0}" == "1" ]]; then
    return 0
  fi

  if [[ -n "@{DOT_LEAVES[$id]:-}" ]]; then
    local leaf any=0
    for leaf in @{DOT_LEAVES[$id]:-}; do
      if [[ "@{DOT_SELECTED[$leaf]:-0}" == "1" ]]; then
        any=1
      else
        return 1
      fi
    done
    [[ "$any" == "1" ]]
    return
  fi

  return 1
}

dot_select_single_item() {
  local current="$1" id="$2" sibling leaf
  for sibling in @{DOT_CHILDREN[$current]:-}; do
    unset "DOT_SELECTED[$sibling]"
    for leaf in @{DOT_LEAVES[$sibling]:-$sibling}; do
      unset "DOT_SELECTED[$leaf]"
    done
  done

  DOT_SELECTED[$id]=1
  for leaf in @{DOT_LEAVES[$id]:-$id}; do
    DOT_SELECTED[$leaf]=1
  done
}

dot_toggle_multi_item() {
  local id="$1"
  local leaves="@{DOT_LEAVES[$id]:-$id}"
  local leaf all_selected=1

  for leaf in $leaves; do
    if [[ "@{DOT_SELECTED[$leaf]:-0}" != "1" ]]; then
      all_selected=0
      break
    fi
  done

  if [[ "$all_selected" == "1" ]]; then
    unset "DOT_SELECTED[$id]"
    for leaf in $leaves; do
      unset "DOT_SELECTED[$leaf]"
    done
  else
    DOT_SELECTED[$id]=1
    for leaf in $leaves; do
      DOT_SELECTED[$leaf]=1
    done
  fi
}

dot_render_header() {
  local title="$1" subtitle="@{2:-}"
  dot_clear_screen
  printf "%b%s%b\\n" "$BOLD" "$title" "$NC"
  if [[ -n "$subtitle" ]]; then
    printf "%b%s%b\\n" "$DIM" "$subtitle" "$NC"
  fi
}

dot_render_flow_progress() {
  local flow="$1" current_step="$2"
  local steps=() step index=1 total=0 line=""
  read -r -a steps <<< "$(dot_visible_children "$flow")"
  total="@{#steps[@]}"

  printf "%b流程进度:%b " "$CYAN" "$NC"
  for step in "@{steps[@]}"; do
    if [[ "$step" == "$current_step" ]]; then
      line+="@{BOLD}@{DOT_LABELS[$step]}@{NC}"
    else
      line+="@{DOT_LABELS[$step]}"
    fi
    if [[ "$index" -lt "$total" ]]; then
      line+=" → "
    fi
    index=$((index + 1))
  done
  printf "%b\\n\\n" "$line"
}

dot_render_single_menu() {
  local current="$1" selected="$2" title="$3" subtitle="@{4:-}"
  local items=() i id pointer desc
  read -r -a items <<< "$(dot_visible_children "$current")"

  dot_render_header "$title" "$subtitle"
  printf '%s\\n' "────────────────────────────────────────"
  for i in "@{!items[@]}"; do
    id="@{items[$i]}"
    pointer=" "
    if [[ "$i" -eq "$selected" ]]; then pointer="@{CYAN}>@{NC}"; fi
    desc=""
    if [[ -n "@{DOT_DESCRIPTIONS[$id]:-}" ]]; then desc=" - @{DOT_DESCRIPTIONS[$id]}"; fi
    printf " %b %s%b%s%b\\n" "$pointer" "@{DOT_LABELS[$id]}" "$DIM" "$desc" "$NC"
  done
  printf '%s\\n' "────────────────────────────────────────"
  printf "%b↑/↓%b 选择  %bEnter%b 确认  %bb/←%b 返回  %bq%b 退出\\n" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC"
}

dot_render_multi_menu() {
  local current="$1" selected="$2" title="$3" subtitle="@{4:-}"
  local items=() i id pointer mark desc
  read -r -a items <<< "$(dot_visible_children "$current")"

  dot_render_header "$title" "$subtitle"
  printf '%s\\n' "────────────────────────────────────────"
  for i in "@{!items[@]}"; do
    id="@{items[$i]}"
    pointer=" "
    if [[ "$i" -eq "$selected" ]]; then pointer="@{CYAN}>@{NC}"; fi
    mark=" "
    if dot_is_item_selected "$id"; then mark="x"; fi
    desc=""
    if [[ -n "@{DOT_DESCRIPTIONS[$id]:-}" ]]; then desc=" - @{DOT_DESCRIPTIONS[$id]}"; fi
    printf " %b [%s] %s%b%s%b\\n" "$pointer" "$mark" "@{DOT_LABELS[$id]}" "$DIM" "$desc" "$NC"
  done
  printf '%s\\n' "────────────────────────────────────────"
  printf "%b↑/↓%b 选择  %bSpace%b 切换  %bEnter%b 下一步  %bb/←%b 返回  %bq%b 退出\\n" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC" "$CYAN" "$NC"
}

dot_choose_single() {
  local current="$1" title="$2" subtitle="@{3:-}"
  local selected=0 key items=() id

  while true; do
    read -r -a items <<< "$(dot_visible_children "$current")"
    if [[ "@{#items[@]}" -eq 0 ]]; then return 1; fi
    if [[ "$selected" -ge "@{#items[@]}" ]]; then selected=0; fi

    dot_render_single_menu "$current" "$selected" "$title" "$subtitle"
    key="$(dot_read_key)" || return 1

    case "$key" in
      $'\\e[A') if [[ "$selected" -gt 0 ]]; then selected=$((selected - 1)); fi ;;
      $'\\e[B') if [[ "$selected" -lt $((@{#items[@]} - 1)) ]]; then selected=$((selected + 1)); fi ;;
      q|Q) return 1 ;;
      "") id="@{items[$selected]}"; DOT_CHOICE="$id"; return 0 ;;
      *) if dot_is_back_key "$key"; then return 2; fi ;;
    esac
  done
}

dot_choose_multi() {
  local current="$1" title="$2" subtitle="@{3:-}"
  local selected=0 key items=() id

  while true; do
    read -r -a items <<< "$(dot_visible_children "$current")"
    if [[ "@{#items[@]}" -eq 0 ]]; then return 0; fi
    if [[ "$selected" -ge "@{#items[@]}" ]]; then selected=0; fi

    dot_render_multi_menu "$current" "$selected" "$title" "$subtitle"
    key="$(dot_read_key)" || return 1

    case "$key" in
      $'\\e[A') if [[ "$selected" -gt 0 ]]; then selected=$((selected - 1)); fi ;;
      $'\\e[B') if [[ "$selected" -lt $((@{#items[@]} - 1)) ]]; then selected=$((selected + 1)); fi ;;
      q|Q) return 1 ;;
      " ") id="@{items[$selected]}"; dot_toggle_multi_item "$id" ;;
      "") return 0 ;;
      *) if dot_is_back_key "$key"; then return 2; fi ;;
    esac
  done
}

dot_run_step() {
  local flow="$1" step="$2" step_index="$3" step_total="$4"
  local mode="@{DOT_MODES[$step]:-multi}"
  local title="dot > @{DOT_LABELS[$flow]}"
  local subtitle=""
  subtitle="步骤 @{step_index}/@{step_total}: @{DOT_LABELS[$step]}"

  dot_render_flow_progress "$flow" "$step"

  if ! dot_has_children "$step"; then
    if [[ -n "@{DOT_SNIPPET_FUNCS[$step]:-}" ]]; then
      DOT_SELECTED[$step]=1
    fi
    return 0
  fi

  case "$mode" in
    single)
      dot_choose_single "$step" "$title" "$subtitle"
      local result=$? choice=""
      if [[ "$result" -eq 0 ]]; then
        choice="$DOT_CHOICE"
        case "@{DOT_PROMPT_TYPES[$choice]:-}" in
          key)
            dot_record_key_prompt "$choice"
            result=$?
            ;;
          key-compose)
            dot_compose_tmux_key_prompt "$choice"
            result=$?
            ;;
        esac
        if [[ "$result" -eq 0 ]]; then
          dot_select_single_item "$step" "$choice"
          if [[ "@{DOT_END_FLOW[$choice]:-0}" == "1" ]]; then
            return 3
          fi
        fi
      fi
      return "$result"
      ;;
    multi)
      dot_choose_multi "$step" "$title" "$subtitle"
      return $?
      ;;
    flow)
      dot_run_flow "$step"
      return $?
      ;;
    *)
      dot_choose_multi "$step" "$title" "$subtitle"
      return $?
      ;;
  esac
}

dot_run_flow() {
  local flow="$1"
  local steps=() step index=0 total result
  read -r -a steps <<< "$(dot_visible_children "$flow")"
  total="@{#steps[@]}"

  while [[ "$index" -lt "$total" ]]; do
    step="@{steps[$index]}"
    dot_run_step "$flow" "$step" "$((index + 1))" "$total"
    result=$?
    case "$result" in
      0) index=$((index + 1)) ;;
      2)
        if [[ "$index" -eq 0 ]]; then
          return 2
        fi
        index=$((index - 1))
        while [[ "$index" -gt 0 ]]; do
          step="@{steps[$index]}"
          if dot_has_children "$step"; then
            break
          fi
          index=$((index - 1))
        done
        step="@{steps[$index]}"
        if [[ "$index" -eq 0 ]] && ! dot_has_children "$step"; then
          return 2
        fi
        ;;
      3) return 3 ;;
      *) return 1 ;;
    esac
  done
  return 0
}

dot_add_with_deps() {
  local id="$1"
  if [[ "@{DOT_PLAN_ADDED[$id]:-0}" == "1" ]]; then
    return 0
  fi

  local dep
  for dep in @{DOT_DEPS[$id]:-}; do
    dot_add_with_deps "$dep"
  done

  DOT_PLAN_ADDED[$id]=1
  if [[ -n "@{DOT_SNIPPET_FUNCS[$id]:-}" ]]; then
    if [[ "@{DOT_POST[$id]:-0}" == "1" ]]; then
      DOT_POST_PLAN+=("$id")
    else
      DOT_PLAN+=("$id")
    fi
  fi
}

dot_build_plan() {
  DOT_PLAN=()
  DOT_POST_PLAN=()
  DOT_PLAN_ADDED=()

  local id leaf
  for id in "@{DOT_ALL_IDS[@]}"; do
    if [[ "@{DOT_SELECTED[$id]:-0}" != "1" ]]; then
      continue
    fi

    if [[ "@{DOT_HIDDEN[$id]:-0}" == "1" ]]; then
      continue
    fi

    if [[ -n "@{DOT_LEAVES[$id]:-}" ]]; then
      for leaf in @{DOT_LEAVES[$id]:-}; do
        dot_add_with_deps "$leaf"
      done
    else
      dot_add_with_deps "$id"
    fi
  done

  DOT_PLAN+=("@{DOT_POST_PLAN[@]}")
}

dot_print_plan() {
  printf "%bResolved execution plan%b\\n" "$BOLD" "$NC"
  printf '%s\\n' "────────────────────────────────────────"

  local id index=1 has_normal=0 has_post=0
  for id in "@{DOT_PLAN[@]}"; do
    if [[ "@{DOT_POST[$id]:-0}" == "1" ]]; then
      has_post=1
    else
      has_normal=1
    fi
  done

  if [[ "$has_normal" == "1" ]]; then
    printf "%bNormal steps%b\\n" "$CYAN" "$NC"
    for id in "@{DOT_PLAN[@]}"; do
      if [[ "@{DOT_POST[$id]:-0}" == "1" ]]; then
        continue
      fi
      printf " %2d. %s %b[%s]%b\\n" "$index" "@{DOT_LABELS[$id]}" "$DIM" "$id" "$NC"
      index=$((index + 1))
    done
  fi

  if [[ "$has_post" == "1" ]]; then
    if [[ "$has_normal" == "1" ]]; then
      printf "\\n"
    fi
    printf "%bPost steps%b\\n" "$CYAN" "$NC"
    for id in "@{DOT_PLAN[@]}"; do
      if [[ "@{DOT_POST[$id]:-0}" != "1" ]]; then
        continue
      fi
      printf " %2d. %s %b[%s]%b\\n" "$index" "@{DOT_LABELS[$id]}" "$DIM" "$id" "$NC"
      index=$((index + 1))
    done
  fi

  if [[ "$has_normal" != "1" && "$has_post" != "1" ]]; then
    printf " %bNo runnable items selected.%b\\n" "$YELLOW" "$NC"
  fi

  printf '%s\\n' "────────────────────────────────────────"
}

dot_show_plan() {
  dot_clear_screen
  printf "%bExecution plan%b\\n" "$BOLD" "$NC"
  printf '%s\\n' "────────────────────────────────────────"

  local id index=1
  for id in "@{DOT_PLAN[@]}"; do
    if [[ "@{DOT_POST[$id]:-0}" == "1" ]]; then
      printf " %2d. %s %b(auto)%b\\n" "$index" "@{DOT_LABELS[$id]}" "$DIM" "$NC"
    else
      printf " %2d. %s\\n" "$index" "@{DOT_LABELS[$id]}"
    fi
    index=$((index + 1))
  done

  printf '%s\\n' "────────────────────────────────────────"
}

dot_known_id() {
  local id="$1" known
  for known in "@{DOT_ALL_IDS[@]}"; do
    if [[ "$known" == "$id" ]]; then
      return 0
    fi
  done
  return 1
}

dot_select_dry_run_item() {
  local id="$1" leaf
  if ! dot_known_id "$id"; then
    log_error "Unknown menu item id: $id"
    return 1
  fi

  DOT_SELECTED[$id]=1
  for leaf in @{DOT_LEAVES[$id]:-$id}; do
    DOT_SELECTED[$leaf]=1
  done
}

dot_print_dry_run_usage() {
  printf 'Usage: bash dot.sh --dry-run-plan --select <ids...>\\n'
}

dot_dry_run_plan() {
  local selected_count=0

  if [[ "$#" -eq 0 && -n "@{DOT_PRESET:-}" ]]; then
    set -- --select $DOT_PRESET
  fi

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --select)
        shift
        if [[ "$#" -eq 0 || "@{1:-}" == --* ]]; then
          log_error "--select requires at least one id"
          dot_print_dry_run_usage
          return 1
        fi
        while [[ "$#" -gt 0 ]]; do
          case "$1" in
            --*) break ;;
          esac
          dot_select_dry_run_item "$1" || return 1
          selected_count=$((selected_count + 1))
          shift
        done
        ;;
      -h|--help)
        dot_print_dry_run_usage
        return 0
        ;;
      *)
        log_error "Unsupported dry-run argument: $1"
        dot_print_dry_run_usage
        return 1
        ;;
    esac
  done

  if [[ "$selected_count" -eq 0 ]]; then
    log_error "--dry-run-plan requires --select <ids...>"
    dot_print_dry_run_usage
    return 1
  fi

  dot_build_plan
  dot_print_plan
  [[ "@{#DOT_PLAN[@]}" -gt 0 ]]
}

dot_confirm_plan() {
  if [[ "@{#DOT_PLAN[@]}" -eq 0 ]]; then
    log_warn "No runnable items selected."
    dot_pause
    return 1
  fi

  dot_show_plan
  local answer
  printf "Execute this plan? [y/N] "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

dot_execute_plan() {
  dot_clear_screen
  printf "%bExecuting plan%b\\n" "$BOLD" "$NC"
  printf '%s\\n' "────────────────────────────────────────"

  local id func dep failed_dep status
  for id in "@{DOT_PLAN[@]}"; do
    failed_dep=0
    for dep in @{DOT_DEPS[$id]:-}; do
      if [[ "@{DOT_RESULTS[$dep]:-ok}" == "failed" || "@{DOT_RESULTS[$dep]:-ok}" == "skipped" ]]; then
        failed_dep=1
        break
      fi
    done

    if [[ "$failed_dep" == "1" ]]; then
      DOT_RESULTS[$id]="skipped"
      log_warn "Skipped @{DOT_LABELS[$id]} because a dependency failed"
      continue
    fi

    func="@{DOT_SNIPPET_FUNCS[$id]:-}"
    if [[ -z "$func" ]]; then
      continue
    fi

    log_info "Running @{DOT_LABELS[$id]}"
    "$func"
    status=$?
    if [[ "$status" -eq 0 ]]; then
      DOT_RESULTS[$id]="ok"
      log_ok "@{DOT_LABELS[$id]}"
    else
      DOT_RESULTS[$id]="failed"
      log_error "@{DOT_LABELS[$id]} failed with exit code $status"
    fi
  done
}

dot_print_summary() {
  printf '\\n%bSummary%b\\n' "$BOLD" "$NC"
  printf '%s\\n' "────────────────────────────────────────"

  local id status
  for id in "@{DOT_PLAN[@]}"; do
    status="@{DOT_RESULTS[$id]:-not-run}"
    case "$status" in
      ok) printf " %b✓%b %s\\n" "$GREEN" "$NC" "@{DOT_LABELS[$id]}" ;;
      skipped) printf " %b-%b %s (skipped)\\n" "$YELLOW" "$NC" "@{DOT_LABELS[$id]}" ;;
      *) printf " %b✗%b %s (%s)\\n" "$RED" "$NC" "@{DOT_LABELS[$id]}" "$status" ;;
    esac
  done
}

dot_main() {
  if [[ "@{1:-}" == "--dry-run-plan" ]]; then
    shift
    dot_dry_run_plan "$@"
    exit $?
  fi

  while true; do
    dot_choose_single "__root" "$DOT_TITLE" "@{DOT_DESCRIPTIONS[__root]:-}"
    local result=$?
    case "$result" in
      0) ;;
      *) printf '\\nAborted.\\n'; exit 0 ;;
    esac

    local task="$DOT_CHOICE"
    if [[ "@{DOT_MODES[$task]:-multi}" == "flow" ]]; then
      dot_run_flow "$task"
      result=$?
      if [[ "$result" -eq 2 ]]; then
        continue
      elif [[ "$result" -ne 0 && "$result" -ne 3 ]]; then
        printf '\\nAborted.\\n'
        exit 0
      fi
    else
      dot_select_single_item "__root" "$task"
    fi

    dot_build_plan
    if dot_confirm_plan; then
      break
    fi
  done

  dot_execute_plan
  dot_print_summary
}
`.replace(/@\{/g, "${");
}
