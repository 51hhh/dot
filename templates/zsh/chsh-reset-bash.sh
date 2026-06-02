# 恢复默认 shell 为 bash
log_info "恢复默认 shell 为 bash..."

if ! command -v bash >/dev/null 2>&1; then
  log_error "未找到 bash，无法恢复默认 shell。"
  return 1
fi

if ! command -v chsh >/dev/null 2>&1; then
  log_error "未找到 chsh；请手动修改默认 shell。"
  return 1
fi

BASH_PATH="$(command -v bash)"
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  CURRENT_USER="$SUDO_USER"
else
  CURRENT_USER="${USER:-$(id -un)}"
fi

if [[ "$CURRENT_USER" == "root" ]]; then
  log_warn "当前目标用户是 root；如果你想修改普通用户默认 shell，请不要直接用 sudo 运行整个脚本。"
fi

CURRENT_LOGIN_SHELL="${SHELL:-}"
if command -v getent >/dev/null 2>&1; then
  CURRENT_LOGIN_SHELL="$(getent passwd "$CURRENT_USER" 2>/dev/null | awk -F: '{print $7}')"
fi

if [[ "$CURRENT_LOGIN_SHELL" == "$BASH_PATH" ]]; then
  log_ok "$CURRENT_USER 的默认 shell 已是 $BASH_PATH"
  return 0
fi

if [[ -f /etc/shells ]] && ! grep -qx "$BASH_PATH" /etc/shells; then
  log_warn "$BASH_PATH 不在 /etc/shells 中，尝试追加。"
  if ! printf '%s\n' "$BASH_PATH" | dot_sudo tee -a /etc/shells >/dev/null; then
    log_error "无法写入 /etc/shells。"
    return 1
  fi
fi

if ! chsh -s "$BASH_PATH" "$CURRENT_USER"; then
  log_error "chsh 执行失败；请稍后手动运行: chsh -s \"$BASH_PATH\" \"$CURRENT_USER\""
  return 1
fi

log_ok "$CURRENT_USER 的默认 shell 已恢复为 $BASH_PATH；请重新登录或重新打开终端后生效。"
