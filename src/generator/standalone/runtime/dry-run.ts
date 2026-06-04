export function generateRuntimeDryRun(): string {
  return `dot_dry_run_plan() {
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
  dot_read_line answer || return 1
  [[ "$answer" =~ ^[Yy]$ ]]
}`;
}
