# Tmux 包管理器安装
log_info "通过 apt 安装 Tmux 与常用依赖..."

if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请选择源码编译安装，或手动使用当前发行版包管理器安装 tmux。"
  return 1
fi

TMUX_APT_PACKAGES=(tmux git unzip wget curl fontconfig xclip wl-clipboard)

if ! dot_sudo apt-get update -qq; then
  log_error "apt-get update 失败；请检查网络、软件源或 sudo/root 权限。"
  return 1
fi

if ! dot_sudo apt-get install -y "${TMUX_APT_PACKAGES[@]}"; then
  log_error "apt-get install 失败；Tmux 安装未完成。"
  return 1
fi

if ! dot_sudo apt-get install -y acpi; then
  log_warn "可选包 acpi 安装失败，已跳过；电池状态插件可能缺少电池信息。"
fi

hash -r
if ! command -v tmux >/dev/null 2>&1; then
  log_error "apt 安装结束后仍找不到 tmux 命令。"
  return 1
fi

TMUX_VERSION_OUTPUT="$(tmux -V 2>/dev/null || true)"
if [[ -z "$TMUX_VERSION_OUTPUT" ]]; then
  log_error "tmux 已存在但无法执行 tmux -V。"
  return 1
fi

log_ok "Tmux 安装完成 (${TMUX_VERSION_OUTPUT})"
