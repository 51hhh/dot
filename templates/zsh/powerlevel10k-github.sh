# Powerlevel10k GitHub 源安装
log_info "安装 Powerlevel10k 主题（GitHub 源）..."

P10K_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
P10K_REPO="https://github.com/romkatv/powerlevel10k.git"

if [[ -d "$P10K_DIR/.git" ]]; then
  log_info "Powerlevel10k 已存在，尝试更新..."
  if git -C "$P10K_DIR" pull --ff-only; then
    log_ok "Powerlevel10k 已更新"
    return 0
  fi
  log_warn "Powerlevel10k 更新失败，将继续使用现有目录。"
  return 0
fi

if [[ -e "$P10K_DIR" ]]; then
  log_warn "$P10K_DIR 已存在但不是 git 仓库，跳过克隆。"
  return 0
fi

if ! dot_git_clone_with_fallback "$P10K_REPO" "$P10K_DIR" --depth 1; then
  log_error "Powerlevel10k 克隆失败。"
  return 1
fi

log_ok "Powerlevel10k 已安装到 $P10K_DIR"
