# TPM 初始化（必须放在 tmux.conf 最后）
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Initialize TPM (keep at the bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
TMUX_CONF

# 安装所有插件（直接调用 TPM 脚本，简单可靠）
log_info "安装 Tmux 插件..."
TPM_DIR="$HOME/.tmux/plugins/tpm"
TPM_INSTALLER="$TPM_DIR/bin/install_plugins"

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

# 直接执行 TPM 安装脚本（和可用脚本一样）
TPM_LOG="/tmp/tpm-install.log"
if "$TPM_INSTALLER" 2>&1 | tee "$TPM_LOG" | tail -10; then
  if grep -qiE "fatal|error|failed" "$TPM_LOG"; then
    log_warn "部分插件可能克隆失败（多见于 GitHub 限速）"
    log_warn "完整日志：$TPM_LOG"
    log_warn "可在 tmux 内按 prefix + I 重试"
  else
    log_ok "插件已就绪"
  fi
else
  log_warn "TPM 预装脚本退出异常，请在 tmux 内按 prefix + I 手动重试"
fi
