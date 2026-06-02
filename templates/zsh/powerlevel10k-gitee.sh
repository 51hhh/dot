# Powerlevel10k Gitee 源安装
log_info "安装 Powerlevel10k 主题（Gitee 源）..."

P10K_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
P10K_REPO="https://gitee.com/romkatv/powerlevel10k.git"

if ! command -v git >/dev/null 2>&1; then
  log_error "未找到 git；无法克隆 Powerlevel10k。"
  return 1
fi

mkdir -p "$(dirname "$P10K_DIR")"
if [[ -d "$P10K_DIR/.git" ]]; then
  log_info "Powerlevel10k 已存在，尝试从当前 remote 更新..."
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

if ! git clone --depth 1 "$P10K_REPO" "$P10K_DIR"; then
  log_error "Powerlevel10k Gitee 源克隆失败。"
  return 1
fi

log_ok "Powerlevel10k 已安装到 $P10K_DIR"
