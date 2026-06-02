# Zsh 包管理器安装
log_info "通过 apt 安装 Zsh 与常用依赖..."

if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请手动使用当前发行版包管理器安装 zsh、git、curl。"
  return 1
fi

ZSH_APT_PACKAGES=(zsh git curl ca-certificates)

if ! dot_sudo apt-get update -qq; then
  log_error "apt-get update 失败；请检查网络、软件源或 sudo/root 权限。"
  return 1
fi

if ! dot_sudo apt-get install -y "${ZSH_APT_PACKAGES[@]}"; then
  log_error "apt-get install 失败；Zsh 基础依赖安装未完成。"
  return 1
fi

hash -r
if ! command -v zsh >/dev/null 2>&1; then
  log_error "apt 安装结束后仍找不到 zsh 命令。"
  return 1
fi

ZSH_VERSION_OUTPUT="$(zsh --version 2>/dev/null || true)"
if [[ -z "$ZSH_VERSION_OUTPUT" ]]; then
  log_error "zsh 已存在但无法执行 zsh --version。"
  return 1
fi

log_ok "Zsh 安装完成 (${ZSH_VERSION_OUTPUT})"
