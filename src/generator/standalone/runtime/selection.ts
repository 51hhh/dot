export function generateRuntimeSelection(): string {
  return `dot_visible_children() {
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
}`;
}
