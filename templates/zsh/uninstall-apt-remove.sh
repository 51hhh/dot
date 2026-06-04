# 移除 zsh 软件包
log_info "准备移除 zsh 软件包..."

if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请使用当前发行版包管理器手动移除 zsh。"
  return 1
fi

if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  CURRENT_USER="$SUDO_USER"
else
  CURRENT_USER="${USER:-$(id -un)}"
fi

ZSH_PATH="$(command -v zsh 2>/dev/null || true)"
LOGIN_SHELL="${SHELL:-}"
if command -v getent >/dev/null 2>&1; then
  LOGIN_SHELL="$(getent passwd "$CURRENT_USER" 2>/dev/null | awk -F: '{print $7}')"
fi

if [[ -n "$ZSH_PATH" && "$LOGIN_SHELL" == "$ZSH_PATH" ]]; then
  log_error "$CURRENT_USER 的默认 shell 仍是 zsh，请先选择“恢复默认 shell 为 bash”。"
  return 1
fi

if [[ "$LOGIN_SHELL" == */zsh ]]; then
  log_error "$CURRENT_USER 的默认 shell 看起来仍是 zsh: $LOGIN_SHELL"
  log_error "请先恢复默认 shell 为 bash，再移除 zsh 软件包。"
  return 1
fi

log_warn "即将执行 apt-get remove -y zsh；这不会删除 ~/.zshrc 或 Oh My Zsh 目录。"
if [[ "${DOT_CONFIRM_ZSH_APT_REMOVE:-}" != "1" ]]; then
  printf '确认移除 zsh 软件包？请输入 REMOVE_ZSH 继续: '
  if declare -F dot_read_line >/dev/null 2>&1; then
    if ! dot_read_line confirm_remove_zsh; then
      log_error "读取确认输入失败；如需非交互执行，请设置 DOT_CONFIRM_ZSH_APT_REMOVE=1。"
      return 1
    fi
  elif [[ -r /dev/tty ]]; then
    if ! IFS= read -r confirm_remove_zsh < /dev/tty; then
      log_error "读取确认输入失败；如需非交互执行，请设置 DOT_CONFIRM_ZSH_APT_REMOVE=1。"
      return 1
    fi
  elif [[ -t 0 ]]; then
    if ! IFS= read -r confirm_remove_zsh; then
      log_error "读取确认输入失败；如需非交互执行，请设置 DOT_CONFIRM_ZSH_APT_REMOVE=1。"
      return 1
    fi
  else
    log_error "非交互执行移除 zsh 需要设置 DOT_CONFIRM_ZSH_APT_REMOVE=1。"
    return 1
  fi
  if [[ "$confirm_remove_zsh" != "REMOVE_ZSH" ]]; then
    log_warn "未确认移除 zsh，已跳过 apt remove。"
    return 0
  fi
fi

if ! dot_sudo apt-get remove -y zsh; then
  log_error "apt-get remove zsh 失败。"
  return 1
fi

hash -r
log_ok "zsh 软件包移除流程完成。"
