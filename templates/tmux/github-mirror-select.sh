# GitHub 加速源选择
if [[ "${DOT_GITHUB_MIRROR_TESTED:-0}" == "1" ]]; then
  log_info "GitHub 加速源已选择，跳过重复测速。"
  return 0
fi

log_info "测速 GitHub 加速源，用于 TPM、源码和字体下载..."

declare -a mirror_labels=()
declare -a mirror_prefixes=()
declare -a mirror_latency=()
declare -a mirror_speed=()
declare -a mirror_options=()

GITHUB_PROBE_URL="https://github.com/tmux-plugins/tpm/archive/refs/heads/master.zip"
for prefix in "${DOT_GITHUB_MIRRORS[@]}"; do
  if [[ -z "$prefix" ]]; then
    label="GitHub 直连"
    candidate="$GITHUB_PROBE_URL"
  else
    label="$prefix"
    candidate="$(dot_github_url "$prefix" "$GITHUB_PROBE_URL")"
  fi

  probe_file="$(mktemp 2>/dev/null || mktemp -t dot-github-probe)"
  start_ms="$(date +%s%3N 2>/dev/null || printf '0')"
  bytes="0"
  ok=0
  if command -v curl >/dev/null 2>&1; then
    bytes="$(curl -fL --connect-timeout 5 --max-time 12 -r 0-262143 -o "$probe_file" -w '%{size_download}' -s "$candidate" 2>/dev/null || printf '0')"
    [[ "$bytes" =~ ^[0-9]+$ && "$bytes" -gt 0 ]] && ok=1
  elif command -v wget >/dev/null 2>&1; then
    if wget --tries=1 --timeout=12 -q --header='Range: bytes=0-262143' -O "$probe_file" "$candidate"; then
      bytes="$(wc -c < "$probe_file" | tr -d ' ')"
      [[ "$bytes" =~ ^[0-9]+$ && "$bytes" -gt 0 ]] && ok=1
    fi
  fi
  end_ms="$(date +%s%3N 2>/dev/null || printf '0')"
  rm -f "$probe_file"

  if [[ "$ok" == "1" && "$start_ms" != "0" && "$end_ms" != "0" ]]; then
    latency=$((end_ms - start_ms))
    if [[ "$latency" -lt 1 ]]; then latency=1; fi
    speed_kib=$((bytes * 1000 / latency / 1024))
  else
    latency=999999
    speed_kib=0
  fi

  mirror_labels+=("$label")
  mirror_prefixes+=("$prefix")
  mirror_latency+=("$latency")
  mirror_speed+=("$speed_kib")
  if [[ "$speed_kib" -gt 0 ]]; then
    mirror_options+=("$label - 延迟 ${latency}ms，速度 ${speed_kib} KiB/s")
  else
    mirror_options+=("$label - 不可用或超时")
  fi
done

best_index=0
for i in "${!mirror_prefixes[@]}"; do
  if [[ "${mirror_speed[$i]}" -gt "${mirror_speed[$best_index]}" ]]; then
    best_index="$i"
  elif [[ "${mirror_speed[$i]}" -eq "${mirror_speed[$best_index]}" && "${mirror_latency[$i]}" -lt "${mirror_latency[$best_index]}" ]]; then
    best_index="$i"
  fi
done

choice_options=("自动选择最快：${mirror_labels[$best_index]} - 延迟 ${mirror_latency[$best_index]}ms，速度 ${mirror_speed[$best_index]} KiB/s")
choice_options+=("${mirror_options[@]}")

dot_choose_from_array "GitHub 加速源" "后续 TPM、源码和字体下载将优先使用该源" selected_github_mirror "${choice_options[@]}"
case "$?" in
  0) ;;
  2)
    DOT_GITHUB_SELECTED_PREFIX=""
    DOT_GITHUB_MIRROR_TESTED=1
    log_warn "未选择 GitHub 加速源，后续将按默认顺序 fallback。"
    return 0
    ;;
  *) return 1 ;;
esac

selected_index="$best_index"
if [[ "$selected_github_mirror" != 自动选择最快：* ]]; then
  for i in "${!mirror_options[@]}"; do
    if [[ "${mirror_options[$i]}" == "$selected_github_mirror" ]]; then
      selected_index="$i"
      break
    fi
  done
fi

DOT_GITHUB_SELECTED_PREFIX="${mirror_prefixes[$selected_index]}"
DOT_GITHUB_ORDERED_PREFIXES=()
DOT_GITHUB_MIRROR_TESTED=1
for i in "${!mirror_prefixes[@]}"; do
  DOT_GITHUB_ORDERED_PREFIXES+=("${mirror_prefixes[$i]}")
done

log_ok "GitHub 加速源已设置为：${mirror_labels[$selected_index]}"
