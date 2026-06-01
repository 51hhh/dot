# 安装 TPM (Tmux Plugin Manager)
log_info "安装 TPM 插件管理器..."

TPM_DIR="$HOME/.tmux/plugins/tpm"
TPM_REPO="https://github.com/tmux-plugins/tpm"

mkdir -p "$(dirname "$TPM_DIR")"
if [[ -d "$TPM_DIR/.git" ]]; then
  log_info "TPM 已存在，更新中..."
  if ! dot_git_pull_with_fallback "$TPM_DIR" "$TPM_REPO"; then
    log_warn "TPM 更新失败；将继续使用本地已有 TPM。"
  fi
elif [[ -e "$TPM_DIR" ]]; then
  log_error "TPM 路径已存在但不是 git 仓库: $TPM_DIR"
  log_error "请备份/删除该目录后重试。"
  return 1
else
  if ! dot_git_clone_with_fallback "$TPM_REPO" "$TPM_DIR" --depth 1; then
    log_error "TPM 克隆失败。"
    return 1
  fi
fi

if [[ ! -d "$TPM_DIR" ]]; then
  log_error "TPM 目录不存在: $TPM_DIR"
  return 1
fi

if [[ ! -x "$TPM_DIR/bin/install_plugins" ]]; then
  log_warn "TPM install_plugins 不可执行，尝试修复权限..."
  if ! chmod +x "$TPM_DIR/bin/install_plugins" 2>/dev/null; then
    log_warn "无法修改 install_plugins 权限，将继续进行严格校验。"
  fi
fi

if [[ ! -x "$TPM_DIR/bin/install_plugins" ]]; then
  log_error "TPM install_plugins 缺失或不可执行: $TPM_DIR/bin/install_plugins"
  return 1
fi

# 添加 TPM 声明到 tmux.conf
cat >> "$HOME/.tmux.conf" << TMUX_CONF

# TPM - Tmux Plugin Manager
set -g @plugin 'tmux-plugins/tpm'
set-environment -g TMUX_PLUGIN_MANAGER_PATH "$HOME/.tmux/plugins"
TMUX_CONF

log_ok "TPM 安装完成"
