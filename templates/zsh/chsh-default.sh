# 修改默认 shell 为 zsh
log_info "修改默认 shell 为 zsh..."

if ! command -v zsh >/dev/null 2>&1; then
  log_error "未找到 zsh；请先安装 zsh。"
  return 1
fi

if ! command -v chsh >/dev/null 2>&1; then
  log_error "未找到 chsh；请手动修改默认 shell。"
  return 1
fi

ZSH_PATH="$(command -v zsh)"
CURRENT_USER="${USER:-$(id -un)}"

if [[ "${SHELL:-}" == "$ZSH_PATH" ]]; then
  log_ok "当前默认 shell 已是 $ZSH_PATH"
  return 0
fi

if [[ -f /etc/shells ]] && ! grep -qx "$ZSH_PATH" /etc/shells; then
  log_warn "$ZSH_PATH 不在 /etc/shells 中，尝试追加。"
  if ! printf '%s\n' "$ZSH_PATH" | dot_sudo tee -a /etc/shells >/dev/null; then
    log_error "无法写入 /etc/shells。"
    return 1
  fi
fi

if ! chsh -s "$ZSH_PATH" "$CURRENT_USER"; then
  log_error "chsh 执行失败；请稍后手动运行: chsh -s \"$ZSH_PATH\""
  return 1
fi

log_ok "默认 shell 已修改为 $ZSH_PATH；请重新登录或重新打开终端后生效。"
