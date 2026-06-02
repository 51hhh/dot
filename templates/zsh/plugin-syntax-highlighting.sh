# zsh-syntax-highlighting 插件安装
log_info "安装 zsh-syntax-highlighting 插件..."

PLUGIN_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting"
PLUGIN_REPO="https://github.com/zsh-users/zsh-syntax-highlighting.git"

if [[ -d "$PLUGIN_DIR/.git" ]]; then
  log_info "zsh-syntax-highlighting 已存在，尝试更新..."
  if git -C "$PLUGIN_DIR" pull --ff-only; then
    log_ok "zsh-syntax-highlighting 已更新"
    return 0
  fi
  log_warn "zsh-syntax-highlighting 更新失败，将继续使用现有目录。"
  return 0
fi

if [[ -e "$PLUGIN_DIR" ]]; then
  log_warn "$PLUGIN_DIR 已存在但不是 git 仓库，跳过克隆。"
  return 0
fi

if ! dot_git_clone_with_fallback "$PLUGIN_REPO" "$PLUGIN_DIR"; then
  log_error "zsh-syntax-highlighting 克隆失败。"
  return 1
fi

log_ok "zsh-syntax-highlighting 已安装到 $PLUGIN_DIR"
