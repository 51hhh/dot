# zsh-autosuggestions 插件安装
log_info "安装 zsh-autosuggestions 插件..."

PLUGIN_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions"
PLUGIN_REPO="https://github.com/zsh-users/zsh-autosuggestions.git"

if [[ -d "$PLUGIN_DIR/.git" ]]; then
  log_info "zsh-autosuggestions 已存在，尝试更新..."
  if git -C "$PLUGIN_DIR" pull --ff-only; then
    log_ok "zsh-autosuggestions 已更新"
    return 0
  fi
  log_warn "zsh-autosuggestions 更新失败，将继续使用现有目录。"
  return 0
fi

if [[ -e "$PLUGIN_DIR" ]]; then
  log_warn "$PLUGIN_DIR 已存在但不是 git 仓库，跳过克隆。"
  return 0
fi

if ! dot_git_clone_with_fallback "$PLUGIN_REPO" "$PLUGIN_DIR"; then
  log_error "zsh-autosuggestions 克隆失败。"
  return 1
fi

log_ok "zsh-autosuggestions 已安装到 $PLUGIN_DIR"
