export function generateRuntimeExecution(): string {
  return `dot_execute_plan() {
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

dot_run_selected_plan() {
  local selected_count=0

  if [[ "$#" -eq 0 && -n "@{DOT_RUN_PRESET:-}" ]]; then
    set -- --select $DOT_RUN_PRESET
  fi

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --select)
        shift
        if [[ "$#" -eq 0 || "@{1:-}" == --* ]]; then
          log_error "--select requires at least one id"
          dot_print_run_plan_usage
          return 1
        fi
        while [[ "$#" -gt 0 ]]; do
          case "$1" in
            --*) break ;;
          esac
          dot_select_plan_item "$1" || return 1
          selected_count=$((selected_count + 1))
          shift
        done
        ;;
      -h|--help)
        dot_print_run_plan_usage
        return 0
        ;;
      *)
        log_error "Unsupported run-plan argument: $1"
        dot_print_run_plan_usage
        return 1
        ;;
    esac
  done

  if [[ "$selected_count" -eq 0 ]]; then
    log_error "--run-plan requires --select <ids...>"
    dot_print_run_plan_usage
    return 1
  fi

  dot_build_plan
  if [[ "@{#DOT_PLAN[@]}" -eq 0 ]]; then
    log_warn "No runnable items selected."
    return 1
  fi

  dot_execute_plan
  dot_print_summary

  local id status
  for id in "@{DOT_PLAN[@]}"; do
    status="@{DOT_RESULTS[$id]:-not-run}"
    case "$status" in
      ok) ;;
      *) return 1 ;;
    esac
  done
}

dot_main() {
  if [[ "@{1:-}" == "--dry-run-plan" ]]; then
    shift
    dot_dry_run_plan "$@"
    exit $?
  fi

  if [[ "@{1:-}" == "--run-plan" ]]; then
    shift
    dot_run_selected_plan "$@"
    exit $?
  fi

  if [[ "$#" -eq 0 && -n "@{DOT_RUN_PRESET:-}" ]]; then
    dot_run_selected_plan
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
}`;
}
