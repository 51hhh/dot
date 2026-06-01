# TPM 初始化（必须放在 tmux.conf 最后）
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Initialize TPM (keep at the bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
TMUX_CONF

# 安装所有插件
log_info "安装 Tmux 插件..."
TPM_DIR="$HOME/.tmux/plugins/tpm"
TPM_INSTALLER="$TPM_DIR/bin/install_plugins"
TPM_PATH="$HOME/.tmux/plugins"
TPM_CONF="$HOME/.tmux.conf"
export TMUX_PLUGIN_MANAGER_PATH="$TPM_PATH"

if [[ ! -d "$TPM_DIR" ]]; then
  log_error "TPM 目录不存在: $TPM_DIR"
  return 1
fi

if [[ ! -x "$TPM_INSTALLER" ]]; then
  log_warn "TPM install_plugins 不可执行，尝试修复权限..."
  chmod +x "$TPM_INSTALLER" 2>/dev/null || true
fi

if [[ ! -x "$TPM_INSTALLER" ]]; then
  log_error "TPM install_plugins 不存在或不可执行: $TPM_INSTALLER"
  return 1
fi

if ! grep -q "tmux-plugins/tpm" "$TPM_CONF" 2>/dev/null; then
  log_error "tmux.conf 中缺少 tmux-plugins/tpm 声明，无法安装插件。"
  return 1
fi

if ! grep -q "TMUX_PLUGIN_MANAGER_PATH" "$TPM_CONF" 2>/dev/null; then
  cat >> "$TPM_CONF" << TMUX_CONF
set-environment -g TMUX_PLUGIN_MANAGER_PATH "$TPM_PATH"
TMUX_CONF
fi

TPM_LOG="$(mktemp)"
TPM_STATUS=0
if [[ -n "${TMUX:-}" ]]; then
  "$TPM_INSTALLER" >"$TPM_LOG" 2>&1 || TPM_STATUS=$?
elif command -v tmux >/dev/null 2>&1; then
  TPM_SOCKET="dot-tpm-install-$$"
  tmux -L "$TPM_SOCKET" -f "$TPM_CONF" new-session -d -s dot-tpm-install >/dev/null 2>&1 || true
  TMUX_PLUGIN_MANAGER_PATH="$TPM_PATH" tmux -L "$TPM_SOCKET" set-environment -g TMUX_PLUGIN_MANAGER_PATH "$TPM_PATH" >/dev/null 2>&1 || true
  TMUX_PLUGIN_MANAGER_PATH="$TPM_PATH" tmux -L "$TPM_SOCKET" run-shell "$TPM_INSTALLER" >"$TPM_LOG" 2>&1 || TPM_STATUS=$?
  tmux -L "$TPM_SOCKET" kill-server >/dev/null 2>&1 || true
else
  "$TPM_INSTALLER" >"$TPM_LOG" 2>&1 || TPM_STATUS=$?
fi

if [[ "$TPM_STATUS" -ne 0 ]]; then
  if grep -qi "TMUX_PLUGIN_MANAGER_PATH\|not configured in tmux.conf" "$TPM_LOG"; then
    log_warn "TPM 自动预装插件失败：TPM 没有识别到插件路径。"
    log_warn "请启动 tmux 后按 prefix + I 手动安装插件；当前 tmux.conf 已写入插件声明。"
  else
    log_error "TPM 插件安装命令失败，退出码 $TPM_STATUS。日志: $TPM_LOG"
    tail -n 40 "$TPM_LOG" >&2 || true
    return "$TPM_STATUS"
  fi
elif grep -qiE 'fatal|(^|[^a-z])error([^a-z]|$)|failed|permission denied' "$TPM_LOG"; then
  log_error "TPM 插件安装输出包含错误。日志: $TPM_LOG"
  grep -iE 'fatal|(^|[^a-z])error([^a-z]|$)|failed|permission denied' "$TPM_LOG" >&2 || true
  return 1
else
  rm -f "$TPM_LOG"
  log_ok "插件安装完成"
fi
