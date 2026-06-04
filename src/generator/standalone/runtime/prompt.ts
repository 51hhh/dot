export function generateRuntimePrompt(): string {
  return `dot_key_to_tmux() {
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

dot_text_input_prompt() {
  local item="$1"
  local var="@{DOT_PROMPT_VARS[$item]:-}"
  local label="@{DOT_PROMPT_LABELS[$item]:-Input}"
  local value

  dot_render_header "@{DOT_LABELS[$item]}" "$label"
  printf '%s\n' "────────────────────────────────────────"
  printf "请输入内容（直接回车使用默认值，输入 b 返回）：\n"
  printf "> "
  dot_read_line value || return 1
  if [[ "$value" == "b" || "$value" == "B" ]]; then
    return 2
  fi
  if [[ -n "$var" ]]; then
    DOT_VARS[$var]="$value"
  fi
  return 0
}

dot_number_input_prompt() {
  local item="$1"
  local var="@{DOT_PROMPT_VARS[$item]:-}"
  local label="@{DOT_PROMPT_LABELS[$item]:-Input number}"
  local value

  while true; do
    dot_render_header "@{DOT_LABELS[$item]}" "$label"
    printf '%s\n' "────────────────────────────────────────"
    printf "请输入数字（直接回车使用默认值，输入 b 返回）：\n"
    printf "> "
    dot_read_line value || return 1
    if [[ "$value" == "b" || "$value" == "B" ]]; then
      return 2
    fi
    if [[ -z "$value" ]]; then
      return 0
    fi
    if [[ "$value" =~ ^[0-9]+$ ]]; then
      if [[ -n "$var" ]]; then
        DOT_VARS[$var]="$value"
      fi
      return 0
    fi
    printf "%b无效输入，请输入纯数字。%b\n" "$RED" "$NC"
    sleep 1
  done
}`;
}
