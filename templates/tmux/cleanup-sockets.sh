# 清理可能残留的 tmux socket
if [[ -n "${TMUX:-}" ]]; then
  log_warn "当前 shell 正在 tmux 内运行，跳过 socket 清理。"
  log_warn "如遇到新旧 tmux 二进制混用问题，请退出所有 tmux 会话后手动执行：tmux kill-server && rm -rf /tmp/tmux-$(id -u)"
  return 0
fi

if command -v tmux >/dev/null 2>&1 && pgrep -u "$(id -u)" -x tmux >/dev/null 2>&1; then
  log_info "停止当前用户的 tmux server..."
  tmux kill-server 2>/dev/null || log_warn "tmux kill-server 未成功，继续清理 socket。"
fi

TMUX_SOCKET_DIR="/tmp/tmux-$(id -u)"
if [[ -d "$TMUX_SOCKET_DIR" ]]; then
  log_info "清理 $TMUX_SOCKET_DIR"
  rm -rf "$TMUX_SOCKET_DIR" || {
    log_error "清理 tmux socket 目录失败: $TMUX_SOCKET_DIR"
    return 1
  }
fi

log_ok "tmux socket 清理完成"
