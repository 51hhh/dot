# Oh My Zsh 安装
log_info "安装 Oh My Zsh（非交互模式）..."

if ! command -v zsh >/dev/null 2>&1; then
  log_error "未找到 zsh；请先安装 zsh。"
  return 1
fi

if ! command -v curl >/dev/null 2>&1; then
  log_error "未找到 curl；无法下载 Oh My Zsh installer。"
  return 1
fi

OH_MY_ZSH_DIR="${ZSH:-$HOME/.oh-my-zsh}"
if [[ -f "$OH_MY_ZSH_DIR/oh-my-zsh.sh" ]]; then
  log_ok "Oh My Zsh 已安装: $OH_MY_ZSH_DIR"
  return 0
fi

if [[ -e "$OH_MY_ZSH_DIR" && ! -f "$OH_MY_ZSH_DIR/oh-my-zsh.sh" ]]; then
  log_error "$OH_MY_ZSH_DIR 已存在但不是完整 Oh My Zsh 安装。"
  log_error "请手动检查该目录后重试。"
  return 1
fi

installer="$(mktemp 2>/dev/null || mktemp -t dot-oh-my-zsh-install)"
if ! curl -fsSL https://install.ohmyz.sh/ -o "$installer"; then
  rm -f "$installer"
  log_error "下载 Oh My Zsh installer 失败。"
  return 1
fi

if ! RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh "$installer" --unattended --keep-zshrc; then
  rm -f "$installer"
  log_error "Oh My Zsh installer 执行失败。"
  return 1
fi
rm -f "$installer"

if [[ ! -f "$OH_MY_ZSH_DIR/oh-my-zsh.sh" ]]; then
  log_error "Oh My Zsh 安装结束后未找到 $OH_MY_ZSH_DIR/oh-my-zsh.sh。"
  return 1
fi

log_ok "Oh My Zsh 安装完成"
