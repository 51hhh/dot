# 跳过 Zsh 安装并检查必要命令
log_info "跳过 apt 安装，检查 Zsh 配置所需命令..."

missing=()
for command_name in zsh git curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing+=("$command_name")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  log_error "缺少必要命令: ${missing[*]}"
  log_error "请先安装这些命令，或返回选择 apt 安装。"
  return 1
fi

log_ok "Zsh、git、curl 已可用，继续后续配置。"
