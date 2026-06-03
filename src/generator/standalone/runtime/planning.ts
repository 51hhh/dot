export function generateRuntimePlanning(): string {
  return `dot_build_plan() {
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

dot_has_ambiguous_single_choice() {
  local id="$1" child visible_children=0

  if [[ "@{DOT_EXPLICIT_MODES[$id]:-}" == "single" ]]; then
    for child in @{DOT_CHILDREN[$id]:-}; do
      if [[ "@{DOT_HIDDEN[$child]:-0}" != "1" ]]; then
        visible_children=$((visible_children + 1))
      fi
    done
    if [[ "$visible_children" -gt 1 ]]; then
      DOT_AMBIGUOUS_SINGLE_ID="$id"
      return 0
    fi
  fi

  for child in @{DOT_CHILDREN[$id]:-}; do
    if dot_has_ambiguous_single_choice "$child"; then
      return 0
    fi
  done

  return 1
}

dot_select_plan_item() {
  local id="$1" leaf
  if ! dot_known_id "$id"; then
    log_error "Unknown menu item id: $id"
    return 1
  fi

  DOT_AMBIGUOUS_SINGLE_ID=""
  if dot_has_ambiguous_single_choice "$id"; then
    log_error "Menu item $id contains single-choice group $DOT_AMBIGUOUS_SINGLE_ID; select one concrete option id instead."
    return 1
  fi

  DOT_SELECTED[$id]=1
  for leaf in @{DOT_LEAVES[$id]:-$id}; do
    DOT_SELECTED[$leaf]=1
  done
}

dot_select_dry_run_item() {
  dot_select_plan_item "$1"
}

dot_print_dry_run_usage() {
  printf 'Usage: bash dot.sh --dry-run-plan --select <ids...>\\n'
}

dot_print_run_plan_usage() {
  printf 'Usage: bash dot.sh --run-plan --select <ids...>\\n'
}`;
}
